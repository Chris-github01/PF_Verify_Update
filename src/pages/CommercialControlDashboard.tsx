/**
 * COMMERCIAL CONTROL DASHBOARD
 *
 * Provides live commercial visibility across all trades using Base Tracker + VO data.
 * Shows contract value, certified amounts, remaining exposure, variations, and risk indicators.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardHeader from '../components/DashboardHeader';
import SummaryStatCard from '../components/SummaryStatCard';
import { AlertTriangle, TrendingUp, CheckCircle, Clock, AlertCircle, Download } from 'lucide-react';
import { downloadBaseTracker } from '../lib/export/baseTrackerExport';
import { downloadVOTracker } from '../lib/export/voTrackerExport';

interface CommercialMetrics {
  originalContractValue: number;
  certifiedToDate: number;
  remainingExposure: number;
  variationsApproved: number;
  variationsPending: number;
  netForecastFinalCost: number;
}

interface TradeMetrics {
  tradeKey: string;
  tradeName: string;
  percentComplete: number;
  amountRemaining: number;
  overClaimFlags: number;
  underClaimFlags: number;
  voCount: number;
  voValuePending: number;
  supplierName: string;
  supplierId: string;
}

export default function CommercialControlDashboard() {
  const [projectId, setProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null);
  const [tradeMetrics, setTradeMetrics] = useState<TradeMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);

      // Get current project from user preferences
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('current_project_id')
        .eq('user_id', user.id)
        .single();

      if (!prefs?.current_project_id) return;

      setProjectId(prefs.current_project_id);

      // Get project details
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', prefs.current_project_id)
        .single();

      if (project) {
        setProjectName(project.name);
      }

      // Load commercial metrics
      await loadCommercialMetrics(prefs.current_project_id);
      await loadTradeMetrics(prefs.current_project_id);

    } catch (error) {
      console.error('[Commercial Dashboard] Error loading:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCommercialMetrics(projId: string) {
    // Fetch project-level metrics
    const { data: boqLines } = await supabase
      .from('boq_lines')
      .select('contract_qty, contract_rate, quantity, unit_price')
      .eq('project_id', projId);

    const { data: claims } = await supabase
      .from('base_tracker_claims')
      .select('total_claimed_to_date, certified_amount')
      .eq('project_id', projId)
      .eq('status', 'Certified');

    const { data: variations } = await supabase
      .from('variation_register')
      .select('amount, status')
      .eq('project_id', projId);

    // Calculate metrics
    const originalValue = (boqLines || []).reduce((sum, line) => {
      const qty = line.contract_qty || line.quantity || 0;
      const rate = line.contract_rate || line.unit_price || 0;
      return sum + (qty * rate);
    }, 0);

    const certified = (claims || []).reduce((sum, claim) => sum + (claim.certified_amount || 0), 0);

    const approvedVOs = (variations || [])
      .filter(v => v.status === 'Approved')
      .reduce((sum, v) => sum + (v.amount || 0), 0);

    const pendingVOs = (variations || [])
      .filter(v => v.status === 'Submitted')
      .reduce((sum, v) => sum + (v.amount || 0), 0);

    setMetrics({
      originalContractValue: originalValue,
      certifiedToDate: certified,
      remainingExposure: originalValue - certified,
      variationsApproved: approvedVOs,
      variationsPending: pendingVOs,
      netForecastFinalCost: originalValue + approvedVOs + (pendingVOs * 0.7) // Assume 70% of pending will be approved
    });
  }

  async function loadTradeMetrics(projId: string) {
    // FIXED: Query award_approvals instead of non-existent awarded_supplier_id column
    // Get all awarded suppliers for this project
    const { data: awards, error: awardsError } = await supabase
      .from('award_approvals')
      .select(`
        id,
        final_approved_supplier,
        final_approved_quote_id,
        project_id
      `)
      .eq('project_id', projId);

    if (awardsError) {
      console.error('[Commercial Dashboard] Error fetching awards:', awardsError);
      setTradeMetrics([]);
      return;
    }

    if (!awards || awards.length === 0) {
      setTradeMetrics([]);
      return;
    }

    // Get project trade to link awards to BOQ
    const { data: project } = await supabase
      .from('projects')
      .select('trade')
      .eq('id', projId)
      .single();

    if (!project) {
      setTradeMetrics([]);
      return;
    }

    const tradeKey = project.trade;

    // Get quote details for each award to get supplier_id
    const quoteIds = awards.map(a => a.final_approved_quote_id).filter(Boolean);
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, supplier_id, supplier_name')
      .in('id', quoteIds);

    // Create a map of quote_id to supplier info
    const quoteMap = new Map();
    (quotes || []).forEach((q: any) => {
      quoteMap.set(q.id, {
        supplierId: q.supplier_id || q.id, // Fallback to quote_id if supplier_id is null
        supplierName: q.supplier_name
      });
    });

    // Get BOQ lines for this project/trade
    const { data: boqLines } = await supabase
      .from('boq_lines')
      .select('contract_qty, contract_rate, quantity, unit_price, module_key')
      .eq('project_id', projId)
      .eq('module_key', tradeKey);

    // Calculate total contract value for this trade
    const totalContractValue = (boqLines || []).reduce((sum, line) => {
      const qty = line.contract_qty || line.quantity || 0;
      const rate = line.contract_rate || line.unit_price || 0;
      return sum + (qty * rate);
    }, 0);

    // Group awards by trade + supplier
    const groupedMap = new Map<string, any>();

    awards.forEach((award: any) => {
      const supplierInfo = quoteMap.get(award.final_approved_quote_id);
      if (!supplierInfo) return;

      const key = `${tradeKey}_${supplierInfo.supplierId}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          tradeKey: tradeKey,
          tradeName: tradeKey?.replace(/_/g, ' ').toUpperCase(),
          supplierId: supplierInfo.supplierId,
          supplierName: supplierInfo.supplierName || award.final_approved_supplier,
          totalValue: totalContractValue,
          lines: []
        });
      }
    });

    // Fetch claims and VOs for each trade/supplier
    const trades: TradeMetrics[] = [];

    for (const [key, group] of groupedMap.entries()) {
      const { data: claims } = await supabase
        .from('base_tracker_claims')
        .select('total_claimed_to_date')
        .eq('project_id', projId)
        .eq('supplier_id', group.supplierId);

      const totalClaimed = (claims || []).reduce((sum, c) => sum + (c.total_claimed_to_date || 0), 0);

      const { data: vos } = await supabase
        .from('variation_register')
        .select('amount, status')
        .eq('project_id', projId)
        .eq('trade_key', group.tradeKey)
        .eq('supplier_id', group.supplierId);

      const voCount = vos?.length || 0;
      const voPending = (vos || [])
        .filter(v => v.status === 'Submitted')
        .reduce((sum, v) => sum + (v.amount || 0), 0);

      trades.push({
        tradeKey: group.tradeKey,
        tradeName: group.tradeName,
        percentComplete: group.totalValue > 0 ? (totalClaimed / group.totalValue) * 100 : 0,
        amountRemaining: group.totalValue - totalClaimed,
        overClaimFlags: 0, // Would need line-level data
        underClaimFlags: 0,
        voCount,
        voValuePending: voPending,
        supplierName: group.supplierName,
        supplierId: group.supplierId
      });
    }

    setTradeMetrics(trades);
  }

  async function handleExportBaseTracker(trade: TradeMetrics) {
    try {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      await downloadBaseTracker({
        projectId,
        projectName,
        tradeKey: trade.tradeKey,
        supplierId: trade.supplierId,
        supplierName: trade.supplierName,
        period,
        version: 1
      });
    } catch (error: any) {
      alert('Error exporting Base Tracker: ' + error.message);
    }
  }

  async function handleExportVOTracker() {
    try {
      await downloadVOTracker({
        projectId,
        projectName
      });
    } catch (error: any) {
      alert('Error exporting VO Tracker: ' + error.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading commercial dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader
        title="Commercial Control Dashboard"
        subtitle="Live commercial visibility across all trades"
        projectName={projectName}
      />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Project-Level Metrics */}
        {metrics && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <SummaryStatCard
                title="Original Contract Value"
                value={`$${metrics.originalContractValue.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={<TrendingUp className="w-6 h-6" />}
                color="blue"
              />
              <SummaryStatCard
                title="Certified to Date"
                value={`$${metrics.certifiedToDate.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={<CheckCircle className="w-6 h-6" />}
                color="green"
                subtitle={`${((metrics.certifiedToDate / metrics.originalContractValue) * 100).toFixed(1)}% of contract`}
              />
              <SummaryStatCard
                title="Remaining Exposure"
                value={`$${metrics.remainingExposure.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={<Clock className="w-6 h-6" />}
                color="orange"
              />
              <SummaryStatCard
                title="Variations Approved"
                value={`$${metrics.variationsApproved.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={<CheckCircle className="w-6 h-6" />}
                color="green"
              />
              <SummaryStatCard
                title="Variations Pending"
                value={`$${metrics.variationsPending.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={<AlertCircle className="w-6 h-6" />}
                color="yellow"
              />
              <SummaryStatCard
                title="Net Forecast Final Cost"
                value={`$${metrics.netForecastFinalCost.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={<TrendingUp className="w-6 h-6" />}
                color="indigo"
                subtitle={`+${((metrics.netForecastFinalCost - metrics.originalContractValue) / metrics.originalContractValue * 100).toFixed(1)}% vs original`}
              />
            </div>
          </div>
        )}

        {/* Trade-Level Metrics */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Trade Performance</h2>
            <button
              onClick={handleExportVOTracker}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export VO Tracker
            </button>
          </div>

          {tradeMetrics.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No awarded trades found. Award suppliers to see commercial metrics.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trade / Supplier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % Complete
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remaining
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VOs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VO Pending
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tradeMetrics.map((trade) => (
                    <tr key={`${trade.tradeKey}_${trade.supplierId}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{trade.tradeName}</div>
                          <div className="text-sm text-gray-500">{trade.supplierName}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-2.5 mr-3">
                            <div
                              className={`h-2.5 rounded-full ${
                                trade.percentComplete >= 80
                                  ? 'bg-green-600'
                                  : trade.percentComplete >= 50
                                  ? 'bg-yellow-600'
                                  : 'bg-red-600'
                              }`}
                              style={{ width: `${Math.min(trade.percentComplete, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            {trade.percentComplete.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          ${trade.amountRemaining.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {trade.voCount} VOs
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          ${trade.voValuePending.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleExportBaseTracker(trade)}
                          className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          Base Tracker
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Governance Notice */}
        <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded">
          <div className="flex">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-red-800">System Governance Rules</h3>
              <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
                <li>No Base Tracker = No progress claim assessment</li>
                <li>No VO reference = No extra payment beyond baseline</li>
                <li>All Base Tracker exports are logged & immutable</li>
                <li>Variations must be approved before certification</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
