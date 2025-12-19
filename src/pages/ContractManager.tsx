import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, CheckCircle, AlertCircle, FileCheck, Download, Users, Briefcase, PieChart, BarChart3 } from 'lucide-react';
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
          .select('scope_category, description, quantity, unit_rate, total')
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
      const filename = `JuniorSiteTeamPack_${projectName}_${timestamp}.pdf`;

      generatePdfWithPrint(result.html, filename);

      alert('Junior Site Team Handover Pack generated! Print dialog opened - choose "Save as PDF" as your printer destination.');
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
      const filename = `SeniorProjectOverview_${projectName}_${timestamp}.pdf`;

      generatePdfWithPrint(result.html, filename);

      alert('Senior Project Team Pack generated! Print dialog opened - choose "Save as PDF" as your printer destination.');
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
      <div className="min-h-screen bg-[#0B1623] p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Loading contract information...</div>
        </div>
      </div>
    );
  }

  const hasAward = !!awardInfo;

  return (
    <div className="min-h-screen bg-[#0B1623] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Project Dashboard
          </button>

          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm text-slate-400 mb-1">
                Projects → {projectInfo?.name || 'Unknown Project'} → Contract Manager
              </div>
              <h1 className="text-3xl font-bold text-white">{projectInfo?.name || 'Unknown Project'}</h1>
              <h2 className="text-xl text-slate-300 mt-1">Contract Manager</h2>
            </div>
            <div className="text-right text-sm">
              <div className="text-slate-400">Organisation</div>
              <div className="font-medium text-white">{currentOrganisation?.name || 'N/A'}</div>
              <div className="text-slate-400 mt-2">Last Updated</div>
              <div className="font-medium text-white">
                {projectInfo?.updated_at ? new Date(projectInfo.updated_at).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between py-4 border-t border-b border-slate-700">
            <p className="text-slate-300">
              Manage your subcontract scope and handover information.
            </p>
            {hasAward && (
              <div className="flex gap-3">
                <button
                  onClick={handleGenerateJuniorPack}
                  disabled={generatingJunior}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Users size={16} />
                  {generatingJunior ? 'Generating...' : 'Generate Junior Pack'}
                </button>
                <button
                  onClick={handleGenerateSeniorReport}
                  disabled={generatingSenior}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Briefcase size={16} />
                  {generatingSenior ? 'Generating...' : 'Generate Senior Pack'}
                </button>
              </div>
            )}
          </div>
        </div>

        {!hasAward ? (
          <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-12 text-center">
            <AlertCircle className="mx-auto text-slate-400 mb-4" size={48} />
            <h3 className="text-xl font-bold text-white mb-2">No award selected</h3>
            <p className="text-slate-300 mb-6">
              Select a preferred supplier in your Award Report before using Contract Manager.
            </p>
            <button
              onClick={() => window.location.href = '#/reports'}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Reports
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-700 mb-6">
              <div className="flex gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'text-blue-400 border-b-2 border-blue-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-6">
              {activeTab === 'summary' && <ContractSummaryTab awardInfo={awardInfo} projectInfo={projectInfo} />}
              {activeTab === 'scope' && <ScopeSystemsTab projectId={projectId} scopeSystems={scopeSystems} />}
              {activeTab === 'inclusions' && <InclusionsExclusionsTab />}
              {activeTab === 'allowances' && <AllowancesTab />}
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-6">Contract Summary</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Subcontractor</label>
            <div className="text-lg text-white font-medium">{awardInfo?.supplier_name || 'TBC'}</div>
          </div>

          <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Subcontract Sum</label>
            <div className="text-2xl font-bold text-blue-400">
              ${totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Main Contractor</label>
            <div className="text-lg text-white">TBC</div>
          </div>

          <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Client / End User</label>
            <div className="text-lg text-white">{projectInfo?.client || 'TBC'}</div>
          </div>

          <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Payment Terms</label>
            <div className="text-base text-slate-300">20th following month, 22 working days</div>
          </div>

          <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Liquidated Damages</label>
            <div className="text-base text-slate-300">None specified</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
        <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 size={18} />
          Financial Breakdown
        </h4>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300">Net Payable (97%)</span>
              <span className="text-white font-medium">
                ${netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div className="bg-green-500 h-full rounded-full" style={{ width: '97%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300">Retention Held (3%)</span>
              <span className="text-amber-400 font-medium">
                ${retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full" style={{ width: '3%' }} />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <div className="flex justify-between">
              <span className="text-white font-semibold">Total Contract Value</span>
              <span className="text-blue-400 font-bold text-lg">
                ${totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-sm text-blue-300">
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
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white mb-4">Scope & Systems</h3>

      {scopeSystems.length > 0 ? (
        <div className="space-y-4">
          {scopeSystems.map((system, idx) => (
            <div key={idx} className="bg-slate-900/50 rounded-lg border border-slate-700 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-base font-semibold text-white mb-1">{system.service_type}</h4>
                  <p className="text-sm text-slate-400">{system.item_count} line items</p>
                </div>
                {getCoverageBadge(system.coverage)}
              </div>

              {system.details.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <p className="text-xs font-medium text-slate-400 mb-2">Sample Items:</p>
                  <ul className="space-y-1.5">
                    {system.details.slice(0, 3).map((detail, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span className="flex-1">{detail}</span>
                      </li>
                    ))}
                  </ul>
                  {system.details.length > 3 && (
                    <p className="text-xs text-slate-500 mt-2">
                      +{system.details.length - 3} more items
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-8 text-center">
          <CheckCircle className="mx-auto text-slate-500 mb-3" size={40} />
          <p className="text-slate-400">
            Scope & Systems will be populated from the approved quote's line items.
          </p>
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-sm text-blue-300">
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

function AllowancesTab() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white mb-4">Allowances & Provisional Sums</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Qty / Basis</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            <tr className="hover:bg-slate-900/30 transition-colors">
              <td className="px-4 py-3 text-sm text-white">Remedial fire stopping allowance</td>
              <td className="px-4 py-3 text-sm text-slate-300">20 openings</td>
              <td className="px-4 py-3 text-sm text-slate-300 text-right">$250.00</td>
              <td className="px-4 py-3 text-sm font-medium text-white text-right">$5,000.00</td>
            </tr>
            <tr className="hover:bg-slate-900/30 transition-colors">
              <td className="px-4 py-3 text-sm text-white">Access equipment allowance</td>
              <td className="px-4 py-3 text-sm text-slate-300">Lump sum</td>
              <td className="px-4 py-3 text-sm text-slate-300 text-right">-</td>
              <td className="px-4 py-3 text-sm font-medium text-white text-right">$8,500.00</td>
            </tr>
            <tr className="hover:bg-slate-900/30 transition-colors">
              <td className="px-4 py-3 text-sm text-white">Provisional sum - additional works</td>
              <td className="px-4 py-3 text-sm text-slate-300">As directed</td>
              <td className="px-4 py-3 text-sm text-slate-300 text-right">-</td>
              <td className="px-4 py-3 text-sm font-medium text-white text-right">$10,000.00</td>
            </tr>
            <tr className="bg-slate-900/70 border-t-2 border-blue-500">
              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-white">Total Allowances</td>
              <td className="px-4 py-3 text-base font-bold text-blue-400 text-right">$23,500.00</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-sm text-blue-300">
        <AlertCircle size={16} className="inline mr-2" />
        Future versions will pull allowances from estimating data and allow editing.
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
