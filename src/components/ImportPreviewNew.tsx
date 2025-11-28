import { useState, useMemo } from 'react';
import { Check, X, Edit2, Save, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Filter } from 'lucide-react';
import SupplierNameInput from './SupplierNameInput';
import type { ParsedQuoteLine, SectionType, SectionConfig, SummaryBlock } from '../types/import.types';

interface ImportPreviewNewProps {
  projectId: string;
  lines: ParsedQuoteLine[];
  summaryBlocks: SummaryBlock[];
  supplierName: string;
  onSupplierNameChange: (name: string) => void;
  onLineUpdate: (id: string, updates: Partial<ParsedQuoteLine>) => void;
  onSave: (selectedLines: ParsedQuoteLine[]) => void;
  onCancel: () => void;
  isSaving?: boolean;
  demoMode?: boolean;
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  { name: 'Electrical Services', enabled: true, count: 0 },
  { name: 'Fire Protection Services', enabled: true, count: 0 },
  { name: 'Hydraulics Services', enabled: true, count: 0 },
  { name: 'Mechanical Services', enabled: true, count: 0 },
  { name: 'Structural Penetrations', enabled: true, count: 0 },
  { name: 'Passive Fire (General)', enabled: true, count: 0 },
  { name: 'Optional Extras', enabled: false, count: 0 },
  { name: 'Excluded', enabled: false, count: 0 },
  { name: 'Summary Blocks', enabled: false, count: 0 },
  { name: 'Admin / Notes / T&Cs', enabled: false, count: 0 },
];

export default function ImportPreviewNew({
  projectId,
  lines,
  summaryBlocks,
  supplierName,
  onSupplierNameChange,
  onLineUpdate,
  onSave,
  onCancel,
  isSaving = false,
  demoMode = false,
}: ImportPreviewNewProps) {
  console.log('[ImportPreviewNew] Rendering with', lines.length, 'lines');
  console.log('[ImportPreviewNew] Supplier name:', supplierName);
  const [sections, setSections] = useState<SectionConfig[]>(() => {
    const uniqueSections = new Set(lines.map(line => line.section));
    console.log('[ImportPreviewNew] All unique sections in lines:', Array.from(uniqueSections));
    console.log('[ImportPreviewNew] Lines sample:', lines.slice(0, 5).map(l => ({ section: l.section, desc: l.description.substring(0, 50) })));

    return DEFAULT_SECTIONS.map(section => {
      const count = lines.filter(line => line.section === section.name).length;
      console.log(`[ImportPreviewNew] Section "${section.name}": ${count} items`);
      return {
        ...section,
        count,
      };
    });
  });

  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ParsedQuoteLine>>({});
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  const filteredLines = useMemo(() => {
    let result = lines.filter(line => {
      const section = sections.find(s => s.name === line.section);
      return section?.enabled ?? false;
    });

    if (showFlaggedOnly) {
      result = result.filter(line => line.flags.length > 0);
    }

    return result.sort((a, b) => {
      if (a.flags.length > 0 && b.flags.length === 0) return -1;
      if (a.flags.length === 0 && b.flags.length > 0) return 1;
      return 0;
    });
  }, [lines, sections, showFlaggedOnly]);

  const stats = useMemo(() => {
    const validLines = lines.filter(line => line.flags.length === 0).length;
    const flaggedLines = lines.filter(line => line.flags.length > 0).length;
    const gapLines = lines.filter(line =>
      !line.unit || !line.size || !line.qty
    ).length;

    const selectedSum = filteredLines.reduce((sum, line) => sum + (line.total || 0), 0);

    return {
      detectedLines: validLines,
      flaggedLines,
      gapLines,
      selectedCount: filteredLines.length,
      selectedSum,
    };
  }, [lines, filteredLines]);

  const toggleSection = (sectionName: SectionType) => {
    setSections(prev =>
      prev.map(s => s.name === sectionName ? { ...s, enabled: !s.enabled } : s)
    );
  };

  const selectAll = () => {
    setSections(prev => prev.map(s => ({ ...s, enabled: true })));
  };

  const selectNone = () => {
    setSections(prev => prev.map(s => ({ ...s, enabled: false })));
  };

  const startEdit = (line: ParsedQuoteLine) => {
    setEditingLine(line.id);
    setEditForm({ ...line });
  };

  const saveEdit = () => {
    if (editingLine && editForm) {
      onLineUpdate(editingLine, editForm);
      setEditingLine(null);
      setEditForm({});
    }
  };

  const cancelEdit = () => {
    setEditingLine(null);
    setEditForm({});
  };

  const handleSave = () => {
    onSave(filteredLines);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      <div className="w-64 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Include in schedule</h3>
        <div className="space-y-2">
          {sections.map(section => (
            <label
              key={section.name}
              className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={() => toggleSection(section.name)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <span className="text-xs text-gray-700 truncate" title={section.name}>
                  {section.name}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-500 ml-2 flex-shrink-0">
                {section.count}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 max-w-md">
              <SupplierNameInput
                projectId={projectId}
                value={supplierName}
                onChange={onSupplierNameChange}
                error={!supplierName.trim() && filteredLines.length > 0 ? 'Supplier name is required' : undefined}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  {stats.detectedLines} Detected
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
                <AlertCircle size={16} className="text-amber-600" />
                <span className="text-sm font-medium text-amber-900">
                  {stats.flaggedLines} Flagged
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
                <Filter size={16} className="text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {stats.gapLines} Gaps
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                Select All
              </button>
              <button
                onClick={selectNone}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
              >
                Select None
              </button>
              <button
                onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  showFlaggedOnly
                    ? 'bg-amber-100 text-amber-900'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Show Flagged Only
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLines.map((line) => (
                  <tr
                    key={line.id}
                    className={`${line.flags.length > 0 ? 'bg-amber-50' : ''} ${
                      editingLine === line.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    {editingLine === line.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editForm.section || ''}
                            onChange={(e) => setEditForm({ ...editForm, section: e.target.value as SectionType })}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editForm.qty || ''}
                            onChange={(e) => setEditForm({ ...editForm, qty: parseFloat(e.target.value) || undefined })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editForm.unit || ''}
                            onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={editForm.rate || ''}
                            onChange={(e) => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || undefined })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-right"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={editForm.total || ''}
                            onChange={(e) => setEditForm({ ...editForm, total: parseFloat(e.target.value) || undefined })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Save">
                              <Save size={14} />
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Cancel">
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-xs text-gray-600">{line.section}</td>
                        <td className="px-4 py-2 text-xs text-gray-900">{line.description}</td>
                        <td className="px-3 py-2 text-xs text-gray-900 text-right">{line.qty || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{line.unit || '-'}</td>
                        <td className="px-4 py-2 text-xs text-gray-900 text-right">
                          {line.rate ? `$${line.rate.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-900 text-right font-medium">
                          {line.total ? `$${line.total.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {line.flags.map((flag, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 rounded"
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => startEdit(line)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-500">Selected Lines</p>
              <p className="text-lg font-bold text-gray-900">{stats.selectedCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Selected Sum</p>
              <p className="text-lg font-bold text-green-600">${stats.selectedSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!supplierName.trim() || filteredLines.length === 0 || isSaving || demoMode}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white text-lg font-bold rounded-lg hover:from-green-700 hover:to-green-600 shadow-lg hover:shadow-xl transition-all disabled:bg-gray-400 disabled:cursor-not-allowed transform hover:scale-105"
            >
              <Check size={20} />
              {isSaving ? 'Saving...' : demoMode ? 'Demo Mode' : 'Proceed with Mapping'}
            </button>
          </div>
        </div>
      </div>

      {summaryBlocks.length > 0 && (
        <div className="w-64 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-y-auto">
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="flex items-center justify-between w-full mb-3"
          >
            <h3 className="text-sm font-semibold text-gray-900">Quote Summary</h3>
            {summaryExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {summaryExpanded && (
            <div className="space-y-2">
              {summaryBlocks.map((block, idx) => (
                <div
                  key={idx}
                  className={`flex justify-between items-center py-2 px-3 rounded ${
                    block.type === 'grand_total'
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50'
                  }`}
                >
                  <span className={`text-xs ${block.type === 'grand_total' ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {block.label}
                  </span>
                  <span className={`text-xs font-medium ${block.type === 'grand_total' ? 'text-blue-900' : 'text-gray-900'}`}>
                    ${block.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
