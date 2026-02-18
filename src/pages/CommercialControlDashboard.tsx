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
import { generateCommercialBaseline } from '../lib/commercial/baselineGenerator';

interface CommercialMetrics {
  originalContractValue: number;
  certifiedToDate: number;
  remainingExposure: number;
  variationsApproved: number;
  variationsPending: number;
  netForecastFinalCost: number;
}

interface TradeMetrics {
  awardApprovalId: string;
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
  totalValue: number;
}

export default function CommercialControlDashboard() {
  const [projectId, setProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null);
  const [tradeMetrics, setTradeMetrics] = useState<TradeMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      console.log('[Commercial Dashboard] Starting dashboard load...');

      // Get current project from user preferences
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Commercial Dashboard] Current user:', user?.id);
      if (!user) {
        console.error('[Commercial Dashboard] No user found!');
        return;
      }

      const { data: prefs, error: prefsError } = await supabase
        .from('user_preferences')
        .select('last_project_id, last_organisation_id')
        .eq('user_id', user.id)
        .single();

      console.log('[Commercial Dashboard] User preferences:', { prefs, prefsError });

      if (!prefs?.last_project_id) {
        console.error('[Commercial Dashboard] No current project set!');
        return;
      }

      setProjectId(prefs.last_project_id);

      // Get project details including organisation_id
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('name, organisation_id, trade')
        .eq('id', prefs.last_project_id)
        .single();

      console.log('[Commercial Dashboard] Project details:', { project, projectError });

      if (project) {
        setProjectName(project.name);
      }

      // Load commercial metrics
      await loadCommercialMetrics(prefs.last_project_id);
      await loadTradeMetrics(prefs.last_project_id);

    } catch (error) {
      console.error('[Commercial Dashboard] Error loading:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCommercialMetrics(projId: string) {
    // Get the most recent award approval for this project (only one awarded supplier)
    const { data: awards } = await supabase
      .from('award_approvals')
      .select('id, final_approved_quote_id')
      .eq('project_id', projId)
      .order('approved_at', { ascending: false })
      .limit(1);

    if (!awards || awards.length === 0) {
      setMetrics({
        originalContractValue: 0,
        certifiedToDate: 0,
        remainingExposure: 0,
        variationsApproved: 0,
        variationsPending: 0,
        netForecastFinalCost: 0
      });
      return;
    }

    // Calculate original contract value from the single awarded supplier
    // CRITICAL: Use ONLY 'awarded_item' line types (exclude allowances and retention)
    const award = awards[0];
    let baseContractValue = 0;

    const { data: baselineItems } = await supabase
      .from('commercial_baseline_items')
      .select('line_amount, line_type')
      .eq('award_approval_id', award.id)
      .eq('is_active', true)
      .eq('line_type', 'awarded_item'); // Only include actual awarded items

    if (baselineItems && baselineItems.length > 0) {
      baseContractValue = baselineItems.reduce((sum, item) => sum + (item.line_amount || 0), 0);
    } else {
      // Fallback: get value from quote_items if no baseline exists
      const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('quantity, unit_price')
        .eq('quote_id', award.final_approved_quote_id);

      baseContractValue = (quoteItems || []).reduce((sum, item) => {
        return sum + ((item.quantity || 0) * (item.unit_price || 0));
      }, 0);
    }

    // Get certified claims (actual money certified)
    const { data: claims } = await supabase
      .from('base_tracker_claims')
      .select('certified_amount')
      .eq('project_id', projId)
      .eq('status', 'Certified');

    const certified = (claims || []).reduce((sum, claim) => sum + (claim.certified_amount || 0), 0);

    // Get variations
    const { data: variations } = await supabase
      .from('variation_register')
      .select('amount, status')
      .eq('project_id', projId);

    const approvedVOs = (variations || [])
      .filter(v => v.status === 'Approved')
      .reduce((sum, v) => sum + (v.amount || 0), 0);

    const pendingVOs = (variations || [])
      .filter(v => v.status === 'Submitted')
      .reduce((sum, v) => sum + (v.amount || 0), 0);

    setMetrics({
      originalContractValue: baseContractValue,
      certifiedToDate: certified,
      remainingExposure: baseContractValue - certified,
      variationsApproved: approvedVOs,
      variationsPending: pendingVOs,
      netForecastFinalCost: baseContractValue + approvedVOs + (pendingVOs * 0.7)
    });
  }

  async function loadTradeMetrics(projId: string) {
    console.log('[Commercial Dashboard] Loading trade metrics for project:', projId);

    // Debug: Check current user
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[Commercial Dashboard] Current user:', user?.email, user?.id);

    // Debug: Check organisation membership
    const { data: membership, error: memberError } = await supabase
      .from('organisation_members')
      .select('organisation_id, role, status')
      .eq('user_id', user?.id || '');

    console.log('[Commercial Dashboard] User memberships:', { membership, memberError });

    // Get the most recent awarded supplier for this project's trade
    // Note: Only show ONE supplier per trade (the most recently approved)
    const { data: awards, error: awardsError } = await supabase
      .from('award_approvals')
      .select(`
        id,
        final_approved_supplier,
        final_approved_quote_id,
        project_id,
        organisation_id,
        approved_at
      `)
      .eq('project_id', projId)
      .order('approved_at', { ascending: false })
      .limit(1); // Only get the most recent approval

    console.log('[Commercial Dashboard] Awards query result:', {
      awards,
      awardsError,
      count: awards?.length || 0,
      errorDetails: awardsError?.message,
      errorCode: awardsError?.code
    });

    if (awardsError) {
      console.error('[Commercial Dashboard] Error fetching awards:', awardsError);
      console.error('[Commercial Dashboard] This is likely an RLS permissions issue');
      setTradeMetrics([]);
      return;
    }

    if (!awards || awards.length === 0) {
      console.log('[Commercial Dashboard] No awards found for project:', projId);
      console.log('[Commercial Dashboard] This could mean: 1) No supplier awarded yet, or 2) RLS blocking access');
      setTradeMetrics([]);
      return;
    }

    console.log('[Commercial Dashboard] Found', awards.length, 'awards');

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
    console.log('[Commercial Dashboard] Quote IDs from awards:', quoteIds);

    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('id, supplier_id, supplier_name')
      .in('id', quoteIds);

    console.log('[Commercial Dashboard] Quotes fetched:', { quotes, quotesError, count: quotes?.length || 0 });

    // Create a map of quote_id to supplier info
    const quoteMap = new Map();
    (quotes || []).forEach((q: any) => {
      quoteMap.set(q.id, {
        supplierId: q.supplier_id || q.id, // Fallback to quote_id if supplier_id is null
        supplierName: q.supplier_name
      });
    });

    console.log('[Commercial Dashboard] Quote map created with', quoteMap.size, 'entries');

    // CRITICAL FIX: Get contract value from quote_items (not boq_lines)
    // boq_lines doesn't have pricing - pricing is in quote_items for awarded quotes
    const groupedMap = new Map<string, any>();

    // Process each award and get its quote value
    for (const award of awards) {
      console.log('[Commercial Dashboard] Processing award:', award.id, 'with quote:', award.final_approved_quote_id);

      const supplierInfo = quoteMap.get(award.final_approved_quote_id);
      if (!supplierInfo) {
        console.warn('[Commercial Dashboard] ⚠️ No supplier info found for quote:', award.final_approved_quote_id);
        continue;
      }

      console.log('[Commercial Dashboard] Found supplier info:', supplierInfo);

      // Check if commercial baseline exists for this award
      const { data: existingBaseline } = await supabase
        .from('commercial_baseline_items')
        .select('id')
        .eq('award_approval_id', award.id)
        .limit(1)
        .single();

      // Auto-generate baseline if it doesn't exist
      if (!existingBaseline) {
        console.log(`[Commercial Control] Auto-generating baseline for award ${award.id}`);
        try {
          await generateCommercialBaseline({
            projectId: award.project_id,
            awardApprovalId: award.id,
            quoteId: award.final_approved_quote_id,
            tradeKey: tradeKey || 'general',
            includeAllowances: true,
            includeRetention: true,
            retentionPercentage: 5
          });
          console.log(`[Commercial Control] ✅ Baseline generated for award ${award.id}`);
        } catch (error) {
          console.error(`[Commercial Control] Failed to generate baseline for award ${award.id}:`, error);
        }
      }

      // Get base contract value from commercial baseline (ONLY awarded items, no allowances/retention)
      const { data: baselineItems } = await supabase
        .from('commercial_baseline_items')
        .select('line_amount, line_type')
        .eq('award_approval_id', award.id)
        .eq('is_active', true)
        .eq('line_type', 'awarded_item'); // Only base contract items

      let totalContractValue = 0;
      if (baselineItems && baselineItems.length > 0) {
        // Use baseline awarded items only (excludes allowances and retention)
        totalContractValue = baselineItems.reduce((sum, item) => sum + (item.line_amount || 0), 0);
      } else {
        // Fallback to quote_items (base value only)
        const { data: quoteItems } = await supabase
          .from('quote_items')
          .select('quantity, unit_price')
          .eq('quote_id', award.final_approved_quote_id);

        totalContractValue = (quoteItems || []).reduce((sum, item) => {
          const qty = item.quantity || 0;
          const price = item.unit_price || 0;
          return sum + (qty * price);
        }, 0);
      }

      const key = `${tradeKey}_${supplierInfo.supplierId}`;
      console.log('[Commercial Dashboard] Contract value calculated:', totalContractValue);
      console.log('[Commercial Dashboard] Creating/updating group with key:', key);

      if (!groupedMap.has(key)) {
        const groupData = {
          tradeKey: tradeKey,
          tradeName: tradeKey?.replace(/_/g, ' ').toUpperCase(),
          supplierId: supplierInfo.supplierId,
          supplierName: supplierInfo.supplierName || award.final_approved_supplier,
          totalValue: totalContractValue,
          awardId: award.id,
          quoteId: award.final_approved_quote_id,
          lines: []
        };
        groupedMap.set(key, groupData);
        console.log('[Commercial Dashboard] ✅ Added group:', groupData);
      } else {
        console.log('[Commercial Dashboard] Group already exists for key:', key);
      }
    }

    console.log('[Commercial Dashboard] Grouped map final size:', groupedMap.size);

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
        awardApprovalId: group.awardId,
        tradeKey: group.tradeKey,
        tradeName: group.tradeName,
        totalValue: group.totalValue,
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

    console.log('[Commercial Dashboard] Final trade metrics:', trades);
    console.log('[Commercial Dashboard] Setting', trades.length, 'trade metrics');
    setTradeMetrics(trades);
  }

  async function handleExportBaseTracker(trade: TradeMetrics) {
    try {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      await downloadBaseTracker({
        projectId,
        projectName,
        awardApprovalId: trade.awardApprovalId,
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

  async function handleGenerateBaselines() {
    setGenerating(true);
    try {
      console.log('[Commercial Control] Manual baseline generation triggered');

      // Get all award approvals for this project
      const { data: awards } = await supabase
        .from('award_approvals')
        .select('id, project_id, final_approved_quote_id')
        .eq('project_id', projectId);

      if (!awards || awards.length === 0) {
        alert('No approved suppliers found. Please award a supplier first.');
        return;
      }

      // Get project trade
      const { data: project } = await supabase
        .from('projects')
        .select('trade')
        .eq('id', projectId)
        .single();

      const tradeKey = project?.trade || 'general';

      // Generate baseline for each award
      let generated = 0;
      let alreadyExists = 0;
      let errors: string[] = [];

      for (const award of awards) {
        console.log('[Commercial Control] Generating baseline for award:', award.id);
        console.log('[Commercial Control] Quote ID:', award.final_approved_quote_id);

        // First check if quote has items
        const { data: quoteItems, error: quoteCheckError } = await supabase
          .from('quote_items')
          .select('id')
          .eq('quote_id', award.final_approved_quote_id);

        console.log('[Commercial Control] Quote items check:', {
          quoteId: award.final_approved_quote_id,
          itemCount: quoteItems?.length || 0,
          error: quoteCheckError
        });

        if (!quoteItems || quoteItems.length === 0) {
          const msg = `No quote items found for quote ${award.final_approved_quote_id}`;
          console.error('[Commercial Control]', msg);
          errors.push(msg);
          continue;
        }

        try {
          const result = await generateCommercialBaseline({
            projectId: award.project_id,
            awardApprovalId: award.id,
            quoteId: award.final_approved_quote_id,
            tradeKey,
            includeAllowances: true,
            includeRetention: true,
            retentionPercentage: 5
          });

          console.log(`[Commercial Control] ✅ Generated baseline with ${result.itemCount} items, total value: $${result.totalValue}`);
          generated++;
        } catch (error: any) {
          if (error.message?.includes('already exists')) {
            console.log(`[Commercial Control] Baseline already exists for award ${award.id}`);
            alreadyExists++;
          } else {
            console.error(`[Commercial Control] Error generating baseline for award ${award.id}:`, error);
            errors.push(error.message || String(error));
          }
        }
      }

      // Show detailed message
      let message = '';
      if (generated > 0) {
        message += `Successfully generated ${generated} baseline(s).\n`;
      }
      if (alreadyExists > 0) {
        message += `${alreadyExists} baseline(s) already exist.\n`;
      }
      if (errors.length > 0) {
        message += `Errors: ${errors.join(', ')}`;
      }

      if (message === '') {
        message = 'No action taken. Check console for details.';
      }

      alert(message);
      await loadDashboard(); // Reload dashboard
    } catch (error: any) {
      console.error('[Commercial Control] Error generating baselines:', error);
      alert(`Failed to generate baselines: ${error.message || error}`);
    } finally {
      setGenerating(false);
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
                label="Original Contract Value"
                value={`$${metrics.originalContractValue.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={TrendingUp}
                tone="navy"
              />
              <SummaryStatCard
                label="Certified to Date"
                value={`$${metrics.certifiedToDate.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={CheckCircle}
                tone="success"
                statusDot
              />
              <SummaryStatCard
                label="Remaining Exposure"
                value={`$${metrics.remainingExposure.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={Clock}
                tone="orange"
              />
              <SummaryStatCard
                label="Variations Approved"
                value={`$${metrics.variationsApproved.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={CheckCircle}
                tone="success"
              />
              <SummaryStatCard
                label="Variations Pending"
                value={`$${metrics.variationsPending.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={AlertCircle}
                tone="orange"
              />
              <SummaryStatCard
                label="Net Forecast Final Cost"
                value={`$${metrics.netForecastFinalCost.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`}
                icon={TrendingUp}
                tone="navy"
              />
            </div>
          </div>
        )}

        {/* Trade-Level Metrics */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Trade Performance</h2>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateBaselines}
                disabled={generating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Generating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Generate Baselines
                  </>
                )}
              </button>
              <button
                onClick={handleExportVOTracker}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export VO Tracker
              </button>
            </div>
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
