import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, CheckCircle, AlertCircle, FileCheck, Download, Users, Briefcase, PieChart, BarChart3, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generatePdfWithPrint } from '../lib/reports/modernPdfTemplate';
import { useOrganisation } from '../lib/organisationContext';
import type { DashboardMode } from '../App';

interface ContractManagerProps {
  projectId: string;
  onNavigateBack?: () => void;
  dashboardMode?: DashboardMode;
}

interface ProjectInfo {
  id: string;
  name: string;
  client: string | null;
  updated_at: string;
}

interface AwardInfo {
  supplier_name: string;
  total_amount: number;
  awarded_date?: string;
}

interface ScopeSystem {
  service_type: string;
  coverage: 'full' | 'partial' | 'none';
  item_count: number;
  details: string[];
}

interface Allowance {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  rate: number | null;
  total: number;
  notes: string | null;
  category: string;
  is_provisional: boolean;
  sort_order: number;
}

type TabId = 'summary' | 'scope' | 'inclusions' | 'allowances' | 'variations';

export default function ContractManager({ projectId, onNavigateBack, dashboardMode = 'original' }: ContractManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [loading, setLoading] = useState(true);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [awardInfo, setAwardInfo] = useState<AwardInfo | null>(null);
  const [scopeSystems, setScopeSystems] = useState<ScopeSystem[]>([]);
  const [generatingJunior, setGeneratingJunior] = useState(false);
  const [generatingSenior, setGeneratingSenior] = useState(false);
  const { currentOrganisation } = useOrganisation();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('id, name, client, updated_at, approved_quote_id')
        .eq('id', projectId)
        .maybeSingle();

      if (project) {
        setProjectInfo(project);
      }

      const approvedQuoteId = (project as any)?.approved_quote_id;

      if (approvedQuoteId) {
        const { data: approvedQuote } = await supabase
          .from('quotes')
          .select('supplier_name, total_amount, updated_at')
          .eq('id', approvedQuoteId)
          .maybeSingle();

        if (approvedQuote) {
          setAwardInfo({
            supplier_name: approvedQuote.supplier_name,
            total_amount: approvedQuote.total_amount || 0,
            awarded_date: approvedQuote.updated_at
          });
        }

        const { data: quoteItems } = await supabase
          .from('quote_items')
          .select('scope_category, description, quantity, unit_price, total_price')
          .eq('quote_id', approvedQuoteId);

        if (quoteItems && quoteItems.length > 0) {
          const systemsMap = new Map<string, ScopeSystem>();

          quoteItems.forEach((item: any) => {
            const category = item.scope_category || 'Other Systems';
            if (!systemsMap.has(category)) {
              systemsMap.set(category, {
                service_type: category,
                coverage: 'full',
                item_count: 0,
                details: []
              });
            }
            const system = systemsMap.get(category)!;
            system.item_count += 1;
            if (system.details.length < 5 && item.description) {
              system.details.push(item.description);
            }
          });

          setScopeSystems(Array.from(systemsMap.values()));
        }
      }
    } catch (error) {
      console.error('Error loading contract manager data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateJuniorPack = async () => {
    if (!awardInfo) return;

    setGeneratingJunior(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export_contract_manager`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          mode: 'junior_pack'
        })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const result = await response.json();

      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
      const projectName = projectInfo?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project';
      const filename = `JuniorSiteTeamPack_${projectName}_${timestamp}`;

      generatePdfWithPrint(result.html, filename);

      alert('Print window opened! In the print dialog, select "Save as PDF" or "Microsoft Print to PDF" as your destination.');
    } catch (error) {
      console.error('Export error:', error);
      alert('Could not generate Junior Pack. Please try again.');
    } finally {
      setGeneratingJunior(false);
    }
  };

  const handleGenerateSeniorReport = async () => {
    if (!awardInfo) return;

    setGeneratingSenior(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export_contract_manager`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          mode: 'senior_report'
        })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const result = await response.json();

      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
      const projectName = projectInfo?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project';
      const filename = `SeniorProjectOverview_${projectName}_${timestamp}`;

      generatePdfWithPrint(result.html, filename);

      alert('Print window opened! In the print dialog, select "Save as PDF" or "Microsoft Print to PDF" as your destination.');
    } catch (error) {
      console.error('Export error:', error);
      alert('Could not generate Senior Pack. Please try again.');
    } finally {
      setGeneratingSenior(false);
    }
  };

  const tabs = [
    { id: 'summary' as TabId, label: 'Contract Summary', icon: FileText },
    { id: 'scope' as TabId, label: 'Scope & Systems', icon: CheckCircle },
    { id: 'inclusions' as TabId, label: 'Inclusions & Exclusions', icon: FileCheck },
    { id: 'allowances' as TabId, label: 'Allowances', icon: FileText },
    { id: 'variations' as TabId, label: 'Variations Log', icon: AlertCircle },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Loading contract information...</div>
        </div>
      </div>
    );
  }

  const hasAward = !!awardInfo;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header Navigation */}
      <div className="bg-slate-800/60 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onNavigateBack}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
            </div>

            {hasAward && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateJuniorPack}
                  disabled={generatingJunior}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg"
                >
                  <Users size={16} />
                  {generatingJunior ? 'Generating...' : 'Junior Pack'}
                </button>
                <button
                  onClick={handleGenerateSeniorReport}
                  disabled={generatingSenior}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-md hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg"
                >
                  <Briefcase size={16} />
                  {generatingSenior ? 'Generating...' : 'Senior Pack'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-3">Contract Manager</h1>
          <p className="text-xl text-slate-300 mb-6">Subcontract Scope & Handover Management</p>

          <div className="inline-flex items-center gap-6 text-sm text-slate-400 bg-slate-800/40 px-8 py-3 rounded-lg border border-slate-700/50">
            <div>
              <span className="font-semibold text-slate-300">Project:</span> {projectInfo?.name || 'N/A'}
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div>
              <span className="font-semibold text-slate-300">Client:</span> {projectInfo?.client || 'N/A'}
            </div>
            {hasAward && (
              <>
                <div className="h-4 w-px bg-slate-600"></div>
                <div>
                  <span className="font-semibold text-slate-300">Subcontractor:</span> {awardInfo.supplier_name}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 text-sm text-slate-500">
            Powered by <span className="font-semibold text-orange-500">VerifyTrade</span>
          </div>
        </div>

        {!hasAward ? (
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-12 text-center shadow-xl">
            <AlertCircle className="mx-auto text-orange-500/70 mb-4" size={64} />
            <h3 className="text-2xl font-bold text-white mb-3">No Award Selected</h3>
            <p className="text-slate-300 mb-8 max-w-md mx-auto">
              Select a preferred supplier in your Award Report before using Contract Manager.
            </p>
            <button
              onClick={() => window.location.href = '#/reports'}
              className="px-8 py-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-medium transition-all shadow-lg"
            >
              Go to Reports
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-700/50 mb-8">
              <div className="flex gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-5 py-3 font-medium transition-all rounded-t-lg ${
                        activeTab === tab.id
                          ? 'text-orange-400 bg-slate-800/60 border-b-2 border-orange-500'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                      }`}
                    >
                      <Icon size={18} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-8 shadow-xl">
              {activeTab === 'summary' && <ContractSummaryTab awardInfo={awardInfo} projectInfo={projectInfo} />}
              {activeTab === 'scope' && <ScopeSystemsTab projectId={projectId} scopeSystems={scopeSystems} />}
              {activeTab === 'inclusions' && <InclusionsExclusionsTab />}
              {activeTab === 'allowances' && <AllowancesTab projectId={projectId} />}
              {activeTab === 'variations' && <VariationsLogTab />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContractSummaryTab({ awardInfo, projectInfo }: { awardInfo: AwardInfo | null; projectInfo: ProjectInfo | null }) {
  const totalAmount = awardInfo?.total_amount || 0;
  const retentionRate = 0.03;
  const retentionAmount = totalAmount * retentionRate;
  const netAmount = totalAmount - retentionAmount;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
          <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full"></div>
          Contract Summary
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Subcontractor</label>
            <div className="text-xl text-white font-semibold">{awardInfo?.supplier_name || 'TBC'}</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/10 rounded-xl border border-orange-700/30 p-5 hover:border-orange-600/50 transition-all">
            <label className="block text-xs font-semibold text-orange-300/70 uppercase tracking-wider mb-2">Subcontract Sum</label>
            <div className="text-3xl font-bold text-orange-400">
              ${totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Main Contractor</label>
            <div className="text-xl text-white font-semibold">TBC</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client / End User</label>
            <div className="text-xl text-white font-semibold">{projectInfo?.client || 'TBC'}</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Terms</label>
            <div className="text-base text-slate-300">20th following month, 22 working days</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Liquidated Damages</label>
            <div className="text-base text-slate-300">None specified</div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/50 p-6 shadow-lg">
        <h4 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <BarChart3 size={20} className="text-orange-500" />
          Financial Breakdown
        </h4>

        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300 font-medium">Net Payable (97%)</span>
              <span className="text-white font-semibold">
                ${netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-slate-900/80 rounded-full h-4 overflow-hidden border border-slate-700/50">
              <div className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full shadow-lg" style={{ width: '97%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300 font-medium">Retention Held (3%)</span>
              <span className="text-orange-400 font-semibold">
                ${retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-slate-900/80 rounded-full h-4 overflow-hidden border border-slate-700/50">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 h-full rounded-full shadow-lg" style={{ width: '3%' }} />
            </div>
          </div>

          <div className="pt-5 border-t border-slate-700/50 mt-2">
            <div className="flex justify-between">
              <span className="text-white font-bold text-lg">Total Contract Value</span>
              <span className="text-blue-400 font-bold text-lg">
                ${totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-4 text-sm text-blue-300">
        <AlertCircle size={16} className="inline mr-2" />
        These values will be refined as Contract Manager is integrated with your commercial data.
      </div>
    </div>
  );
}

function ScopeSystemsTab({ projectId, scopeSystems }: { projectId: string; scopeSystems: ScopeSystem[] }) {
  const getCoverageBadge = (coverage: 'full' | 'partial' | 'none') => {
    const styles = {
      full: 'bg-green-900/30 text-green-400 border-green-700',
      partial: 'bg-amber-900/30 text-amber-400 border-amber-700',
      none: 'bg-red-900/30 text-red-400 border-red-700'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${styles[coverage]}`}>
        {coverage.charAt(0).toUpperCase() + coverage.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full"></div>
        Scope & Systems
      </h3>

      {scopeSystems.length > 0 ? (
        <div className="space-y-4">
          {scopeSystems.map((system, idx) => (
            <div key={idx} className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/50 p-6 hover:border-slate-600 transition-all shadow-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">{system.service_type}</h4>
                  <p className="text-sm text-slate-400">{system.item_count} line items</p>
                </div>
                {getCoverageBadge(system.coverage)}
              </div>

              {system.details.length > 0 && (
                <div className="mt-5 pt-5 border-t border-slate-700/50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Sample Items:</p>
                  <ul className="space-y-2">
                    {system.details.slice(0, 3).map((detail, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-orange-500 mt-1">•</span>
                        <span className="flex-1">{detail}</span>
                      </li>
                    ))}
                  </ul>
                  {system.details.length > 3 && (
                    <p className="text-xs text-slate-500 mt-3">
                      +{system.details.length - 3} more items
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-12 text-center">
          <CheckCircle className="mx-auto text-slate-500 mb-4" size={48} />
          <p className="text-slate-400">
            Scope & Systems will be populated from the approved quote's line items.
          </p>
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-4 text-sm text-blue-300">
        <AlertCircle size={16} className="inline mr-2" />
        Service types are auto-categorized from quote line items. Use scope_category field for custom grouping.
      </div>
    </div>
  );
}

function InclusionsExclusionsTab() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white mb-6">Inclusions & Exclusions</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
          <h4 className="text-base font-semibold text-green-400 mb-4 flex items-center gap-2">
            <CheckCircle size={18} />
            Inclusions
          </h4>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>All passive fire stopping to service penetrations as per fire engineering report and drawings.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>Intumescent coatings to structural steel members identified as requiring FRR.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>Supply of QA documentation including labels, photos, and PS3.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>All materials, labour, and equipment necessary to complete the works.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>Site-specific SWMS and induction for all personnel.</span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
          <h4 className="text-base font-semibold text-red-400 mb-4 flex items-center gap-2">
            <AlertCircle size={18} />
            Exclusions
          </h4>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-1">•</span>
              <span>Remediation of pre-existing, non-compliant fire stopping.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-1">•</span>
              <span>Temporary services penetrations.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-1">•</span>
              <span>Access equipment and out-of-hours work unless specifically agreed.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-1">•</span>
              <span>Works to penetrations not shown on drawings or schedules.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-1">•</span>
              <span>Delays caused by incomplete services installations or lack of access.</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-sm text-blue-300">
        <AlertCircle size={16} className="inline mr-2" />
        Inclusions and exclusions will later be editable and exported as part of the Handover Pack.
      </div>
    </div>
  );
}

function AllowancesTab({ projectId }: { projectId: string }) {
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Allowance>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Allowance>>({
    description: '',
    quantity: '1',
    unit: 'Lump sum',
    rate: null,
    total: 0,
    category: 'general',
    is_provisional: false
  });

  useEffect(() => {
    loadAllowances();
  }, [projectId]);

  const loadAllowances = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_allowances')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      if (error) throw error;
      setAllowances(data || []);
    } catch (error) {
      console.error('Error loading allowances:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    try {
      const { error } = await supabase
        .from('contract_allowances')
        .update(editForm)
        .eq('id', editingId);

      if (error) throw error;

      await loadAllowances();
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      console.error('Error updating allowance:', error);
      alert('Failed to update allowance');
    }
  };

  const handleAdd = async () => {
    try {
      const maxSort = Math.max(...allowances.map(a => a.sort_order), 0);

      const { error } = await supabase
        .from('contract_allowances')
        .insert({
          project_id: projectId,
          ...newForm,
          sort_order: maxSort + 1
        });

      if (error) throw error;

      await loadAllowances();
      setIsAdding(false);
      setNewForm({
        description: '',
        quantity: '1',
        unit: 'Lump sum',
        rate: null,
        total: 0,
        category: 'general',
        is_provisional: false
      });
    } catch (error) {
      console.error('Error adding allowance:', error);
      alert('Failed to add allowance');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this allowance?')) return;

    try {
      const { error } = await supabase
        .from('contract_allowances')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadAllowances();
    } catch (error) {
      console.error('Error deleting allowance:', error);
      alert('Failed to delete allowance');
    }
  };

  const totalAllowances = allowances.reduce((sum, a) => sum + (a.total || 0), 0);

  if (loading) {
    return <div className="text-slate-400">Loading allowances...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Allowances & Provisional Sums</h3>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 transition-all text-sm font-medium"
        >
          <Plus size={16} />
          Add Allowance
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Qty / Basis</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {isAdding && (
              <tr className="bg-slate-800/50">
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={newForm.description}
                    onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                    placeholder="Description"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newForm.quantity}
                      onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })}
                      placeholder="Qty"
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                    />
                    <input
                      type="text"
                      value={newForm.unit}
                      onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}
                      placeholder="Unit"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={newForm.rate || ''}
                    onChange={(e) => setNewForm({ ...newForm, rate: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Rate"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={newForm.total || 0}
                    onChange={(e) => setNewForm({ ...newForm, total: parseFloat(e.target.value) || 0 })}
                    placeholder="Total"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={handleAdd}
                      className="p-1 text-green-400 hover:text-green-300 transition-colors"
                      title="Save"
                    >
                      <Save size={16} />
                    </button>
                    <button
                      onClick={() => setIsAdding(false)}
                      className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {allowances.map((allowance) => (
              <tr key={allowance.id} className="hover:bg-slate-900/30 transition-colors">
                {editingId === allowance.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                          className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                        />
                        <input
                          type="text"
                          value={editForm.unit}
                          onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={editForm.rate || ''}
                        onChange={(e) => setEditForm({ ...editForm, rate: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={editForm.total}
                        onChange={(e) => setEditForm({ ...editForm, total: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="p-1 text-green-400 hover:text-green-300 transition-colors"
                          title="Save"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditForm({});
                          }}
                          className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-sm text-white">
                      {allowance.description}
                      {allowance.is_provisional && (
                        <span className="ml-2 px-2 py-0.5 bg-orange-900/30 text-orange-400 text-xs rounded border border-orange-700">
                          Provisional
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {allowance.quantity} {allowance.unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {allowance.rate ? `$${allowance.rate.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-white text-right">
                      ${allowance.total.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(allowance.id);
                            setEditForm(allowance);
                          }}
                          className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(allowance.id)}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {allowances.length === 0 && !isAdding && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No allowances added yet. Click "Add Allowance" to create one.
                </td>
              </tr>
            )}

            {allowances.length > 0 && (
              <tr className="bg-slate-900/70 border-t-2 border-blue-500">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-white">Total Allowances</td>
                <td className="px-4 py-3 text-base font-bold text-blue-400 text-right">
                  ${totalAllowances.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-sm text-green-300">
        <CheckCircle size={16} className="inline mr-2" />
        Allowances are now live! Add, edit, and delete allowances as needed. Data is automatically saved to the database.
      </div>
    </div>
  );
}

function VariationsLogTab() {
  return (
    <div className="text-center py-12">
      <AlertCircle className="mx-auto text-slate-500 mb-4" size={48} />
      <h3 className="text-xl font-bold text-white mb-2">Variations Log</h3>
      <p className="text-slate-400">
        Track proposed and approved variations here in a future update.
      </p>
    </div>
  );
}
