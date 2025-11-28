import { useState, useEffect } from 'react';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { RevisionImportRequest } from '../types/revision.types';

interface RevisionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onImportComplete?: (newQuoteId: string) => void;
}

interface ExistingSupplier {
  supplier_name: string;
  latest_revision_number: number;
  total_price: number;
  last_updated: string;
}

export function RevisionImportModal({
  isOpen,
  onClose,
  projectId,
  onImportComplete
}: RevisionImportModalProps) {
  const [suppliers, setSuppliers] = useState<ExistingSupplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rfiReference, setRfiReference] = useState('');
  const [rfiReason, setRfiReason] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && projectId) {
      loadExistingSuppliers();
    }
  }, [isOpen, projectId]);

  const loadExistingSuppliers = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('quotes')
        .select('supplier_name, revision_number, total_price, created_at, organisation_id')
        .eq('project_id', projectId)
        .eq('is_latest', true)
        .order('supplier_name');

      if (fetchError) throw fetchError;

      const supplierMap = new Map<string, ExistingSupplier>();

      data?.forEach((quote) => {
        if (!supplierMap.has(quote.supplier_name)) {
          supplierMap.set(quote.supplier_name, {
            supplier_name: quote.supplier_name,
            latest_revision_number: quote.revision_number || 1,
            total_price: quote.total_price || 0,
            last_updated: quote.created_at
          });
        }
      });

      setSuppliers(Array.from(supplierMap.values()));
    } catch (err) {
      console.error('Error loading suppliers:', err);
      setError('Failed to load existing suppliers');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        'application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a PDF or Excel file');
        return;
      }

      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }

      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupplier) {
      setError('Please select a supplier');
      return;
    }

    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      // Get the original quote for this supplier
      const { data: originalQuote, error: fetchError } = await supabase
        .from('quotes')
        .select('id, revision_number, organisation_id')
        .eq('project_id', projectId)
        .eq('supplier_name', selectedSupplier)
        .eq('is_latest', true)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!originalQuote) throw new Error('Original quote not found');

      const nextRevisionNumber = (originalQuote.revision_number || 1) + 1;

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${projectId}/${selectedSupplier}_v${nextRevisionNumber}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('quotes')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('quotes')
        .getPublicUrl(fileName);

      // Create new quote revision
      const { data: newQuote, error: insertError } = await supabase
        .from('quotes')
        .insert({
          project_id: projectId,
          organisation_id: originalQuote.organisation_id,
          supplier_name: selectedSupplier,
          revision_number: nextRevisionNumber,
          is_latest: true,
          parent_quote_id: originalQuote.id,
          revised_at: new Date().toISOString(),
          rfi_reference: rfiReference || null,
          revision_reason: rfiReason || null,
          file_url: publicUrl,
          filename: file.name,
          status: 'pending',
          total_price: 0  // Will be updated after parsing
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Timeline event is automatically created by database trigger

      // Trigger parsing pipeline using the same edge function as regular imports
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('supplierName', selectedSupplier);
      formData.append('organisationId', originalQuote.organisation_id);
      formData.append('quoteId', newQuote.id); // Pass the quote ID to update it

      const jobUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start_parsing_job`;
      const jobHeaders = {
        'Authorization': `Bearer ${session.access_token}`,
      };

      const response = await fetch(jobUrl, {
        method: 'POST',
        headers: jobHeaders,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start parsing job: ${errorText}`);
      }

      onImportComplete?.(newQuote.id);
      onClose();
    } catch (err: any) {
      console.error('Error uploading revision:', err);
      setError(err.message || 'Failed to upload revision');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const selectedSupplierInfo = suppliers.find(s => s.supplier_name === selectedSupplier);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Import Updated Quote / RFI
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Supplier
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Choose existing supplier...</option>
              {suppliers.map((supplier) => (
                <option key={supplier.supplier_name} value={supplier.supplier_name}>
                  {supplier.supplier_name} (v{supplier.latest_revision_number}) - ${supplier.total_price.toLocaleString()}
                </option>
              ))}
            </select>
            {selectedSupplierInfo && (
              <p className="mt-2 text-sm text-gray-600">
                Current version: v{selectedSupplierInfo.latest_revision_number} •
                Last updated: {new Date(selectedSupplierInfo.last_updated).toLocaleDateString()}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Revised Quote
            </label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                {file ? (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <FileText className="w-10 h-10 text-blue-600 mb-2" />
                    <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">PDF, Excel up to 50MB</p>
                  </div>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls"
                  onChange={handleFileChange}
                  required
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              RFI Reference (Optional)
            </label>
            <input
              type="text"
              value={rfiReference}
              onChange={(e) => setRfiReference(e.target.value)}
              placeholder="e.g., RFI-2024-001"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Revision
            </label>
            <textarea
              value={rfiReason}
              onChange={(e) => setRfiReason(e.target.value)}
              placeholder="e.g., Price update following RFI response, Specification change..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>


          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isUploading || !selectedSupplier || !file}
            >
              {isUploading ? 'Uploading...' : 'Import Revision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
