import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, CheckCircle, AlertCircle, FileCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';
import ExportDropdown from '../components/ExportDropdown';
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

type TabId = 'summary' | 'scope' | 'inclusions' | 'allowances' | 'variations';

export default function ContractManager({ projectId, onNavigateBack, dashboardMode = 'original' }: ContractManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [loading, setLoading] = useState(true);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [awardInfo, setAwardInfo] = useState<AwardInfo | null>(null);
  const [exporting, setExporting] = useState(false);
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
      }
    } catch (error) {
      console.error('Error loading contract manager data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (mode: 'site' | 'commercial') => {
    if (!awardInfo) return;

    setExporting(true);
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
          mode
        })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const result = await response.json();

      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
      const projectName = projectInfo?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project';
      const filename = mode === 'site'
        ? `SiteScope_${projectName}_${timestamp}.html`
        : `CommercialHandover_${projectName}_${timestamp}.html`;

      const blob = new Blob([result.html], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert(`${mode === 'site' ? 'Site Scope Pack' : 'Commercial Handover Pack'} generated successfully! Open the HTML file and use your browser's Print to PDF function.`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Could not generate export. Please try again or contact support.');
    } finally {
      setExporting(false);
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
      <div className="p-6 max-w-full">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading contract information...</div>
        </div>
      </div>
    );
  }

  const hasAward = !!awardInfo;

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <button
          onClick={onNavigateBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
        >
          <ArrowLeft size={16} />
          Back to Project Dashboard
        </button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">
              Projects → {projectInfo?.name || 'Unknown Project'} → Contract Manager
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{projectInfo?.name || 'Unknown Project'}</h1>
            <h2 className="text-xl text-gray-600 mt-1">Contract Manager</h2>
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-500">Organisation</div>
            <div className="font-medium text-gray-900">{currentOrganisation?.name || 'N/A'}</div>
            <div className="text-gray-500 mt-2">Last Updated</div>
            <div className="font-medium text-gray-900">
              {projectInfo?.updated_at ? new Date(projectInfo.updated_at).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between py-4 border-t border-b border-gray-200">
          <p className="text-gray-600">
            Manage your subcontract scope and handover information.
          </p>
          <ExportDropdown
            disabled={!hasAward}
            onExport={handleExport}
            loading={exporting}
          />
        </div>
      </div>

      {!hasAward ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <AlertCircle className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No award selected</h3>
          <p className="text-gray-600 mb-6">
            Select a preferred supplier in your Award Report before using Contract Manager.
          </p>
          <button
            onClick={() => window.location.href = '#/reports'}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Go to Reports
          </button>
        </div>
      ) : (
        <>
          <div className="border-b border-gray-200 mb-6">
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            {activeTab === 'summary' && <ContractSummaryTab awardInfo={awardInfo} projectInfo={projectInfo} />}
            {activeTab === 'scope' && <ScopeSystemsTab projectId={projectId} />}
            {activeTab === 'inclusions' && <InclusionsExclusionsTab />}
            {activeTab === 'allowances' && <AllowancesTab />}
            {activeTab === 'variations' && <VariationsLogTab />}
          </div>
        </>
      )}
    </div>
  );
}

function ContractSummaryTab({ awardInfo, projectInfo }: { awardInfo: AwardInfo | null; projectInfo: ProjectInfo | null }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Contract Summary</h3>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Subcontractor</label>
          <div className="text-base text-gray-900">{awardInfo?.supplier_name || 'TBC'}</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Subcontract Sum</label>
          <div className="text-base font-semibold text-gray-900">
            ${awardInfo?.total_amount ? awardInfo.total_amount.toLocaleString() : '0.00'}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Main Contractor</label>
          <div className="text-base text-gray-900">TBC</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Client / End User</label>
          <div className="text-base text-gray-900">{projectInfo?.client || 'TBC'}</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
          <div className="text-base text-gray-900">20th following month, 22 working days payment</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Retentions</label>
          <div className="text-base text-gray-900">3% standard retention</div>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Liquidated Damages (LDs)</label>
          <div className="text-base text-gray-900">None specified</div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <AlertCircle size={16} className="inline mr-2" />
        These values will be refined as Contract Manager is integrated with your commercial data.
      </div>
    </div>
  );
}

function ScopeSystemsTab({ projectId }: { projectId: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Scope & Systems</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">System</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-4 py-3 text-sm text-gray-900">Fire batts & mastic</td>
              <td className="px-4 py-3 text-sm text-gray-700">FRR 60/60/60</td>
              <td className="px-4 py-3 text-sm text-gray-500">See scope matrix</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-sm text-gray-900">Intumescent paint to steel</td>
              <td className="px-4 py-3 text-sm text-gray-700">FRR 90/90/90</td>
              <td className="px-4 py-3 text-sm text-gray-500">See scope matrix</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mt-4">
        <AlertCircle size={16} className="inline mr-2" />
        Scope & Systems will be automatically populated from the Scope Matrix in a future update.
      </div>
    </div>
  );
}

function InclusionsExclusionsTab() {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Inclusions & Exclusions</h3>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h4 className="text-base font-semibold text-gray-900 mb-3">Inclusions</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">•</span>
              <span>All passive fire stopping to service penetrations as per fire engineering report and drawings.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">•</span>
              <span>Intumescent coatings to structural steel members identified as requiring FRR.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">•</span>
              <span>Supply of QA documentation including labels, photos, and PS3.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">•</span>
              <span>All materials, labour, and equipment necessary to complete the works.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">•</span>
              <span>Site-specific SWMS and induction for all personnel.</span>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-base font-semibold text-gray-900 mb-3">Exclusions</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">•</span>
              <span>Remediation of pre-existing, non-compliant fire stopping.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">•</span>
              <span>Temporary services penetrations.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">•</span>
              <span>Access equipment and out-of-hours work unless specifically agreed.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">•</span>
              <span>Works to penetrations not shown on drawings or schedules.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">•</span>
              <span>Delays caused by incomplete services installations or lack of access.</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mt-6">
        <AlertCircle size={16} className="inline mr-2" />
        Inclusions and exclusions will later be editable and exported as part of the Handover Pack.
      </div>
    </div>
  );
}

function AllowancesTab() {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Allowances & Provisional Sums</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty / Basis</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-4 py-3 text-sm text-gray-900">Remedial fire stopping allowance</td>
              <td className="px-4 py-3 text-sm text-gray-700">20 openings</td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right">$250.00</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">$5,000.00</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-sm text-gray-900">Access equipment allowance</td>
              <td className="px-4 py-3 text-sm text-gray-700">Lump sum</td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right">-</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">$8,500.00</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-sm text-gray-900">Provisional sum - additional works</td>
              <td className="px-4 py-3 text-sm text-gray-700">As directed</td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right">-</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">$10,000.00</td>
            </tr>
            <tr className="bg-gray-50">
              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900">Total Allowances</td>
              <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">$23,500.00</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mt-4">
        <AlertCircle size={16} className="inline mr-2" />
        Future versions will pull allowances from estimating data and allow editing.
      </div>
    </div>
  );
}

function VariationsLogTab() {
  return (
    <div className="text-center py-12">
      <AlertCircle className="mx-auto text-gray-400 mb-4" size={48} />
      <h3 className="text-xl font-bold text-gray-900 mb-2">Variations Log</h3>
      <p className="text-gray-600">
        Track proposed and approved variations here in a future update.
      </p>
    </div>
  );
}
