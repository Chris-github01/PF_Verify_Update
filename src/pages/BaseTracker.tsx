import { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface BaseTrackerProps {
  projectId: string;
}

interface BaseTrackerRow {
  id: string;
  section: string;
  system_id: string;
  description: string;
  size: string;
  frr: string;
  qty_base: number;
  unit: string;
  unit_rate: number;
  total: number;
  drawing_ref: string;
  status: string;
  material: string;
  notes: string;
  claim_period: string | null;
  claim_qty: number;
  previous_qty: number;
  updated_at: string;
}

export default function BaseTracker({ projectId }: BaseTrackerProps) {
  const [items, setItems] = useState<BaseTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBaseTrackerData();
  }, [projectId]);

  const loadBaseTrackerData = async () => {
    setLoading(true);
    try {
      const { data: baseData, error: baseError } = await supabase
        .from('base_tracker')
        .select('*')
        .eq('project_id', projectId)
        .order('section', { ascending: true })
        .order('system_id', { ascending: true });

      if (baseError) throw baseError;

      const processedData = (baseData || []).map(item => ({
        ...item,
        claim_period: item.claim_period || null,
        claim_qty: item.claim_qty || 0,
        previous_qty: item.previous_qty || 0,
      }));

      setItems(processedData);
    } catch (error) {
      console.error('Error loading base tracker data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalPrice = (qty: number, rate: number): number => {
    return qty * rate;
  };

  const calculateTotalQty = (claimQty: number, previousQty: number): number => {
    return claimQty + previousQty;
  };

  const calculateClaimAmount = (claimQty: number, rate: number): number => {
    return claimQty * rate;
  };

  const calculateExceeding = (totalQty: number, qtyContract: number): number => {
    const exceeding = totalQty - qtyContract;
    return exceeding > 0 ? exceeding : 0;
  };

  const getSummary = () => {
    const contractSum = items.reduce((sum, item) => {
      return sum + calculateTotalPrice(item.qty_base, item.unit_rate);
    }, 0);

    const thisClaim = items.reduce((sum, item) => {
      return sum + calculateClaimAmount(item.claim_qty, item.unit_rate);
    }, 0);

    return { contractSum, thisClaim };
  };

  const handleExportExcel = () => {
    const exportData = items.map((item) => {
      const totalPrice = calculateTotalPrice(item.qty_base, item.unit_rate);
      const totalQty = calculateTotalQty(item.claim_qty, item.previous_qty);
      const claimAmount = calculateClaimAmount(item.claim_qty, item.unit_rate);
      const exceeding = calculateExceeding(totalQty, item.qty_base);

      return {
        'Section': item.section,
        'Code': item.system_id,
        'Description': item.description,
        'Size': item.size,
        'Substrate & Fire rating': `${item.material || ''} ${item.frr || ''}`.trim(),
        'Qty (Contract)': item.qty_base,
        'Unit': item.unit,
        'Unit Rate': item.unit_rate,
        'Total Price (Contract)': totalPrice,
        'Claim Period': item.claim_period || '',
        'Claim Qty': item.claim_qty,
        'Previous Qty': item.previous_qty,
        'Total Qty': totalQty,
        'Rates': item.unit_rate,
        'Claim Amount': claimAmount,
        'Exceeding contract works': exceeding,
        'Notes': item.notes,
        'Last Updated': new Date(item.updated_at).toLocaleDateString(),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Base Tracker');

    const summary = getSummary();
    const summaryData = [
      [''],
      ['Summary'],
      ['Contract Sum', summary.contractSum],
      ['This Claim', summary.thisClaim],
    ];
    XLSX.utils.sheet_add_aoa(ws, summaryData, { origin: -1 });

    XLSX.writeFile(wb, `BaseTracker_${projectId}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    const exportData = items.map((item) => {
      const totalPrice = calculateTotalPrice(item.qty_base, item.unit_rate);
      const totalQty = calculateTotalQty(item.claim_qty, item.previous_qty);
      const claimAmount = calculateClaimAmount(item.claim_qty, item.unit_rate);
      const exceeding = calculateExceeding(totalQty, item.qty_base);

      return {
        'Section': item.section,
        'Code': item.system_id,
        'Description': item.description,
        'Size': item.size,
        'Substrate & Fire rating': `${item.material || ''} ${item.frr || ''}`.trim(),
        'Qty (Contract)': item.qty_base,
        'Unit': item.unit,
        'Unit Rate': item.unit_rate,
        'Total Price (Contract)': totalPrice,
        'Claim Period': item.claim_period || '',
        'Claim Qty': item.claim_qty,
        'Previous Qty': item.previous_qty,
        'Total Qty': totalQty,
        'Rates': item.unit_rate,
        'Claim Amount': claimAmount,
        'Exceeding contract works': exceeding,
        'Notes': item.notes,
        'Last Updated': new Date(item.updated_at).toLocaleDateString(),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `BaseTracker_${projectId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading base tracker data...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg mb-2">No base tracker data available</p>
        <p className="text-gray-400">Create base tracker items from the Award Report page</p>
      </div>
    );
  }

  const summary = getSummary();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Base Tracker</h1>
          <p className="text-sm text-gray-600 mt-1">
            Contract baseline with {items.length} items
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            <FileSpreadsheet size={18} />
            Export Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Section</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Code</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Size</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Substrate & Fire Rating</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Qty (Contract)</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Unit</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Unit Rate</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase bg-blue-50">Total Price (Contract)</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Claim Period</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Claim Qty</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Previous Qty</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase bg-blue-50">Total Qty</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase bg-blue-50">Rates</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase bg-green-50">Claim Amount</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase bg-amber-50">Exceeding Contract Works</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Notes</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => {
                const totalPrice = calculateTotalPrice(item.qty_base, item.unit_rate);
                const totalQty = calculateTotalQty(item.claim_qty, item.previous_qty);
                const claimAmount = calculateClaimAmount(item.claim_qty, item.unit_rate);
                const exceeding = calculateExceeding(totalQty, item.qty_base);

                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{item.section}</td>
                    <td className="px-3 py-2 text-gray-900 font-mono text-xs">{item.system_id}</td>
                    <td className="px-3 py-2 text-gray-900 max-w-xs">{item.description}</td>
                    <td className="px-3 py-2 text-gray-900">{item.size}</td>
                    <td className="px-3 py-2 text-gray-900">{`${item.material || ''} ${item.frr || ''}`.trim()}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{item.qty_base.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center text-gray-900">{item.unit}</td>
                    <td className="px-3 py-2 text-right text-gray-900">${item.unit_rate.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 font-semibold bg-blue-50">${totalPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{item.claim_period || '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{item.claim_qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{item.previous_qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 font-semibold bg-blue-50">{totalQty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 bg-blue-50">${item.unit_rate.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 font-semibold bg-green-50">${claimAmount.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${exceeding > 0 ? 'text-red-700 bg-red-50' : 'text-gray-900 bg-amber-50'}`}>
                      {exceeding.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{item.notes}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{new Date(item.updated_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="text-sm text-gray-600 mb-1">Contract Sum</div>
            <div className="text-3xl font-bold text-gray-900">
              ${summary.contractSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">This Claim</div>
            <div className="text-3xl font-bold text-green-600">
              ${summary.thisClaim.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
