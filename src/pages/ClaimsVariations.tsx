import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Upload, Download, Settings, FileText, AlertTriangle } from 'lucide-react';
import { getPageUIState, setProjectUIState } from '../lib/uiState';

interface ClaimsVariationsProps {
  projectId: string;
  projectName: string;
}

type ActiveTab = 'claims' | 'variations';

export default function ClaimsVariations({ projectId, projectName }: ClaimsVariationsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('claims');
  const [period, setPeriod] = useState<string>(() => {
    const saved = getPageUIState<{ period?: string }>(projectId, 'claims');
    return saved?.period || 'all';
  });
  const [variationFilters, setVariationFilters] = useState<string[]>(() => {
    const saved = getPageUIState<{ filters?: { status?: string[] } }>(projectId, 'variations');
    return saved?.filters?.status || [];
  });

  useEffect(() => {
    setProjectUIState(projectId, 'claims', { period });
  }, [projectId, period]);

  useEffect(() => {
    setProjectUIState(projectId, 'variations', { filters: { status: variationFilters } });
  }, [projectId, variationFilters]);

  // TODO: implement fuzzy match + auto-detect rules

  if (!projectId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <div className="card max-w-md text-center">
          <div className="metric-icon primary mx-auto mb-4">
            <DollarSign className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Select or Create a Project</h3>
          <p className="text-gray-600 mb-6">
            Choose a project to access Claims & Variations features
          </p>
          <button className="btn-primary">
            Go to Project Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="metric-icon primary">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Claims & Variations</h2>
              <p className="text-gray-600 mt-1">
                Reconcile payment claims to baseline and manage change
              </p>
            </div>
          </div>
          <div className="px-4 py-2 bg-gray-100 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Project: {projectName}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="metric-tile">
            <div>
              <div className="metric-label">Overclaimed</div>
              <div className="metric-value text-red-600">$0</div>
            </div>
            <div className="metric-icon danger">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="metric-tile">
            <div>
              <div className="metric-label">Underclaimed</div>
              <div className="metric-value" style="color: var(--warning)">$0</div>
            </div>
            <div className="metric-icon warning">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <div className="metric-tile">
            <div>
              <div className="metric-label">Unmatched</div>
              <div className="metric-value">0</div>
            </div>
            <div className="metric-icon primary">
              <FileText className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
          <button
            onClick={() => setActiveTab('claims')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'claims'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Claims Reconciliation
          </button>
          <button
            onClick={() => setActiveTab('variations')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'variations'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Variations Register
          </button>
        </div>
        <div className="flex gap-2">
          <button
            disabled
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Upload className="w-5 h-5 text-gray-400" />
          </button>
          <button
            disabled
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Download className="w-5 h-5 text-gray-400" />
          </button>
          <button
            disabled
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Settings className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {activeTab === 'claims' && (
        <>
          <div className="flex items-center gap-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input-field"
            >
              <option value="all">All Periods</option>
              <option value="2024-01">January 2024</option>
              <option value="2024-02">February 2024</option>
              <option value="2024-03">March 2024</option>
            </select>
            <button
              disabled
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              Import Claim XLSX
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Unit</th>
                    <th className="text-right">Qty (Base)</th>
                    <th className="text-right">Qty (Claimed)</th>
                    <th className="text-right">Delta</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Amount</th>
                    <th className="text-center">Match Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-lg font-medium mb-2 text-gray-900">No Claims Data</p>
                      <p className="text-sm mb-4 text-gray-600">
                        Import payment claims to reconcile against baseline
                      </p>
                      <button
                        className="text-blue-600 hover:text-blue-700 transition-colors text-sm font-medium flex items-center gap-2 mx-auto"
                      >
                        <FileText className="w-4 h-4" />
                        Learn more
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'variations' && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {['Pending', 'Approved', 'Rejected'].map((status) => (
                <label key={status} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={variationFilters.includes(status)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVariationFilters([...variationFilters, status]);
                      } else {
                        setVariationFilters(variationFilters.filter((s) => s !== status));
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {status}
                </label>
              ))}
            </div>
            <button
              disabled
              className="ml-auto px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Auto-Detect Variations
            </button>
            <button
              disabled
              className="px-4 py-2 glass-card text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Register
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card text-center">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-lg font-medium text-gray-900 mb-2">No Variations</p>
              <p className="text-sm text-gray-600 mb-4">
                Variations will appear here once detected or manually added
              </p>
              <button
                className="text-blue-600 hover:text-blue-700 transition-colors text-sm font-medium flex items-center gap-2 mx-auto"
              >
                <FileText className="w-4 h-4" />
                Learn more
              </button>
            </div>
          </div>
        </>
      )}

      <div className="card flex items-center gap-3 text-gray-600 text-sm">
        <DollarSign className="w-5 h-5 icon-blue" />
        <span>Claims & Variations: Reconciliation & Change Management</span>
      </div>
    </motion.div>
  );
}
