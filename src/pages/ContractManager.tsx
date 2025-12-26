import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, CheckCircle, AlertCircle, FileCheck, Download, Users, Briefcase, PieChart, BarChart3, Plus, CreditCard as Edit2, Trash2, Save, X, Send, Upload, Shield, Clock, UserCheck, ChevronRight, ChevronLeft, PackageOpen, FileSpreadsheet, MoreVertical, Tag, Loader2, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generatePdfWithPrint } from '../lib/reports/modernPdfTemplate';
import { generateAndDownloadPdf } from '../lib/reports/pdfGenerator';
import { useOrganisation } from '../lib/organisationContext';
import { exportTagsClarificationsToExcel } from '../lib/export/tagsExcelExport';
import EnhancedAllowancesTab from '../components/EnhancedAllowancesTab';
import ContractWorkflowStepper from '../components/ContractWorkflowStepper';
import { getWorkflowProgress, autoUpdateWorkflowProgress, getCompletedSteps, updateWorkflowStep, WORKFLOW_STEPS, type WorkflowStepProgress } from '../lib/workflow/contractWorkflow';
import type { DashboardMode } from '../App';
import { RetentionThresholdEditor, type RetentionTier } from '../components/RetentionThresholdEditor';
import { calculateRetention } from '../lib/retention/retentionCalculator';

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
  organisation_id?: string;
  created_by?: string;
}

interface AwardInfo {
  supplier_name: string;
  total_amount: number;
  awarded_date?: string;
  supplier_contact?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
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
  // PS Control fields
  ps_type?: string | null;
  ps_reason?: string | null;
  ps_trigger?: string | null;
  ps_approval_role?: string | null;
  ps_evidence_required?: string | null;
  ps_spend_method?: string | null;
  ps_cap?: number | null;
  ps_rate_basis?: string | null;
  ps_spend_to_date?: number;
  ps_conversion_rule?: string | null;
  ps_status?: string | null;
  ps_standardised?: boolean;
  ps_notes_internal?: string | null;
}

interface Variation {
  id: string;
  project_id: string;
  allowance_id?: string | null;
  variation_number: string;
  description: string;
  amount: number;
  status: string;
  reference?: string | null;
  evidence_notes?: string | null;
  submitted_date?: string | null;
  approved_date?: string | null;
  created_at: string;
}

interface ProgressClaim {
  id: string;
  project_id: string;
  allowance_id?: string | null;
  claim_number: string;
  description: string;
  amount: number;
  claim_date: string;
  status: string;
  reference?: string | null;
  evidence_notes?: string | null;
  created_at: string;
}

interface LetterOfIntent {
  id: string;
  supplier_name: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  scope_summary: string;
  service_types: string[];
  target_start_date: string | null;
  target_completion_date: string | null;
  key_milestones: Array<{ title: string; date: string }>;
  next_steps_checklist: Array<{ step: string; completed: boolean }>;
  custom_terms: string | null;
  status: string;
  user_confirmed_nonbinding: boolean;
  generated_at: string;
  sent_at: string | null;
}

interface ComplianceDocument {
  id: string;
  document_type: string;
  document_name: string;
  file_path: string;
  status: string;
  notes: string | null;
  uploaded_at: string;
  verified_at: string | null;
}

type TabId = 'summary' | 'scope' | 'inclusions' | 'allowances' | 'onboarding' | 'handover';

export default function ContractManager({ projectId, onNavigateBack, dashboardMode = 'original' }: ContractManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [loading, setLoading] = useState(true);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [awardInfo, setAwardInfo] = useState<AwardInfo | null>(null);
  const [scopeSystems, setScopeSystems] = useState<ScopeSystem[]>([]);
  const [generatingJunior, setGeneratingJunior] = useState(false);
  const [generatingSenior, setGeneratingSenior] = useState(false);
  const [generatingJuniorPdf, setGeneratingJuniorPdf] = useState(false);
  const [generatingSeniorPdf, setGeneratingSeniorPdf] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [organisationLogoUrl, setOrganisationLogoUrl] = useState<string | undefined>(undefined);
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowStepProgress[]>([]);
  const { currentOrganisation } = useOrganisation();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('id, name, client, updated_at, approved_quote_id, organisation_id, created_by')
        .eq('id', projectId)
        .maybeSingle();

      if (project) {
        setProjectInfo(project);

        // Fetch organisation logo if organisation_id exists
        if (project.organisation_id) {
          const { data: orgData } = await supabase
            .from('organisations')
            .select('logo_url')
            .eq('id', project.organisation_id)
            .maybeSingle();

          if (orgData?.logo_url) {
            // Convert storage path to public URL
            const { data: publicUrlData } = supabase.storage
              .from('organisation-logos')
              .getPublicUrl(orgData.logo_url);

            if (publicUrlData?.publicUrl) {
              setOrganisationLogoUrl(publicUrlData.publicUrl);
            }
          }
        }
      }

      const approvedQuoteId = (project as any)?.approved_quote_id;

      if (approvedQuoteId) {
        const { data: approvedQuote } = await supabase
          .from('quotes')
          .select('supplier_name, total_amount, updated_at, organisation_id')
          .eq('id', approvedQuoteId)
          .maybeSingle();

        if (approvedQuote) {
          // Try to find supplier details from suppliers table
          let supplierContact = null;
          let supplierEmail = null;
          let supplierPhone = null;
          let supplierAddress = null;

          if (approvedQuote.organisation_id) {
            const { data: supplier } = await supabase
              .from('suppliers')
              .select('contact_name, contact_email, contact_phone, address, notes')
              .eq('organisation_id', approvedQuote.organisation_id)
              .ilike('name', approvedQuote.supplier_name)
              .maybeSingle();

            if (supplier) {
              supplierContact = supplier.contact_name;
              supplierEmail = supplier.contact_email;
              supplierPhone = supplier.contact_phone;
              supplierAddress = supplier.address;

              // Fallback: Try to extract contact name from notes if not in contact_name field
              if (!supplierContact && supplier.notes) {
                const contactMatch = supplier.notes.match(/contact:\s*([^\n]+)/i);
                if (contactMatch) {
                  supplierContact = contactMatch[1].trim();
                }
              }
            }
          }

          setAwardInfo({
            supplier_name: approvedQuote.supplier_name,
            total_amount: approvedQuote.total_amount || 0,
            awarded_date: approvedQuote.updated_at,
            supplier_contact: supplierContact,
            supplier_email: supplierEmail,
            supplier_phone: supplierPhone,
            supplier_address: supplierAddress
          });

          // Show Onboarding tab whenever there's an approved quote
          setIsApproved(true);
        }

        const { data: quoteItems } = await supabase
          .from('quote_items')
          .select('scope_category, service, subclass, material, description, quantity, unit, unit_price, total_price')
          .eq('quote_id', approvedQuoteId);

        if (quoteItems && quoteItems.length > 0) {
          const systemsMap = new Map<string, ScopeSystem>();

          quoteItems.forEach((item: any) => {
            // Use service field first, then scope_category, then default to "Other Systems"
            const category = item.service?.trim() || item.scope_category || 'Other Systems';
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
              // Format: Description | Service | Type | Material | Qty | Unit
              const serviceStr = item.service || 'N/A';
              const typeStr = item.subclass || 'N/A';
              const materialStr = item.material || 'N/A';
              const qtyStr = item.quantity != null ? String(item.quantity) : 'N/A';
              const unitStr = item.unit || 'N/A';

              const formattedDetail = `${item.description} | ${serviceStr} | ${typeStr} | ${materialStr} | ${qtyStr} | ${unitStr}`;
              system.details.push(formattedDetail);
            }
          });

          setScopeSystems(Array.from(systemsMap.values()));
        }
      }

      await loadWorkflowProgress();
    } catch (error) {
      console.error('Error loading contract manager data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflowProgress = async () => {
    try {
      const progress = await getWorkflowProgress(projectId);
      setWorkflowProgress(progress);
    } catch (error) {
      console.error('Error loading workflow progress:', error);
    }
  };

  const refreshWorkflowProgress = async () => {
    try {
      await autoUpdateWorkflowProgress(projectId);
      await loadWorkflowProgress();
    } catch (error) {
      console.error('Error refreshing workflow progress:', error);
    }
  };

  useEffect(() => {
    if (projectId && !loading) {
      loadWorkflowProgress();
    }
  }, [activeTab]);

  const handleStepClick = (stepId: string) => {
    setActiveTab(stepId as TabId);
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

  const handleGenerateJuniorPdf = async () => {
    if (!awardInfo) return;

    setGeneratingJuniorPdf(true);
    try {
      let htmlContent: string | null = null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export_contract_manager`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            mode: 'junior_pack'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          htmlContent = result.html;
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.warn('Edge function error, will use fallback:', errorData);
        }
      } catch (edgeError) {
        console.warn('Edge function failed, using client-side fallback:', edgeError);
      }

      if (!htmlContent) {
        console.log('Generating PDF client-side...');

        try {
          console.log('Fetching inclusions and exclusions...');
          const { data: inclusionsData, error: incError } = await supabase
            .from('contract_inclusions')
            .select('description')
            .eq('project_id', projectId)
            .order('sort_order');

          if (incError) {
            console.warn('Error fetching inclusions:', incError);
          }

          const { data: exclusionsData, error: excError } = await supabase
            .from('contract_exclusions')
            .select('description')
            .eq('project_id', projectId)
            .order('sort_order');

          if (excError) {
            console.warn('Error fetching exclusions:', excError);
          }

          const inclusionsList = (inclusionsData || []).map((i: any) => i.description).filter(Boolean);
          const exclusionsList = (exclusionsData || []).map((e: any) => e.description).filter(Boolean);

          console.log('Inclusions:', inclusionsList.length, 'Exclusions:', exclusionsList.length);

          console.log('Loading junior pack generator...');
          const { generateJuniorPackHTML, getDefaultJuniorPackData } = await import('../lib/handover/juniorPackGenerator');

          console.log('Fetching quote items for line item details...');
          const approvedQuoteId = (projectInfo as any)?.approved_quote_id;

          if (!approvedQuoteId) {
            throw new Error('No approved quote found for this project');
          }

          const { data: quoteItemsData } = await supabase
            .from('quote_items')
            .select('description, service, material, quantity, unit, subclass')
            .eq('quote_id', approvedQuoteId);

          const lineItems = (quoteItemsData || []).map((item: any) => ({
            description: item.description || 'N/A',
            service: item.service || item.subclass || 'N/A',
            material: item.material || 'N/A',
            quantity: item.quantity ?? 'N/A',
            unit: item.unit || 'N/A'
          }));

          const defaultData = getDefaultJuniorPackData();

          console.log('Building junior data object...');
          const juniorData = {
            projectName: projectInfo?.name || 'Project',
            projectClient: projectInfo?.client || 'TBC',
            supplierName: awardInfo.supplier_name,
            scopeSystems: scopeSystems.map(sys => ({
              service_type: sys.service_type,
              coverage: sys.coverage,
              item_count: sys.item_count,
              details: sys.details
            })),
            lineItems: lineItems,
            inclusions: inclusionsList,
            exclusions: exclusionsList,
            safetyNotes: defaultData.safetyNotes || [],
            checklists: defaultData.checklists || [],
            organisationLogoUrl: organisationLogoUrl,
            supplierContact: awardInfo.supplier_contact,
            supplierEmail: awardInfo.supplier_email,
            supplierPhone: awardInfo.supplier_phone,
            supplierAddress: awardInfo.supplier_address
          };

          console.log('Generating HTML from junior data...');
          htmlContent = generateJuniorPackHTML(juniorData);
          console.log('HTML generated successfully, length:', htmlContent?.length);
        } catch (fallbackError) {
          console.error('Error in client-side fallback:', fallbackError);
          throw fallbackError;
        }
      }

      if (!htmlContent) {
        throw new Error('Failed to generate HTML content');
      }

      const projectName = projectInfo?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project';
      const filename = `JuniorSiteTeamPack_${projectName}`;

      await generateAndDownloadPdf({
        htmlContent,
        filename,
        projectName: projectInfo?.name,
        contractNumber: undefined,
        reportType: 'Site Team Pack',
        useTestMode: import.meta.env.DEV
      });

      alert('Site Team Pack PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      alert(`Failed to generate Site Team Pack: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingJuniorPdf(false);
    }
  };

  const handleGenerateSeniorPdf = async () => {
    if (!awardInfo) return;

    setGeneratingSeniorPdf(true);
    try {
      let htmlContent: string | null = null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export_contract_manager`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            mode: 'senior_report'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          htmlContent = result.html;
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.warn('Edge function error, will use fallback:', errorData);
        }
      } catch (edgeError) {
        console.warn('Edge function failed, using client-side fallback:', edgeError);
      }

      if (!htmlContent) {
        console.log('Generating Senior Report PDF client-side...');

        const { data: inclusionsData } = await supabase
          .from('contract_inclusions')
          .select('description')
          .eq('project_id', projectId)
          .order('sort_order');

        const { data: exclusionsData } = await supabase
          .from('contract_exclusions')
          .select('description')
          .eq('project_id', projectId)
          .order('sort_order');

        const inclusionsList = (inclusionsData || []).map(i => i.description).filter(Boolean);
        const exclusionsList = (exclusionsData || []).map(e => e.description).filter(Boolean);

        // Fetch detailed quote items for line item details
        const approvedQuoteId = (projectInfo as any)?.approved_quote_id;
        let lineItems: any[] = [];

        if (approvedQuoteId) {
          const { data: quoteItemsData } = await supabase
            .from('quote_items')
            .select('description, service, material, quantity, unit, unit_price, total_price, subclass')
            .eq('quote_id', approvedQuoteId);

          lineItems = (quoteItemsData || []).map((item: any) => ({
            description: item.description || 'N/A',
            service: item.service || item.subclass || 'N/A',
            material: item.material || 'N/A',
            quantity: item.quantity ?? 'N/A',
            unit: item.unit || 'N/A',
            unitPrice: item.unit_price || 0,
            totalPrice: item.total_price || 0
          }));
        }

        const { generateSeniorReportHTML, getDefaultSeniorReportData } = await import('../lib/handover/seniorReportGenerator');

        // Get project duration and retention settings from database
        const { data: projectData } = await supabase
          .from('projects')
          .select('project_duration_months, retention_percentage, retention_method, retention_tiers')
          .eq('id', projectId)
          .maybeSingle();

        const projectDurationMonths = projectData?.project_duration_months || 6;
        const retentionPercentage = projectData?.retention_percentage || 5;
        const retentionMethod = projectData?.retention_method || 'flat';
        const retentionTiers = projectData?.retention_tiers || [];

        const retentionCalc = calculateRetention(
          awardInfo.total_amount,
          retentionPercentage,
          retentionMethod,
          retentionTiers.length > 0 ? retentionTiers : null
        );
        const retentionAmount = retentionCalc.retentionHeld;
        const netAmount = retentionCalc.netPayable;

        const totalItems = scopeSystems.reduce((sum, sys) => sum + sys.item_count, 0);

        // Fetch all quotes for comparison
        const { data: allQuotes } = await supabase
          .from('quotes')
          .select('supplier_name, total_amount, is_awarded')
          .eq('project_id', projectId)
          .eq('latest', true)
          .order('total_amount', { ascending: true });

        // Calculate quote comparison data
        const quoteComparison = allQuotes?.map(q => ({
          supplierName: q.supplier_name,
          amount: q.total_amount || 0,
          isAwarded: q.is_awarded,
          difference: q.total_amount ? ((q.total_amount - awardInfo.total_amount) / awardInfo.total_amount) * 100 : 0
        })) || [];

        // Calculate cost breakdown by service type
        const costBreakdown = scopeSystems.map(sys => ({
          serviceType: sys.service_type,
          coverage: sys.coverage,
          itemCount: sys.item_count,
          // Estimate cost proportion based on item count (in real implementation, sum actual quote_items amounts)
          estimatedCost: totalItems > 0 ? (sys.item_count / totalItems) * awardInfo.total_amount : 0
        }));

        // Generate cashflow projection with S-curve distribution
        const generateSCurvePercentages = (months: number): number[] => {
          if (months === 1) return [100];
          if (months === 2) return [40, 60];
          if (months === 3) return [20, 50, 30];
          if (months === 4) return [15, 30, 35, 20];
          if (months === 5) return [10, 20, 35, 25, 10];
          if (months === 6) return [5, 15, 25, 30, 20, 5];

          // For longer projects, use a smooth S-curve
          const percentages: number[] = [];
          let total = 0;

          for (let i = 0; i < months; i++) {
            // S-curve formula: slow start, fast middle, slow end
            const x = i / (months - 1);
            const sCurve = 1 / (1 + Math.exp(-10 * (x - 0.5)));
            percentages.push(sCurve);
            total += sCurve;
          }

          // Normalize to 100%
          return percentages.map(p => (p / total) * 100);
        };

        const percentages = generateSCurvePercentages(projectDurationMonths);
        const months = Array.from({ length: projectDurationMonths }, (_, i) => `Month ${i + 1}`);
        const cashflowProjection = months.map((month, idx) => ({
          month,
          amount: (awardInfo.total_amount * percentages[idx]) / 100
        }));

        // Get default risks from generator
        const defaults = getDefaultSeniorReportData();

        const retentionDescription = retentionMethod === 'flat'
          ? `${retentionPercentage}% standard retention held until practical completion`
          : `Sliding scale retention (effective ${retentionCalc.effectiveRate.toFixed(2)}%) - see retention schedule`;

        const seniorData = {
          projectName: projectInfo?.name || 'Project',
          projectClient: projectInfo?.client || 'TBC',
          supplierName: awardInfo.supplier_name,
          totalAmount: awardInfo.total_amount,
          retentionAmount,
          retentionPercentage,
          netAmount,
          retentionMethod,
          retentionCalculation: retentionCalc,
          scopeSystems: scopeSystems.map(sys => ({
            service_type: sys.service_type,
            coverage: sys.coverage,
            item_count: sys.item_count,
            percentage: totalItems > 0 ? (sys.item_count / totalItems) * 100 : 0
          })),
          keyTerms: [
            { term: 'Payment Terms', value: '20th following month, 22 working days' },
            { term: 'Retention', value: retentionDescription },
            { term: 'Liquidated Damages', value: 'None specified - back-to-back with head contract' },
            { term: 'Variations', value: 'Rate-based as per schedule of rates' },
            { term: 'Insurance', value: 'Public liability $10M, Professional indemnity as required' }
          ],
          risks: defaults.risks || [],
          lineItems: lineItems,
          supplierContact: awardInfo.supplier_contact,
          supplierEmail: awardInfo.supplier_email,
          supplierPhone: awardInfo.supplier_phone,
          supplierAddress: awardInfo.supplier_address,
          quoteComparison,
          costBreakdown,
          cashflowProjection,
          organisationLogoUrl: organisationLogoUrl
        };

        htmlContent = generateSeniorReportHTML(seniorData);
      }

      if (!htmlContent) {
        throw new Error('Failed to generate HTML content');
      }

      const projectName = projectInfo?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project';
      const filename = `SeniorProjectOverview_${projectName}`;

      await generateAndDownloadPdf({
        htmlContent,
        filename,
        projectName: projectInfo?.name,
        contractNumber: undefined,
        reportType: 'Senior Management Pack',
        useTestMode: import.meta.env.DEV
      });

      alert('Senior Management Pack PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      alert(`Failed to generate Senior Management Pack: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingSeniorPdf(false);
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

  const baseTabs = [
    { id: 'summary' as TabId, label: 'Contract Summary', icon: FileText, stepNumber: 1 },
    { id: 'scope' as TabId, label: 'Scope & Systems', icon: CheckCircle, stepNumber: 2 },
    { id: 'inclusions' as TabId, label: 'Inclusions & Exclusions', icon: FileCheck, stepNumber: 3 },
    { id: 'allowances' as TabId, label: 'Allowances', icon: FileText, stepNumber: 4 },
  ];

  const tabs = isApproved
    ? [...baseTabs,
       { id: 'onboarding' as TabId, label: 'Subcontractor Onboarding', icon: UserCheck, stepNumber: 5 },
       { id: 'handover' as TabId, label: 'Site Handover', icon: PackageOpen, stepNumber: 6 }
      ]
    : baseTabs;

  const tabOrder: TabId[] = tabs.map(t => t.id);

  const handleNextTab = async () => {
    const currentIndex = tabOrder.indexOf(activeTab);
    const isLastTab = currentIndex === tabOrder.length - 1;

    // Mark current step as manually completed
    try {
      await updateWorkflowStep(projectId, activeTab, true, 100, { manuallyCompleted: true });

      // Reload workflow progress to update UI
      const updatedProgress = await getWorkflowProgress(projectId);
      setWorkflowProgress(updatedProgress);
    } catch (error) {
      console.error('Error marking step as complete:', error);
    }

    if (isLastTab) {
      // On last tab (Site Handover), navigate back to All Projects Dashboard
      if (onNavigateBack) {
        onNavigateBack();
      }
    } else if (currentIndex < tabOrder.length - 1) {
      setActiveTab(tabOrder[currentIndex + 1]);
    }
  };

  const handlePrevTab = () => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabOrder[currentIndex - 1]);
    }
  };

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
            <ContractWorkflowStepper
              steps={WORKFLOW_STEPS.filter(step =>
                isApproved || !['onboarding', 'handover'].includes(step.id)
              )}
              currentStep={activeTab}
              completedSteps={getCompletedSteps(workflowProgress)}
              onStepClick={handleStepClick}
              lockedSteps={!isApproved ? ['onboarding', 'handover'] : []}
            />

            <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-8 shadow-xl">
              {activeTab === 'summary' && <ContractSummaryTab awardInfo={awardInfo} projectInfo={projectInfo} organisationId={projectInfo?.organisation_id} />}
              {activeTab === 'scope' && <ScopeSystemsTab projectId={projectId} scopeSystems={scopeSystems} />}
              {activeTab === 'inclusions' && <InclusionsExclusionsTab projectId={projectId} />}
              {activeTab === 'allowances' && <EnhancedAllowancesTab projectId={projectId} />}
              {activeTab === 'onboarding' && isApproved && (
                <OnboardingTab
                  projectId={projectId}
                  awardInfo={awardInfo}
                  scopeSystems={scopeSystems}
                  organisationLogoUrl={currentOrganisation?.logo_url || null}
                />
              )}
              {activeTab === 'handover' && isApproved && (
                <SiteHandoverTab
                  projectId={projectId}
                  awardInfo={awardInfo}
                  projectInfo={projectInfo}
                  scopeSystems={scopeSystems}
                  generatingJunior={generatingJunior}
                  generatingSenior={generatingSenior}
                  generatingJuniorPdf={generatingJuniorPdf}
                  generatingSeniorPdf={generatingSeniorPdf}
                  onGenerateJunior={handleGenerateJuniorPack}
                  onGenerateSenior={handleGenerateSeniorReport}
                  onGenerateJuniorPdf={handleGenerateJuniorPdf}
                  onGenerateSeniorPdf={handleGenerateSeniorPdf}
                />
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center mt-6">
              <button
                onClick={handlePrevTab}
                disabled={tabOrder.indexOf(activeTab) === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
              >
                <ChevronLeft size={18} />
                Previous
              </button>

              <button
                onClick={handleNextTab}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-medium transition-all"
              >
                {tabOrder.indexOf(activeTab) === tabOrder.length - 1 ? (
                  <>
                    <CheckCircle size={18} />
                    Complete & Finish
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContractSummaryTab({ awardInfo, projectInfo, organisationId }: { awardInfo: AwardInfo | null; projectInfo: ProjectInfo | null; organisationId?: string }) {
  const [retentionPercentage, setRetentionPercentage] = useState<number>(3.0);
  const [retentionMethod, setRetentionMethod] = useState<'flat' | 'sliding_scale'>('flat');
  const [retentionTiers, setRetentionTiers] = useState<RetentionTier[]>([]);
  const [mainContractor, setMainContractor] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('20th following month, 22 working days');
  const [liquidatedDamages, setLiquidatedDamages] = useState<string>('None specified');
  const [projectDurationMonths, setProjectDurationMonths] = useState<number>(6);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [organisationName, setOrganisationName] = useState<string>('');
  const [projectManager, setProjectManager] = useState<{ name: string; email: string; phone: string }>({ name: '', email: '', phone: '' });

  useEffect(() => {
    const loadAllDetails = async () => {
      await loadOrganisationDetails();
      await loadProjectManagerDetails();
      await loadContractSettings();
    };
    loadAllDetails();
  }, [projectInfo?.id, organisationId]);

  const loadOrganisationDetails = async () => {
    if (!organisationId) return;

    try {
      const { data } = await supabase
        .from('organisations')
        .select('name')
        .eq('id', organisationId)
        .maybeSingle();

      if (data) {
        setOrganisationName(data.name);
      }
    } catch (error) {
      console.error('Error loading organisation details:', error);
    }
  };

  const loadProjectManagerDetails = async () => {
    if (!projectInfo?.id) return;

    try {
      const { data } = await supabase
        .from('projects')
        .select('project_manager_name, project_manager_email, project_manager_phone')
        .eq('id', projectInfo.id)
        .maybeSingle();

      if (data) {
        setProjectManager({
          name: data.project_manager_name || '',
          email: data.project_manager_email || '',
          phone: data.project_manager_phone || ''
        });
      }
    } catch (error) {
      console.error('Error loading project manager details:', error);
    }
  };

  const loadContractSettings = async () => {
    if (!projectInfo?.id) return;

    try {
      // Get both project settings and organisation name in one go
      const { data: projectData } = await supabase
        .from('projects')
        .select('retention_percentage, retention_method, retention_tiers, main_contractor_name, payment_terms, liquidated_damages, project_duration_months, organisation_id')
        .eq('id', projectInfo.id)
        .maybeSingle();

      if (projectData) {
        setRetentionPercentage(projectData.retention_percentage ?? 3.0);
        setRetentionMethod(projectData.retention_method ?? 'flat');
        setRetentionTiers(projectData.retention_tiers ?? []);
        setProjectDurationMonths(projectData.project_duration_months ?? 6);

        // If main_contractor_name is not set, load organisation name and use it
        if (!projectData.main_contractor_name && projectData.organisation_id) {
          const { data: orgData } = await supabase
            .from('organisations')
            .select('name')
            .eq('id', projectData.organisation_id)
            .maybeSingle();

          if (orgData?.name) {
            setMainContractor(orgData.name);
            // Auto-save the organisation name as main contractor
            await supabase
              .from('projects')
              .update({ main_contractor_name: orgData.name })
              .eq('id', projectInfo.id);
          } else {
            setMainContractor('');
          }
        } else {
          setMainContractor(projectData.main_contractor_name || '');
        }

        setPaymentTerms(projectData.payment_terms || '20th following month, 22 working days');
        setLiquidatedDamages(projectData.liquidated_damages || 'None specified');
      }
    } catch (error) {
      console.error('Error loading contract settings:', error);
    }
  };

  const saveProjectManager = async () => {
    if (!projectInfo?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          project_manager_name: projectManager.name,
          project_manager_email: projectManager.email,
          project_manager_phone: projectManager.phone
        })
        .eq('id', projectInfo.id);

      if (error) throw error;
      setIsEditing(null);
    } catch (error) {
      console.error('Error saving project manager:', error);
      alert('Failed to save project manager details');
    } finally {
      setIsSaving(false);
    }
  };

  const saveField = async (field: string, value: string | number) => {
    if (!projectInfo?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ [field]: value })
        .eq('id', projectInfo.id);

      if (error) throw error;
      setIsEditing(null);
    } catch (error) {
      console.error('Error saving field:', error);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const saveRetentionSettings = async () => {
    if (!projectInfo?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          retention_method: retentionMethod,
          retention_tiers: retentionTiers.length > 0 ? retentionTiers : null,
          retention_percentage: retentionPercentage
        })
        .eq('id', projectInfo.id);

      if (error) throw error;
      setIsEditing(null);
    } catch (error) {
      console.error('Error saving retention settings:', error);
      alert('Failed to save retention settings');
    } finally {
      setIsSaving(false);
    }
  };

  const totalAmount = awardInfo?.total_amount || 0;
  const retentionCalculation = calculateRetention(
    totalAmount,
    retentionPercentage,
    retentionMethod,
    retentionTiers.length > 0 ? retentionTiers : null
  );
  const retentionAmount = retentionCalculation.retentionHeld;
  const netAmount = retentionCalculation.netPayable;
  const effectiveRetentionRate = retentionCalculation.effectiveRate;
  const netPercentage = 100 - effectiveRetentionRate;

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

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Main Contractor</label>
            {isEditing === 'main_contractor' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={mainContractor}
                  onChange={(e) => setMainContractor(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                  placeholder="Enter main contractor name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveField('main_contractor_name', mainContractor);
                    if (e.key === 'Escape') setIsEditing(null);
                  }}
                />
                <button
                  onClick={() => saveField('main_contractor_name', mainContractor)}
                  disabled={isSaving}
                  className="p-2 text-green-400 hover:text-green-300"
                >
                  <Save size={18} />
                </button>
                <button onClick={() => setIsEditing(null)} className="p-2 text-slate-400 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-xl text-white font-semibold">{mainContractor || 'TBC'}</div>
                <button
                  onClick={() => setIsEditing('main_contractor')}
                  className="opacity-0 group-hover:opacity-100 p-1 text-blue-400 hover:text-blue-300 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client / End User</label>
            <div className="text-xl text-white font-semibold">{projectInfo?.client || 'TBC'}</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Terms</label>
            {isEditing === 'payment_terms' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                  placeholder="Enter payment terms"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveField('payment_terms', paymentTerms);
                    if (e.key === 'Escape') setIsEditing(null);
                  }}
                />
                <button
                  onClick={() => saveField('payment_terms', paymentTerms)}
                  disabled={isSaving}
                  className="p-2 text-green-400 hover:text-green-300"
                >
                  <Save size={18} />
                </button>
                <button onClick={() => setIsEditing(null)} className="p-2 text-slate-400 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-base text-slate-300">{paymentTerms}</div>
                <button
                  onClick={() => setIsEditing('payment_terms')}
                  className="opacity-0 group-hover:opacity-100 p-1 text-blue-400 hover:text-blue-300 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Liquidated Damages</label>
            {isEditing === 'liquidated_damages' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={liquidatedDamages}
                  onChange={(e) => setLiquidatedDamages(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                  placeholder="Enter liquidated damages"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveField('liquidated_damages', liquidatedDamages);
                    if (e.key === 'Escape') setIsEditing(null);
                  }}
                />
                <button
                  onClick={() => saveField('liquidated_damages', liquidatedDamages)}
                  disabled={isSaving}
                  className="p-2 text-green-400 hover:text-green-300"
                >
                  <Save size={18} />
                </button>
                <button onClick={() => setIsEditing(null)} className="p-2 text-slate-400 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-base text-slate-300">{liquidatedDamages}</div>
                <button
                  onClick={() => setIsEditing('liquidated_damages')}
                  className="opacity-0 group-hover:opacity-100 p-1 text-blue-400 hover:text-blue-300 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Project Duration (Months)</label>
            {isEditing === 'project_duration' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={projectDurationMonths}
                  onChange={(e) => setProjectDurationMonths(parseInt(e.target.value) || 6)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                  placeholder="Enter duration in months"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveField('project_duration_months', projectDurationMonths);
                    if (e.key === 'Escape') setIsEditing(null);
                  }}
                />
                <button
                  onClick={() => saveField('project_duration_months', projectDurationMonths)}
                  disabled={isSaving}
                  className="p-2 text-green-400 hover:text-green-300"
                >
                  <Save size={18} />
                </button>
                <button onClick={() => setIsEditing(null)} className="p-2 text-slate-400 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-base text-slate-300">{projectDurationMonths} {projectDurationMonths === 1 ? 'month' : 'months'}</div>
                <button
                  onClick={() => setIsEditing('project_duration')}
                  className="opacity-0 group-hover:opacity-100 p-1 text-blue-400 hover:text-blue-300 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">Used for cashflow projections in Senior Management Pack</p>
          </div>

          {/* Project Information */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Project Name</label>
            <div className="text-xl text-white font-semibold">{projectInfo?.name || 'TBC'}</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Project Manager</label>
            {isEditing === 'project_manager' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={projectManager.name}
                    onChange={(e) => setProjectManager({ ...projectManager, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="Enter project manager name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={projectManager.email}
                    onChange={(e) => setProjectManager({ ...projectManager, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={projectManager.phone}
                    onChange={(e) => setProjectManager({ ...projectManager, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={saveProjectManager}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                  >
                    <Save size={14} />
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(null);
                      loadProjectManagerDetails();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  {projectManager.name ? (
                    <>
                      <div className="text-lg text-white font-semibold">{projectManager.name}</div>
                      {projectManager.email && <div className="text-sm text-slate-400 mt-1">{projectManager.email}</div>}
                      {projectManager.phone && <div className="text-sm text-slate-400 mt-0.5">{projectManager.phone}</div>}
                    </>
                  ) : (
                    <div className="text-lg text-slate-500">Not set</div>
                  )}
                </div>
                <button
                  onClick={() => setIsEditing('project_manager')}
                  className="opacity-0 group-hover:opacity-100 p-1 text-blue-400 hover:text-blue-300 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/50 p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-orange-500" />
            Financial Breakdown
          </h4>
          <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-700/50">
            <label className="text-sm text-slate-400 font-medium">Retention:</label>
            {isEditing === 'retention' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={retentionPercentage}
                  onChange={(e) => setRetentionPercentage(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                  step="0.5"
                  min="0"
                  max="100"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRetentionSettings();
                    if (e.key === 'Escape') setIsEditing(null);
                  }}
                />
                <span className="text-white font-medium">%</span>
                <button
                  onClick={saveRetentionSettings}
                  disabled={isSaving}
                  className="p-1 text-green-400 hover:text-green-300"
                >
                  <Save size={16} />
                </button>
                <button onClick={() => setIsEditing(null)} className="p-1 text-slate-400 hover:text-slate-300">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">
                  {retentionMethod === 'sliding_scale' ? `${effectiveRetentionRate.toFixed(2)}% (effective)` : `${retentionPercentage}%`}
                </span>
                {retentionMethod === 'sliding_scale' && (
                  <span className="px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-300">
                    Sliding Scale
                  </span>
                )}
                <button
                  onClick={() => setIsEditing('retention')}
                  className="p-1 text-blue-400 hover:text-blue-300"
                  title="Edit retention settings"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {isEditing === 'retention' && (
          <div className="mb-6 space-y-4">
            <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Retention Method
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setRetentionMethod('flat')}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                    retentionMethod === 'flat'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="font-semibold">Flat (single rate)</div>
                  <div className="text-xs mt-1 opacity-80">Standard retention percentage</div>
                </button>
                <button
                  onClick={() => setRetentionMethod('sliding_scale')}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                    retentionMethod === 'sliding_scale'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="font-semibold">Sliding scale (value thresholds)</div>
                  <div className="text-xs mt-1 opacity-80">Progressive retention bands</div>
                </button>
              </div>
            </div>

            {retentionMethod === 'sliding_scale' && (
              <RetentionThresholdEditor
                tiers={retentionTiers}
                onChange={setRetentionTiers}
                onSave={saveRetentionSettings}
                onCancel={() => setIsEditing(null)}
                isSaving={isSaving}
              />
            )}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300 font-medium">Net Payable ({netPercentage.toFixed(1)}%)</span>
              <span className="text-white font-semibold">
                ${netAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-slate-900/80 rounded-full h-4 overflow-hidden border border-slate-700/50">
              <div className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full shadow-lg" style={{ width: `${netPercentage}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300 font-medium">
                Retention Held {retentionMethod === 'sliding_scale' ? '(effective)' : `(${retentionPercentage}%)`}
              </span>
              <span className="text-orange-400 font-semibold">
                ${retentionAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-slate-900/80 rounded-full h-4 overflow-hidden border border-slate-700/50">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 h-full rounded-full shadow-lg" style={{ width: `${effectiveRetentionRate}%` }} />
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

      <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-4 text-sm text-green-300">
        <CheckCircle size={16} className="inline mr-2" />
        Financial settings are now editable. Hover over fields to edit or adjust the retention percentage above.
      </div>
    </div>
  );
}

interface QuoteItemWithCategory {
  id: string;
  description: string;
  scope_category: string | null;
  service?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function ScopeSystemsTab({ projectId, scopeSystems }: { projectId: string; scopeSystems: ScopeSystem[] }) {
  const [systems, setSystems] = useState<ScopeSystem[]>(scopeSystems);
  const [editingCategoryOld, setEditingCategoryOld] = useState<string | null>(null);
  const [editingCategoryNew, setEditingCategoryNew] = useState('');
  const [showRecategorizeModal, setShowRecategorizeModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryItems, setCategoryItems] = useState<QuoteItemWithCategory[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);

  useEffect(() => {
    setSystems(scopeSystems);
  }, [scopeSystems]);

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

  const handleRenameCategory = async () => {
    if (!editingCategoryOld || !editingCategoryNew.trim()) return;

    setUpdatingCategory(true);
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('approved_quote_id')
        .eq('id', projectId)
        .maybeSingle();

      if (!project?.approved_quote_id) return;

      const { error } = await supabase
        .from('quote_items')
        .update({ scope_category: editingCategoryNew })
        .eq('quote_id', project.approved_quote_id)
        .eq('scope_category', editingCategoryOld);

      if (error) throw error;

      // Update local state
      setSystems(systems.map(sys =>
        sys.service_type === editingCategoryOld
          ? { ...sys, service_type: editingCategoryNew }
          : sys
      ));

      setEditingCategoryOld(null);
      setEditingCategoryNew('');

      // Refresh the page data
      window.location.reload();
    } catch (error) {
      console.error('Error renaming category:', error);
      alert('Failed to rename category');
    } finally {
      setUpdatingCategory(false);
    }
  };

  const handleOpenRecategorize = async (category: string) => {
    setSelectedCategory(category);
    setShowRecategorizeModal(true);
    setLoadingItems(true);

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('approved_quote_id')
        .eq('id', projectId)
        .maybeSingle();

      if (!project?.approved_quote_id) return;

      // Fetch all items and filter by service or scope_category
      const { data: allItems } = await supabase
        .from('quote_items')
        .select('id, description, scope_category, service, quantity, unit_price, total_price')
        .eq('quote_id', project.approved_quote_id);

      // Filter items that match the category (checking both service and scope_category)
      const matchingItems = allItems?.filter(item => {
        const itemCategory = item.service?.trim() || item.scope_category || 'Other Systems';
        return itemCategory === category;
      }) || [];

      setCategoryItems(matchingItems);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleRecategorizeItem = async (itemId: string, newCategory: string) => {
    try {
      const { error } = await supabase
        .from('quote_items')
        .update({ scope_category: newCategory })
        .eq('id', itemId);

      if (error) throw error;

      // Remove from current list
      setCategoryItems(categoryItems.filter(item => item.id !== itemId));

      alert('Item recategorized successfully. Refresh to see changes.');
    } catch (error) {
      console.error('Error recategorizing item:', error);
      alert('Failed to recategorize item');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
          <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full"></div>
          Scope & Systems
        </h3>
        <p className="text-slate-400 text-sm">Organize quote items into service categories</p>
      </div>

      {systems.length > 0 ? (
        <div className="space-y-4">
          {systems.map((system, idx) => (
            <div key={idx} className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/50 p-6 hover:border-slate-600 transition-all shadow-lg group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  {editingCategoryOld === system.service_type ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCategoryNew}
                        onChange={(e) => setEditingCategoryNew(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-3 py-1 text-white text-lg font-bold"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameCategory();
                          if (e.key === 'Escape') {
                            setEditingCategoryOld(null);
                            setEditingCategoryNew('');
                          }
                        }}
                      />
                      <button
                        onClick={handleRenameCategory}
                        disabled={updatingCategory}
                        className="p-2 text-green-400 hover:text-green-300 transition-colors"
                        title="Save"
                      >
                        <Save size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingCategoryOld(null);
                          setEditingCategoryNew('');
                        }}
                        className="p-2 text-slate-400 hover:text-slate-300 transition-colors"
                        title="Cancel"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-bold text-white">{system.service_type}</h4>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingCategoryOld(system.service_type);
                            setEditingCategoryNew(system.service_type);
                          }}
                          className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                          title="Rename category"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenRecategorize(system.service_type)}
                          className="p-1 text-orange-400 hover:text-orange-300 transition-colors"
                          title="Manage items"
                        >
                          <PieChart size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-slate-400 mt-1">{system.item_count} line items</p>
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

      <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-4 text-sm text-green-300">
        <CheckCircle size={16} className="inline mr-2" />
        Categories are now editable. Hover over a category to rename or manage its items.
      </div>

      {/* Recategorize Modal */}
      {showRecategorizeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Manage Items in "{selectedCategory}"</h3>
                  <p className="text-sm text-slate-400 mt-1">Reassign items to different categories</p>
                </div>
                <button
                  onClick={() => {
                    setShowRecategorizeModal(false);
                    setSelectedCategory(null);
                    setCategoryItems([]);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingItems ? (
                <div className="text-center text-slate-400 py-8">Loading items...</div>
              ) : categoryItems.length > 0 ? (
                <div className="space-y-3">
                  {categoryItems.map((item) => (
                    <div key={item.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-white font-medium mb-1">{item.description}</p>
                          <p className="text-sm text-slate-400">
                            Qty: {item.quantity} × ${item.unit_price?.toFixed(2)} = ${item.total_price?.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            onChange={(e) => {
                              if (e.target.value && confirm('Move this item to the selected category?')) {
                                handleRecategorizeItem(item.id, e.target.value);
                              }
                            }}
                            className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm text-white"
                            defaultValue=""
                          >
                            <option value="">Move to...</option>
                            {systems.filter(s => s.service_type !== selectedCategory).map(s => (
                              <option key={s.service_type} value={s.service_type}>
                                {s.service_type}
                              </option>
                            ))}
                            <option value="NEW_CATEGORY">+ New Category</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8">No items in this category</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface Inclusion {
  id: string;
  description: string;
  sort_order: number;
}

interface Exclusion {
  id: string;
  description: string;
  sort_order: number;
}

function InclusionsExclusionsTab({ projectId }: { projectId: string }) {
  const [inclusions, setInclusions] = useState<Inclusion[]>([]);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInclusionId, setEditingInclusionId] = useState<string | null>(null);
  const [editingExclusionId, setEditingExclusionId] = useState<string | null>(null);
  const [editInclusionText, setEditInclusionText] = useState('');
  const [editExclusionText, setEditExclusionText] = useState('');
  const [isAddingInclusion, setIsAddingInclusion] = useState(false);
  const [isAddingExclusion, setIsAddingExclusion] = useState(false);
  const [newInclusionText, setNewInclusionText] = useState('');
  const [newExclusionText, setNewExclusionText] = useState('');
  const [tagsClarifications, setTagsClarifications] = useState<any[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showTagsSection, setShowTagsSection] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [projectId]);

  const loadAllData = async () => {
    await Promise.all([
      loadInclusionsExclusions(),
      loadTagsClarifications(),
      loadProjectInfo()
    ]);
  };

  const loadInclusionsExclusions = async () => {
    try {
      const { data: inclusionsData } = await supabase
        .from('contract_inclusions')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      const { data: exclusionsData } = await supabase
        .from('contract_exclusions')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      setInclusions(inclusionsData || []);
      setExclusions(exclusionsData || []);
    } catch (error) {
      console.error('Error loading inclusions/exclusions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTagsClarifications = async () => {
    try {
      const { data } = await supabase
        .from('contract_tags_clarifications')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      setTagsClarifications(data || []);
    } catch (error) {
      console.error('Error loading tags & clarifications:', error);
    } finally {
      setLoadingTags(false);
    }
  };

  const loadProjectInfo = async () => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .maybeSingle();

      if (data) {
        setProjectName(data.name);
      }
    } catch (error) {
      console.error('Error loading project info:', error);
    }
  };

  const handleExportTags = async () => {
    const totalItems = tagsClarifications.length + inclusions.length + exclusions.length;

    if (totalItems === 0) {
      alert('No tags, inclusions, or exclusions to export');
      return;
    }

    setExporting(true);
    try {
      await exportTagsClarificationsToExcel(projectId, projectName);
    } catch (error: any) {
      console.error('Export error:', error);
      alert(error.message || 'Failed to export tags & clarifications');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveInclusion = async () => {
    if (!editingInclusionId) return;

    try {
      const { error } = await supabase
        .from('contract_inclusions')
        .update({ description: editInclusionText })
        .eq('id', editingInclusionId);

      if (error) throw error;

      await loadInclusionsExclusions();
      setEditingInclusionId(null);
      setEditInclusionText('');
    } catch (error) {
      console.error('Error updating inclusion:', error);
      alert('Failed to update inclusion');
    }
  };

  const handleSaveExclusion = async () => {
    if (!editingExclusionId) return;

    try {
      const { error } = await supabase
        .from('contract_exclusions')
        .update({ description: editExclusionText })
        .eq('id', editingExclusionId);

      if (error) throw error;

      await loadInclusionsExclusions();
      setEditingExclusionId(null);
      setEditExclusionText('');
    } catch (error) {
      console.error('Error updating exclusion:', error);
      alert('Failed to update exclusion');
    }
  };

  const handleAddInclusion = async () => {
    if (!newInclusionText.trim()) return;

    try {
      const maxSort = Math.max(...inclusions.map(i => i.sort_order), 0);

      const { error } = await supabase
        .from('contract_inclusions')
        .insert({
          project_id: projectId,
          description: newInclusionText,
          sort_order: maxSort + 1
        });

      if (error) throw error;

      await loadInclusionsExclusions();
      setIsAddingInclusion(false);
      setNewInclusionText('');
    } catch (error) {
      console.error('Error adding inclusion:', error);
      alert('Failed to add inclusion');
    }
  };

  const handleAddExclusion = async () => {
    if (!newExclusionText.trim()) return;

    try {
      const maxSort = Math.max(...exclusions.map(e => e.sort_order), 0);

      const { error } = await supabase
        .from('contract_exclusions')
        .insert({
          project_id: projectId,
          description: newExclusionText,
          sort_order: maxSort + 1
        });

      if (error) throw error;

      await loadInclusionsExclusions();
      setIsAddingExclusion(false);
      setNewExclusionText('');
    } catch (error) {
      console.error('Error adding exclusion:', error);
      alert('Failed to add exclusion');
    }
  };

  const handleDeleteInclusion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inclusion?')) return;

    try {
      const { error } = await supabase
        .from('contract_inclusions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadInclusionsExclusions();
    } catch (error) {
      console.error('Error deleting inclusion:', error);
      alert('Failed to delete inclusion');
    }
  };

  const handleDeleteExclusion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this exclusion?')) return;

    try {
      const { error } = await supabase
        .from('contract_exclusions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadInclusionsExclusions();
    } catch (error) {
      console.error('Error deleting exclusion:', error);
      alert('Failed to delete exclusion');
    }
  };

  if (loading) {
    return <div className="text-slate-400">Loading inclusions and exclusions...</div>;
  }

  const totalExportItems = tagsClarifications.length + inclusions.length + exclusions.length;
  const hasExportData = totalExportItems > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Inclusions & Exclusions</h3>
          <p className="text-slate-400 text-sm">Define what's included and excluded in the contract scope</p>
        </div>
        <button
          onClick={handleExportTags}
          disabled={!hasExportData || exporting}
          title={!hasExportData ? 'No tags, inclusions, or exclusions to export' : 'Export Tags & Clarifications (Excel)'}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
        >
          <FileSpreadsheet size={16} />
          {exporting ? 'Exporting...' : 'Export Tags & Clarifications (Excel)'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="text-green-500" size={20} />
              <h4 className="text-base font-semibold text-white">Inclusions</h4>
            </div>
            <button
              onClick={() => setIsAddingInclusion(true)}
              className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-all"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          <ul className="space-y-3">
            {isAddingInclusion && (
              <li className="flex items-start gap-2 bg-slate-800/50 p-3 rounded border border-slate-700">
                <textarea
                  value={newInclusionText}
                  onChange={(e) => setNewInclusionText(e.target.value)}
                  placeholder="Enter inclusion description..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={handleAddInclusion}
                    className="p-1 text-green-400 hover:text-green-300 transition-colors"
                    title="Save"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingInclusion(false);
                      setNewInclusionText('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              </li>
            )}

            {inclusions.map((item) => (
              <li key={item.id} className="flex items-start gap-3 group">
                {editingInclusionId === item.id ? (
                  <>
                    <span className="text-green-500 mt-2">•</span>
                    <textarea
                      value={editInclusionText}
                      onChange={(e) => setEditInclusionText(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex flex-col gap-1 mt-1">
                      <button
                        onClick={handleSaveInclusion}
                        className="p-1 text-green-400 hover:text-green-300 transition-colors"
                        title="Save"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingInclusionId(null);
                          setEditInclusionText('');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-green-500 mt-0.5">•</span>
                    <span className="flex-1 text-sm text-slate-300">{item.description}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingInclusionId(item.id);
                          setEditInclusionText(item.description);
                        }}
                        className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteInclusion(item.id)}
                        className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}

            {inclusions.length === 0 && !isAddingInclusion && (
              <li className="text-sm text-slate-500 italic">No inclusions added yet</li>
            )}
          </ul>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-red-500" size={20} />
              <h4 className="text-base font-semibold text-white">Exclusions</h4>
            </div>
            <button
              onClick={() => setIsAddingExclusion(true)}
              className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-all"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          <ul className="space-y-3">
            {isAddingExclusion && (
              <li className="flex items-start gap-2 bg-slate-800/50 p-3 rounded border border-slate-700">
                <textarea
                  value={newExclusionText}
                  onChange={(e) => setNewExclusionText(e.target.value)}
                  placeholder="Enter exclusion description..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={handleAddExclusion}
                    className="p-1 text-green-400 hover:text-green-300 transition-colors"
                    title="Save"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingExclusion(false);
                      setNewExclusionText('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              </li>
            )}

            {exclusions.map((item) => (
              <li key={item.id} className="flex items-start gap-3 group">
                {editingExclusionId === item.id ? (
                  <>
                    <span className="text-red-500 mt-2">•</span>
                    <textarea
                      value={editExclusionText}
                      onChange={(e) => setEditExclusionText(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex flex-col gap-1 mt-1">
                      <button
                        onClick={handleSaveExclusion}
                        className="p-1 text-green-400 hover:text-green-300 transition-colors"
                        title="Save"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingExclusionId(null);
                          setEditExclusionText('');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-red-500 mt-0.5">•</span>
                    <span className="flex-1 text-sm text-slate-300">{item.description}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingExclusionId(item.id);
                          setEditExclusionText(item.description);
                        }}
                        className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteExclusion(item.id)}
                        className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}

            {exclusions.length === 0 && !isAddingExclusion && (
              <li className="text-sm text-slate-500 italic">No exclusions added yet</li>
            )}
          </ul>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag className="text-amber-500" size={20} />
            <h4 className="text-base font-semibold text-white">Tags & Clarifications</h4>
            <span className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-400">
              {totalExportItems} total items ({tagsClarifications.length} tags, {inclusions.length} inclusions, {exclusions.length} exclusions)
            </span>
          </div>
          <button
            onClick={() => setShowTagsSection(!showTagsSection)}
            className="flex items-center gap-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-all"
          >
            {showTagsSection ? 'Hide' : 'Show'} Details
            <ChevronRight size={14} className={`transition-transform ${showTagsSection ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {showTagsSection && (
          <div className="space-y-4">
            {loadingTags ? (
              <div className="text-slate-400 text-sm">Loading tags & clarifications...</div>
            ) : tagsClarifications.length === 0 && inclusions.length === 0 && exclusions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Tag size={48} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tags, inclusions, or exclusions yet</p>
                <p className="text-xs mt-1">Add inclusions/exclusions above, or tags will appear here when created</p>
              </div>
            ) : tagsClarifications.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle size={48} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">You have {inclusions.length} inclusions and {exclusions.length} exclusions ready to export</p>
                <p className="text-xs mt-1">Click "Export to Excel" above to download all items for subcontractor review</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left">
                      <th className="py-2 px-3 text-slate-400 font-medium">Ref</th>
                      <th className="py-2 px-3 text-slate-400 font-medium">Type</th>
                      <th className="py-2 px-3 text-slate-400 font-medium">Title</th>
                      <th className="py-2 px-3 text-slate-400 font-medium">Status</th>
                      <th className="py-2 px-3 text-slate-400 font-medium">Cost Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagsClarifications.map((tag) => (
                      <tr key={tag.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="py-3 px-3 text-slate-300 font-mono text-xs">{tag.tag_ref}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            tag.tag_type === 'Risk' ? 'bg-red-900/30 text-red-400' :
                            tag.tag_type === 'Hold Point' ? 'bg-orange-900/30 text-orange-400' :
                            tag.tag_type === 'Assumption' ? 'bg-blue-900/30 text-blue-400' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {tag.tag_type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-white">{tag.title}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            tag.status === 'Closed' ? 'bg-green-900/30 text-green-400' :
                            tag.status === 'Agreed' ? 'bg-blue-900/30 text-blue-400' :
                            tag.status === 'To Pre-let' ? 'bg-amber-900/30 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {tag.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            tag.cost_impact === 'Variation Required' || tag.cost_impact === 'Confirmed' ? 'bg-red-900/30 text-red-400' :
                            tag.cost_impact === 'Potential' ? 'bg-amber-900/30 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {tag.cost_impact}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-400">
                Export includes all tags, inclusions, and exclusions with full details for subcontractor review
              </p>
              <button
                onClick={handleExportTags}
                disabled={!hasExportData || exporting}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-all"
              >
                <FileSpreadsheet size={14} />
                Export to Excel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-sm text-green-300">
        <CheckCircle size={16} className="inline mr-2" />
        Inclusions and exclusions are editable and will be automatically included in both the Tags & Clarifications Excel export and Handover Packs.
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


interface OnboardingTabProps {
  projectId: string;
  awardInfo: AwardInfo | null;
  scopeSystems: ScopeSystem[];
  organisationLogoUrl: string | null;
}

function OnboardingTab({ projectId, awardInfo, scopeSystems, organisationLogoUrl }: OnboardingTabProps) {
  const [currentStep, setCurrentStep] = useState<'loi' | 'compliance' | 'prelet'>('loi');
  const [loi, setLoi] = useState<LetterOfIntent | null>(null);
  const [loadingLoi, setLoadingLoi] = useState(true);
  const [complianceDocs, setComplianceDocs] = useState<ComplianceDocument[]>([]);
  const [loadingCompliance, setLoadingCompliance] = useState(true);
  const [preletAppendix, setPreletAppendix] = useState<any>(null);
  const [loadingPrelet, setLoadingPrelet] = useState(true);

  useEffect(() => {
    loadOnboardingData();
  }, [projectId]);

  const loadOnboardingData = async () => {
    try {
      const { data: loiData } = await supabase
        .from('letters_of_intent')
        .select('*')
        .eq('project_id', projectId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loiData) {
        setLoi(loiData as any);
      }

      const { data: complianceData } = await supabase
        .from('onboarding_compliance_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false });

      setComplianceDocs((complianceData || []) as any);

      const { data: preletData } = await supabase
        .from('prelet_appendix')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (preletData) {
        setPreletAppendix(preletData);
      }
    } catch (error) {
      console.error('Error loading onboarding data:', error);
    } finally {
      setLoadingLoi(false);
      setLoadingCompliance(false);
      setLoadingPrelet(false);
    }
  };

  const steps = [
    { id: 'loi', label: 'Letter of Intent', icon: FileText, completed: loi !== null },
    { id: 'compliance', label: 'Compliance Documents', icon: Shield, completed: complianceDocs.length > 0 },
    { id: 'prelet', label: 'Pre-let Minute Appendix', icon: FileCheck, completed: preletAppendix !== null }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-white mb-2">Subcontractor Onboarding</h3>
        <p className="text-slate-400">Guided onboarding process for your awarded subcontractor</p>
      </div>

      <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-6 border border-slate-700">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = step.completed;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => setCurrentStep(step.id as any)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-900/30 border border-blue-700'
                    : isCompleted
                    ? 'bg-green-900/20 border border-green-700/50'
                    : 'bg-slate-800/50 border border-slate-700/50'
                }`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    isCompleted
                      ? 'bg-green-600 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {isCompleted ? <CheckCircle size={16} /> : <Icon size={16} />}
                </div>
                <div className="text-left">
                  <div className={`text-sm font-medium ${isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-slate-400'}`}>
                    Step {index + 1}
                  </div>
                  <div className={`text-xs ${isActive ? 'text-blue-300' : isCompleted ? 'text-green-300' : 'text-slate-500'}`}>
                    {step.label}
                  </div>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-600' : 'bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-6">
        {currentStep === 'loi' && (
          <LOIStep
            projectId={projectId}
            awardInfo={awardInfo}
            scopeSystems={scopeSystems}
            organisationLogoUrl={organisationLogoUrl}
            existingLoi={loi}
            onLoiUpdated={loadOnboardingData}
          />
        )}
        {currentStep === 'compliance' && (
          <ComplianceStep
            projectId={projectId}
            complianceDocs={complianceDocs}
            onDocsUpdated={loadOnboardingData}
          />
        )}
        {currentStep === 'prelet' && (
          <PreletAppendixStep
            projectId={projectId}
            awardInfo={awardInfo}
            scopeSystems={scopeSystems}
            existingAppendix={preletAppendix}
            onAppendixUpdated={loadOnboardingData}
          />
        )}
      </div>
    </div>
  );
}

interface LOIStepProps {
  projectId: string;
  awardInfo: AwardInfo | null;
  scopeSystems: ScopeSystem[];
  organisationLogoUrl: string | null;
  existingLoi: LetterOfIntent | null;
  onLoiUpdated: () => void;
}

function LOIStep({ projectId, awardInfo, scopeSystems, organisationLogoUrl, existingLoi, onLoiUpdated }: LOIStepProps) {
  const [showForm, setShowForm] = useState(false);
  const [confirmedNonBinding, setConfirmedNonBinding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [formData, setFormData] = useState({
    supplier_contact: awardInfo?.supplier_contact || '',
    supplier_email: awardInfo?.supplier_email || '',
    supplier_phone: awardInfo?.supplier_phone || '',
    supplier_address: awardInfo?.supplier_address || '',
    scope_summary: `Fire protection and passive fire stopping works for ${awardInfo?.supplier_name || 'project'}`,
    target_start_date: '',
    target_completion_date: '',
    custom_terms: ''
  });

  // Update form data when awardInfo changes
  useEffect(() => {
    if (awardInfo && !existingLoi) {
      setFormData(prev => ({
        ...prev,
        supplier_contact: awardInfo.supplier_contact || prev.supplier_contact,
        supplier_email: awardInfo.supplier_email || prev.supplier_email,
        supplier_phone: awardInfo.supplier_phone || prev.supplier_phone,
        supplier_address: awardInfo.supplier_address || prev.supplier_address
      }));
    }
  }, [awardInfo, existingLoi]);

  const handleGenerate = async () => {
    if (!confirmedNonBinding) {
      alert('Please confirm that you understand this is a non-binding document');
      return;
    }

    setGenerating(true);
    try {
      const serviceTypes = scopeSystems.map(s => s.service_type);

      const { error } = await supabase.from('letters_of_intent').insert({
        project_id: projectId,
        supplier_name: awardInfo?.supplier_name || 'TBC',
        supplier_contact: formData.supplier_contact,
        supplier_email: formData.supplier_email,
        supplier_phone: formData.supplier_phone || null,
        supplier_address: formData.supplier_address || null,
        scope_summary: formData.scope_summary,
        service_types: serviceTypes,
        target_start_date: formData.target_start_date || null,
        target_completion_date: formData.target_completion_date || null,
        key_milestones: [
          { title: 'Site Mobilization', date: formData.target_start_date || 'TBC' },
          { title: 'Works Completion', date: formData.target_completion_date || 'TBC' }
        ],
        next_steps_checklist: [
          { step: 'Provide insurance certificates', completed: false },
          { step: 'Submit method statements', completed: false },
          { step: 'Confirm availability and resources', completed: false },
          { step: 'Review scope and schedule', completed: false }
        ],
        custom_terms: formData.custom_terms,
        status: 'draft',
        user_confirmed_nonbinding: confirmedNonBinding
      });

      if (error) throw error;

      await supabase.rpc('log_onboarding_event', {
        p_project_id: projectId,
        p_event_type: 'loi_generated',
        p_event_data: { supplier: awardInfo?.supplier_name }
      });

      alert('Letter of Intent generated successfully!');
      setShowForm(false);
      onLoiUpdated();
    } catch (error) {
      console.error('Error generating LOI:', error);
      alert('Failed to generate Letter of Intent');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!existingLoi) return;

    const htmlContent = generateLOIHtml(existingLoi, awardInfo, organisationLogoUrl);
    generatePdfWithPrint(htmlContent, `LOI_Draft_${awardInfo?.supplier_name?.replace(/[^a-zA-Z0-9]/g, '_')}`);
  };

  if (!awardInfo) {
    return <div className="text-slate-400">No award information available</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-xl font-bold text-white mb-2">Letter of Intent</h4>
          <p className="text-slate-400">Generate a non-binding letter of intent for your subcontractor</p>
        </div>
        {existingLoi && !showForm && (
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all"
            >
              <Download size={16} />
              Download LOI
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-all"
            >
              <Edit2 size={16} />
              Regenerate
            </button>
          </div>
        )}
        {!existingLoi && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 transition-all"
          >
            <Plus size={16} />
            Generate Letter of Intent
          </button>
        )}
      </div>

      <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-red-300">
            <div className="font-semibold mb-1">LEGAL DISCLAIMER</div>
            <p>
              This Letter of Intent is a NON-BINDING expression of intent only. No contractual relationship is created until formal contract execution.
              This document is subject to legal review and creates no liability. Always consult with legal counsel before sending.
            </p>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="space-y-4 bg-slate-900/50 rounded-lg p-6 border border-slate-700">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Contact Person</label>
              <input
                type="text"
                value={formData.supplier_contact}
                onChange={(e) => setFormData({ ...formData, supplier_contact: e.target.value })}
                placeholder="John Smith - Operations Manager"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
              <input
                type="email"
                value={formData.supplier_email}
                onChange={(e) => setFormData({ ...formData, supplier_email: e.target.value })}
                placeholder="john@supplier.com"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
              <input
                type="tel"
                value={formData.supplier_phone}
                onChange={(e) => setFormData({ ...formData, supplier_phone: e.target.value })}
                placeholder="+61 400 000 000"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Supplier Address</label>
              <input
                type="text"
                value={formData.supplier_address}
                onChange={(e) => setFormData({ ...formData, supplier_address: e.target.value })}
                placeholder="123 Main St, City"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Scope Summary</label>
            <textarea
              value={formData.scope_summary}
              onChange={(e) => setFormData({ ...formData, scope_summary: e.target.value })}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Target Start Date</label>
              <input
                type="date"
                value={formData.target_start_date}
                onChange={(e) => setFormData({ ...formData, target_start_date: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Target Completion Date</label>
              <input
                type="date"
                value={formData.target_completion_date}
                onChange={(e) => setFormData({ ...formData, target_completion_date: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Additional Terms (Optional)</label>
            <textarea
              value={formData.custom_terms}
              onChange={(e) => setFormData({ ...formData, custom_terms: e.target.value })}
              rows={3}
              placeholder="Any additional terms or conditions..."
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            />
          </div>

          <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedNonBinding}
                onChange={(e) => setConfirmedNonBinding(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-orange-300">
                I confirm that I understand this is a NON-BINDING document and creates no legal obligations or liabilities.
                I will seek legal review before sending to the subcontractor.
              </span>
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !confirmedNonBinding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating...' : 'Generate LOI'}
            </button>
          </div>
        </div>
      )}

      {existingLoi && !showForm && (
        <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <div>
              <div className="text-sm text-slate-400">Generated</div>
              <div className="text-white font-medium">
                {new Date(existingLoi.generated_at).toLocaleDateString()}
              </div>
            </div>
            <div className={`px-3 py-1 rounded text-sm ${
              existingLoi.status === 'sent'
                ? 'bg-blue-900/30 text-blue-400 border border-blue-700'
                : existingLoi.status === 'acknowledged'
                ? 'bg-green-900/30 text-green-400 border border-green-700'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {existingLoi.status.charAt(0).toUpperCase() + existingLoi.status.slice(1)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Supplier</div>
              <div className="text-white font-medium">{existingLoi.supplier_name}</div>
            </div>
            <div>
              <div className="text-slate-400">Contact Person</div>
              <div className="text-white">{existingLoi.supplier_contact || 'N/A'}</div>
            </div>
            <div>
              <div className="text-slate-400">Email</div>
              <div className="text-white text-sm">{existingLoi.supplier_email || 'N/A'}</div>
            </div>
            <div>
              <div className="text-slate-400">Phone</div>
              <div className="text-white text-sm">{existingLoi.supplier_phone || awardInfo?.supplier_phone || 'N/A'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Address</div>
              <div className="text-white text-sm">{existingLoi.supplier_address || awardInfo?.supplier_address || 'N/A'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mt-4">
            <div>
              <div className="text-slate-400">Target Start</div>
              <div className="text-white">
                {existingLoi.target_start_date
                  ? new Date(existingLoi.target_start_date).toLocaleDateString()
                  : 'TBC'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Target Completion</div>
              <div className="text-white">
                {existingLoi.target_completion_date
                  ? new Date(existingLoi.target_completion_date).toLocaleDateString()
                  : 'TBC'}
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm text-slate-400 mb-2">Service Types</div>
            <div className="flex flex-wrap gap-2">
              {existingLoi.service_types.map((type, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-900/30 text-blue-400 text-sm rounded border border-blue-700"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ComplianceStepProps {
  projectId: string;
  complianceDocs: ComplianceDocument[];
  onDocsUpdated: () => void;
}

function ComplianceStep({ projectId, complianceDocs, onDocsUpdated }: ComplianceStepProps) {
  const [uploading, setUploading] = useState(false);

  const requiredDocs = [
    { type: 'insurance', label: 'Public Liability Insurance', icon: Shield },
    { type: 'safety', label: 'Health & Safety Documentation', icon: Shield },
    { type: 'license', label: 'Trade License/Certification', icon: FileCheck },
    { type: 'method_statement', label: 'Method Statements', icon: FileText }
  ];

  const handleFileUpload = async (docType: string, file: File) => {
    setUploading(true);
    try {
      const filePath = `${projectId}/${docType}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('compliance-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('onboarding_compliance_documents')
        .insert({
          project_id: projectId,
          document_type: docType,
          document_name: file.name,
          file_path: filePath,
          status: 'submitted'
        });

      if (dbError) throw dbError;

      await supabase.rpc('log_onboarding_event', {
        p_project_id: projectId,
        p_event_type: 'compliance_uploaded',
        p_event_data: { document_type: docType, file_name: file.name }
      });

      onDocsUpdated();
      alert('Document uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xl font-bold text-white mb-2">Compliance Documents</h4>
        <p className="text-slate-400">Collect required documentation from your subcontractor</p>
      </div>

      <div className="grid gap-4">
        {requiredDocs.map((doc) => {
          const Icon = doc.icon;
          const submitted = complianceDocs.filter(d => d.document_type === doc.type);

          return (
            <div key={doc.type} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded-lg">
                    <Icon className="text-blue-400" size={20} />
                  </div>
                  <div>
                    <div className="text-white font-medium">{doc.label}</div>
                    <div className="text-sm text-slate-400">
                      {submitted.length} document{submitted.length !== 1 ? 's' : ''} uploaded
                    </div>
                  </div>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(doc.type, file);
                    }}
                    className="hidden"
                    disabled={uploading}
                  />
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all text-sm">
                    <Upload size={16} />
                    Upload
                  </div>
                </label>
              </div>

              {submitted.length > 0 && (
                <div className="space-y-2 mt-3 pt-3 border-t border-slate-700">
                  {submitted.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" />
                        <span className="text-white">{doc.document_name}</span>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs ${
                        doc.status === 'verified'
                          ? 'bg-green-900/30 text-green-400'
                          : doc.status === 'rejected'
                          ? 'bg-red-900/30 text-red-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {doc.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PreletAppendixStepProps {
  projectId: string;
  awardInfo: AwardInfo | null;
  scopeSystems: ScopeSystem[];
  existingAppendix: any;
  onAppendixUpdated: () => void;
}

function PreletAppendixStep({ projectId, awardInfo, scopeSystems, existingAppendix, onAppendixUpdated }: PreletAppendixStepProps) {
  const [editing, setEditing] = useState(!existingAppendix);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [awardOverview, setAwardOverview] = useState<any>(null);
  const [loadingAward, setLoadingAward] = useState(true);
  const [editingPricingBasis, setEditingPricingBasis] = useState(false);
  const [formData, setFormData] = useState({
    scope_summary: existingAppendix?.scope_summary || '',
    pricing_basis: existingAppendix?.pricing_basis || '',
    inclusions: existingAppendix?.inclusions || [],
    exclusions: existingAppendix?.exclusions || [],
    commercial_assumptions: existingAppendix?.commercial_assumptions || [],
    clarifications: existingAppendix?.clarifications || [],
    known_risks: existingAppendix?.known_risks || []
  });

  const [newInclusion, setNewInclusion] = useState('');
  const [newInclusionRef, setNewInclusionRef] = useState('');
  const [newExclusion, setNewExclusion] = useState('');
  const [newExclusionRef, setNewExclusionRef] = useState('');
  const [newAssumption, setNewAssumption] = useState('');
  const [newAssumptionRef, setNewAssumptionRef] = useState('');
  const [newClarification, setNewClarification] = useState('');
  const [newClarificationRef, setNewClarificationRef] = useState('');
  const [newRisk, setNewRisk] = useState('');
  const [newRiskRef, setNewRiskRef] = useState('');

  // Fetch award overview from approved quote
  useEffect(() => {
    const fetchAwardOverview = async () => {
      if (existingAppendix?.awarded_subcontractor) {
        // Already has snapshot, use it
        setAwardOverview({
          awarded_subcontractor: existingAppendix.awarded_subcontractor,
          awarded_total_ex_gst: existingAppendix.awarded_total_ex_gst,
          awarded_total_inc_gst: existingAppendix.awarded_total_inc_gst,
          awarded_pricing_basis: existingAppendix.awarded_pricing_basis,
          award_date: existingAppendix.award_date,
          award_status: existingAppendix.award_status,
          quote_reference: existingAppendix.quote_reference,
          quote_revision: existingAppendix.quote_revision,
          quote_id: existingAppendix.quote_id,
          award_report_id: existingAppendix.award_report_id,
          scope_summary_snapshot: existingAppendix.scope_summary_snapshot,
          systems_snapshot: existingAppendix.systems_snapshot,
          attachments_snapshot: existingAppendix.attachments_snapshot
        });
        setLoadingAward(false);
        return;
      }

      // Fetch from approved quote
      try {
        const { data: project } = await supabase
          .from('projects')
          .select('approved_quote_id, client, main_contractor')
          .eq('id', projectId)
          .single();

        if (!project?.approved_quote_id) {
          setLoadingAward(false);
          return;
        }

        const { data: quote } = await supabase
          .from('quotes')
          .select('id, supplier_id, total_amount, file_url, created_at, suppliers(name)')
          .eq('id', project.approved_quote_id)
          .single();

        const { data: awardReport } = await supabase
          .from('award_reports')
          .select('id, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (quote) {
          const totalExGst = quote.total_amount || 0;
          const totalIncGst = totalExGst * 1.15; // Assuming 15% GST

          const overview = {
            awarded_subcontractor: quote.suppliers?.name || awardInfo?.supplier_name || 'Unknown',
            awarded_total_ex_gst: totalExGst,
            awarded_total_inc_gst: totalIncGst,
            awarded_pricing_basis: 'fixed_price_lump_sum', // Default to most common option
            award_date: quote.created_at,
            award_status: 'Approved',
            quote_reference: `Q-${quote.id.slice(0, 8).toUpperCase()}`,
            quote_revision: '1.0',
            quote_id: quote.id,
            award_report_id: awardReport?.id,
            scope_summary_snapshot: awardInfo?.summary || 'See scope systems below',
            systems_snapshot: scopeSystems.map(s => ({
              service_type: s.service_type,
              item_count: s.item_count,
              coverage: s.coverage
            })),
            attachments_snapshot: [
              { name: 'Awarded Quote', type: 'quote_pdf', url: quote.file_url },
              { name: 'Award Report', type: 'award_report', id: awardReport?.id }
            ].filter(a => a.url || a.id)
          };

          setAwardOverview(overview);

          // Auto-populate scope_summary if empty (only for new appendix)
          if (!existingAppendix && !formData.scope_summary) {
            setFormData(prev => ({
              ...prev,
              scope_summary: overview.scope_summary_snapshot || ''
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching award overview:', error);
      } finally {
        setLoadingAward(false);
      }
    };

    fetchAwardOverview();
  }, [projectId, existingAppendix, awardInfo, scopeSystems]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dataToSave = {
        project_id: projectId,
        scope_summary: formData.scope_summary,
        pricing_basis: formData.pricing_basis,
        inclusions: formData.inclusions,
        exclusions: formData.exclusions,
        commercial_assumptions: formData.commercial_assumptions,
        clarifications: formData.clarifications,
        known_risks: formData.known_risks
      };

      if (existingAppendix) {
        const { error } = await supabase
          .from('prelet_appendix')
          .update(dataToSave)
          .eq('id', existingAppendix.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('prelet_appendix')
          .insert(dataToSave);
        if (error) throw error;
      }

      onAppendixUpdated();
      setEditing(false);
      alert('Pre-let Minute Appendix saved successfully!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save appendix');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalise = async () => {
    // Validate ONLY required field: pricing_basis
    if (!formData.pricing_basis) {
      alert('Please select a Pricing Basis & Commercial Structure before finalising the appendix');
      return;
    }

    if (!confirm('Once finalised, this appendix cannot be edited. The award overview will be locked as an immutable snapshot. Continue?')) return;

    setSaving(true);
    try {
      let appendixId = existingAppendix?.id;

      // If appendix doesn't exist yet, create it first
      if (!existingAppendix) {
        const dataToSave = {
          project_id: projectId,
          scope_summary: formData.scope_summary,
          pricing_basis: formData.pricing_basis,
          inclusions: formData.inclusions,
          exclusions: formData.exclusions,
          commercial_assumptions: formData.commercial_assumptions,
          clarifications: formData.clarifications,
          known_risks: formData.known_risks
        };

        const { data: newAppendix, error: insertError } = await supabase
          .from('prelet_appendix')
          .insert(dataToSave)
          .select()
          .single();

        if (insertError) throw insertError;
        appendixId = newAppendix.id;
      }

      // Prepare finalization data with award snapshot
      const finalizationData: any = {
        is_finalised: true,
        finalised_at: new Date().toISOString(),
        finalised_by: (await supabase.auth.getUser()).data.user?.id
      };

      // Snapshot award overview if available
      if (awardOverview) {
        finalizationData.awarded_subcontractor = awardOverview.awarded_subcontractor;
        finalizationData.awarded_total_ex_gst = awardOverview.awarded_total_ex_gst;
        finalizationData.awarded_total_inc_gst = awardOverview.awarded_total_inc_gst;
        finalizationData.awarded_pricing_basis = formData.pricing_basis; // Use selected pricing_basis
        finalizationData.award_date = awardOverview.award_date;
        finalizationData.award_status = awardOverview.award_status;
        finalizationData.quote_reference = awardOverview.quote_reference;
        finalizationData.quote_revision = awardOverview.quote_revision;
        finalizationData.quote_id = awardOverview.quote_id;
        finalizationData.award_report_id = awardOverview.award_report_id;
        finalizationData.scope_summary_snapshot = awardOverview.scope_summary_snapshot;
        finalizationData.systems_snapshot = awardOverview.systems_snapshot;
        finalizationData.attachments_snapshot = awardOverview.attachments_snapshot;
      }

      const { error } = await supabase
        .from('prelet_appendix')
        .update(finalizationData)
        .eq('id', appendixId);

      if (error) throw error;

      onAppendixUpdated();
      alert('Pre-let Minute Appendix finalised with immutable award snapshot!');
    } catch (error) {
      console.error('Finalise error:', error);
      alert('Failed to finalise appendix');
    } finally {
      setSaving(false);
    }
  };

  const handleUnfinalise = async () => {
    if (!existingAppendix) return;

    if (!confirm('Are you sure you want to unfinalise this appendix? You will be able to edit it again.')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('prelet_appendix')
        .update({
          is_finalised: false,
          finalised_at: null,
          finalised_by: null
        })
        .eq('id', existingAppendix.id);

      if (error) throw error;

      onAppendixUpdated();
      alert('Appendix unfinalised successfully. You can now edit it.');
    } catch (error) {
      console.error('Unfinalise error:', error);
      alert('Failed to unfinalise appendix');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePricingBasis = async () => {
    if (!existingAppendix) return;

    if (!formData.pricing_basis) {
      alert('Please select a Pricing Basis before saving');
      return;
    }

    if (!confirm('Update the Pricing Basis for this finalized appendix?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('prelet_appendix')
        .update({
          pricing_basis: formData.pricing_basis,
          awarded_pricing_basis: formData.pricing_basis // Also update snapshot
        })
        .eq('id', existingAppendix.id);

      if (error) throw error;

      setEditingPricingBasis(false);
      onAppendixUpdated();
      alert('Pricing Basis updated successfully!');
    } catch (error) {
      console.error('Update pricing basis error:', error);
      alert('Failed to update Pricing Basis');
    } finally {
      setSaving(false);
    }
  };

  const addItem = (type: 'inclusion' | 'exclusion' | 'assumption' | 'clarification' | 'risk', value: string, reference?: string) => {
    if (!value.trim()) return;

    // Create item object with optional reference
    const item: any = typeof value === 'string' ? { text: value } : value;
    if (reference && reference.trim()) {
      item.reference = reference.trim();
      // Detect reference type
      if (reference.toUpperCase().startsWith('TAG-')) {
        item.reference_type = 'tag';
      } else if (reference.toUpperCase().startsWith('ARD-') || reference.toUpperCase().startsWith('AWD-')) {
        item.reference_type = 'award_line';
      }
    }

    if (type === 'inclusion') {
      setFormData({ ...formData, inclusions: [...formData.inclusions, item] });
      setNewInclusion('');
      setNewInclusionRef('');
    } else if (type === 'exclusion') {
      setFormData({ ...formData, exclusions: [...formData.exclusions, item] });
      setNewExclusion('');
      setNewExclusionRef('');
    } else if (type === 'assumption') {
      setFormData({ ...formData, commercial_assumptions: [...formData.commercial_assumptions, item] });
      setNewAssumption('');
      setNewAssumptionRef('');
    } else if (type === 'clarification') {
      setFormData({ ...formData, clarifications: [...formData.clarifications, item] });
      setNewClarification('');
      setNewClarificationRef('');
    } else {
      setFormData({ ...formData, known_risks: [...formData.known_risks, item] });
      setNewRisk('');
      setNewRiskRef('');
    }
  };

  const removeItem = (type: 'inclusion' | 'exclusion' | 'assumption' | 'clarification' | 'risk', index: number) => {
    if (type === 'inclusion') {
      setFormData({ ...formData, inclusions: formData.inclusions.filter((_, i) => i !== index) });
    } else if (type === 'exclusion') {
      setFormData({ ...formData, exclusions: formData.exclusions.filter((_, i) => i !== index) });
    } else if (type === 'assumption') {
      setFormData({ ...formData, commercial_assumptions: formData.commercial_assumptions.filter((_, i) => i !== index) });
    } else if (type === 'clarification') {
      setFormData({ ...formData, clarifications: formData.clarifications.filter((_, i) => i !== index) });
    } else {
      setFormData({ ...formData, known_risks: formData.known_risks.filter((_, i) => i !== index) });
    }
  };

  const handleGenerate = async () => {
    if (!existingAppendix?.is_finalised) {
      alert('Please save and finalise the appendix before generating the document');
      return;
    }

    setGenerating(true);
    try {
      let htmlContent: string | null = null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export_contract_manager`;

        console.log('Generating Pre-let Appendix for project:', projectId);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            mode: 'prelet_appendix'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          htmlContent = result.html;
          console.log('Pre-let Appendix HTML generated successfully, length:', htmlContent?.length);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Edge function returned error:', errorData);
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
      } catch (edgeError) {
        console.error('Edge function failed:', edgeError);
        throw edgeError;
      }

      if (!htmlContent) {
        throw new Error('Failed to generate Pre-let Appendix HTML content');
      }

      const projectName = awardInfo?.project_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project';
      const filename = `PreletAppendix_${projectName}`;

      await generateAndDownloadPdf({
        htmlContent,
        filename,
        projectName: awardInfo?.project_name,
        contractNumber: undefined,
        reportType: 'Pre-let Appendix'
      });

      alert('Pre-let Appendix PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);

      let errorMessage = 'Failed to generate Pre-let Appendix';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = `Failed to generate Pre-let Appendix: ${error.message}`;
        }
      }

      alert(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const isFinalised = existingAppendix?.is_finalised || false;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xl font-bold text-white mb-2">Pre-let Minute Appendix</h4>
        <p className="text-slate-400">
          Capture subcontractor commercial and scope clarifications to append to main contractor's pre-letting minutes
        </p>
      </div>

      {isFinalised && (
        <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-sm text-green-300">
          <CheckCircle size={16} className="inline mr-2" />
          This appendix is finalised and read-only. Finalised on {new Date(existingAppendix.finalised_at).toLocaleDateString()}
        </div>
      )}

      {/* Awarded Quote Overview - Read-only, Auto-populated */}
      {awardOverview && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h5 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <FileCheck size={20} className="text-orange-500" />
            Awarded Quote Overview
            {isFinalised && (
              <span className="text-xs bg-orange-900/30 text-orange-400 px-2 py-1 rounded">IMMUTABLE SNAPSHOT</span>
            )}
          </h5>
          <p className="text-xs text-slate-400 mb-4">
            Auto-populated from Award Report. {isFinalised ? 'This snapshot is locked and cannot be changed.' : 'Will be locked upon finalization.'}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">Awarded Subcontractor</div>
              <div className="text-sm text-white font-medium">{awardOverview.awarded_subcontractor}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Award Date</div>
              <div className="text-sm text-white">{awardOverview.award_date ? new Date(awardOverview.award_date).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Total (ex GST)</div>
              <div className="text-sm text-white font-medium">${awardOverview.awarded_total_ex_gst?.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Total (inc GST)</div>
              <div className="text-sm text-white font-medium">${awardOverview.awarded_total_inc_gst?.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Pricing Basis</div>
              <div className="text-sm text-white capitalize">{awardOverview.awarded_pricing_basis?.replace(/_/g, ' ') || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Award Status</div>
              <div className="text-sm text-green-400">{awardOverview.award_status}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Quote Reference</div>
              <div className="text-sm text-white font-mono">{awardOverview.quote_reference}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Quote Revision</div>
              <div className="text-sm text-white font-mono">{awardOverview.quote_revision}</div>
            </div>
          </div>

          {awardOverview.scope_summary_snapshot && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-400 mb-2">Scope Summary</div>
              <div className="text-sm text-white">{awardOverview.scope_summary_snapshot}</div>
            </div>
          )}

          {awardOverview.systems_snapshot && awardOverview.systems_snapshot.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-400 mb-2">Systems Included</div>
              <div className="flex flex-wrap gap-2">
                {awardOverview.systems_snapshot.map((sys: any, idx: number) => (
                  <div key={idx} className="bg-slate-700/50 px-3 py-1 rounded text-xs text-white">
                    {sys.service_type} ({sys.item_count} items)
                  </div>
                ))}
              </div>
            </div>
          )}

          {awardOverview.attachments_snapshot && awardOverview.attachments_snapshot.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-400 mb-2">Attachments</div>
              <div className="space-y-2">
                {awardOverview.attachments_snapshot.map((att: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <FileCheck size={14} className="text-slate-400" />
                    <span className="text-white">{att.name}</span>
                    {att.type && <span className="text-xs text-slate-500">({att.type})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loadingAward && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
          <div className="text-slate-400">Loading award overview...</div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Priced Scope Summary (Plain English)
            <span className="text-xs text-slate-500 ml-2 font-normal">(Optional - auto-populated from Award)</span>
          </label>
          <textarea
            value={formData.scope_summary}
            onChange={(e) => setFormData({ ...formData, scope_summary: e.target.value })}
            rows={4}
            placeholder="Auto-populated from Award Report. You can edit or add additional details..."
            disabled={isFinalised}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Pricing Basis & Commercial Structure
            <span className="text-xs text-orange-400 ml-2 font-semibold">*REQUIRED</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">
            Select the pricing basis for this contract. This will be included in the Pre-let Appendix document and PDF.
          </p>

          <div className="flex gap-2 items-start">
            <select
              value={formData.pricing_basis}
              onChange={(e) => {
                console.log('Dropdown changed to:', e.target.value);
                setFormData({ ...formData, pricing_basis: e.target.value });
              }}
              onClick={() => console.log('Dropdown clicked, isFinalised:', isFinalised, 'editingPricingBasis:', editingPricingBasis)}
              onFocus={() => console.log('Dropdown focused')}
              disabled={isFinalised && !editingPricingBasis}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer relative z-10"
              style={{ appearance: 'auto', WebkitAppearance: 'menulist', MozAppearance: 'menulist' }}
            >
              <option value="">Select Pricing Basis...</option>
              <option value="fixed_price_lump_sum">Fixed Price – Lump Sum</option>
              <option value="fixed_price_lump_sum_quoted_quantities">Fixed Price – Lump Sum (Based on Quoted Quantities & Rates)</option>
              <option value="fixed_price_lump_sum_remeasurable">Fixed Price – Lump Sum (Re-measurable Against Issued Drawings)</option>
              <option value="schedule_of_rates">Schedule of Rates (SOR)</option>
              <option value="hybrid_lump_sum_with_sor">Hybrid – Lump Sum with Schedule of Rates Variations</option>
              <option value="provisional_quantities_fixed_rates">Provisional Quantities – Rates Fixed</option>
              <option value="cost_reimbursable">Cost Reimbursable (Time & Materials)</option>
            </select>

            {isFinalised && !editingPricingBasis && (
              <button
                onClick={() => setEditingPricingBasis(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Edit size={16} />
                Change
              </button>
            )}

            {editingPricingBasis && (
              <>
                <button
                  onClick={handleUpdatePricingBasis}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingPricingBasis(false);
                    setFormData({ ...formData, pricing_basis: existingAppendix?.pricing_basis || '' });
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          {editingPricingBasis && (
            <div className="mt-2 bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 text-sm text-blue-300">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  Changing the Pricing Basis on a finalized appendix. This will update the pricing structure in the PDF.
                </div>
              </div>
            </div>
          )}

          {formData.pricing_basis === 'fixed_price_lump_sum' && allowances.some((a: any) => a.category === 'PS' || a.category === 'PC') && (
            <div className="mt-3 bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 text-sm text-amber-300">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium mb-1">Advisory: PS/PC Items Detected</div>
                  <div className="text-xs text-amber-400/80">
                    You have Provisional Sums (PS) or Prime Cost (PC) items under a Fixed Price – Lump Sum contract.
                    This may introduce commercial variability. Consider using "Hybrid – Lump Sum with SOR Variations"
                    or "Provisional Quantities – Rates Fixed" instead.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Explicit Inclusions
            <span className="text-xs text-slate-500 ml-2 font-normal">(Optional)</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">What is explicitly included in the subcontractor's scope</p>
          {!isFinalised && (
            <div className="space-y-2 mb-3">
              <input
                type="text"
                value={newInclusion}
                onChange={(e) => setNewInclusion(e.target.value)}
                placeholder="Add inclusion..."
                onKeyDown={(e) => e.key === 'Enter' && !newInclusionRef && addItem('inclusion', newInclusion, newInclusionRef)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInclusionRef}
                  onChange={(e) => setNewInclusionRef(e.target.value)}
                  placeholder="Optional ref (TAG-XXX, ARD-XXX)..."
                  onKeyDown={(e) => e.key === 'Enter' && addItem('inclusion', newInclusion, newInclusionRef)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-xs"
                />
                <button
                  onClick={() => addItem('inclusion', newInclusion, newInclusionRef)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-all text-sm"
                >
                  Add
                </button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {formData.inclusions.map((item, index) => {
              const itemText = typeof item === 'string' ? item : item.text;
              const itemRef = typeof item === 'object' ? item.reference : null;
              return (
                <div key={index} className="flex items-center justify-between bg-green-900/20 border border-green-700/50 rounded p-3">
                  <div className="flex-1">
                    <span className="text-sm text-white">{itemText}</span>
                    {itemRef && (
                      <span className="ml-2 text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">Ref: {itemRef}</span>
                    )}
                  </div>
                  {!isFinalised && (
                    <button
                      onClick={() => removeItem('inclusion', index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Explicit Exclusions
            <span className="text-xs text-slate-500 ml-2 font-normal">(Optional)</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">What is explicitly excluded from the subcontractor's scope</p>
          {!isFinalised && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                placeholder="Add exclusion..."
                onKeyDown={(e) => e.key === 'Enter' && addItem('exclusion', newExclusion)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              />
              <button
                onClick={() => addItem('exclusion', newExclusion)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-all text-sm"
              >
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {formData.exclusions.map((item, index) => (
              <div key={index} className="flex items-center justify-between bg-red-900/20 border border-red-700/50 rounded p-3">
                <span className="text-sm text-white">{item}</span>
                {!isFinalised && (
                  <button
                    onClick={() => removeItem('exclusion', index)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Commercial Assumptions
            <span className="text-xs text-slate-500 ml-2 font-normal">(Optional)</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">Assumptions impacting cost, access, staging, or hours</p>
          {!isFinalised && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newAssumption}
                onChange={(e) => setNewAssumption(e.target.value)}
                placeholder="Add assumption..."
                onKeyDown={(e) => e.key === 'Enter' && addItem('assumption', newAssumption)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              />
              <button
                onClick={() => addItem('assumption', newAssumption)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-all text-sm"
              >
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {formData.commercial_assumptions.map((item, index) => (
              <div key={index} className="flex items-center justify-between bg-slate-900/50 rounded p-3">
                <span className="text-sm text-white">{item}</span>
                {!isFinalised && (
                  <button
                    onClick={() => removeItem('assumption', index)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Subcontractor Clarifications
            <span className="text-xs text-slate-500 ml-2 font-normal">(Optional)</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">Clarifications intended to remain part of the contract</p>
          {!isFinalised && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newClarification}
                onChange={(e) => setNewClarification(e.target.value)}
                placeholder="Add clarification..."
                onKeyDown={(e) => e.key === 'Enter' && addItem('clarification', newClarification)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              />
              <button
                onClick={() => addItem('clarification', newClarification)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-all text-sm"
              >
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {formData.clarifications.map((item, index) => (
              <div key={index} className="flex items-center justify-between bg-slate-900/50 rounded p-3">
                <span className="text-sm text-white">{item}</span>
                {!isFinalised && (
                  <button
                    onClick={() => removeItem('clarification', index)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Known Risks & Hold Points
            <span className="text-xs text-slate-500 ml-2 font-normal">(Optional)</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">Known risks, exclusions, or hold points affecting scope or price</p>
          {!isFinalised && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newRisk}
                onChange={(e) => setNewRisk(e.target.value)}
                placeholder="Add risk or hold point..."
                onKeyDown={(e) => e.key === 'Enter' && addItem('risk', newRisk)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              />
              <button
                onClick={() => addItem('risk', newRisk)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-all text-sm"
              >
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {formData.known_risks.map((item, index) => (
              <div key={index} className="flex items-center justify-between bg-slate-900/50 rounded p-3">
                <span className="text-sm text-white">{item}</span>
                {!isFinalised && (
                  <button
                    onClick={() => removeItem('risk', index)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          {!isFinalised && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              {existingAppendix && (
                <button
                  onClick={handleFinalise}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-all disabled:opacity-50"
                >
                  Finalise Appendix
                </button>
              )}
            </>
          )}
          {isFinalised && (
            <>
              <button
                onClick={handleUnfinalise}
                disabled={saving || generating}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition-all disabled:opacity-50"
              >
                Unfinalise & Edit
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-all disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating PDF... This may take up to 3 minutes
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Appendix PDF
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 text-sm text-blue-300">
          <FileCheck size={16} className="inline mr-2" />
          This appendix will be attached to signed pre-letting minutes and read in conjunction with the main pre-letting minutes and subcontract agreement.
        </div>
      </div>
    </div>
  );
}

function generateLOIHtml(loi: LetterOfIntent, awardInfo: AwardInfo | null, logoUrl: string | null): string {
  const today = new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; position: relative; }
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 120px;
          color: rgba(255, 0, 0, 0.1);
          font-weight: bold;
          z-index: -1;
          pointer-events: none;
        }
        .header { text-align: center; margin-bottom: 40px; }
        .logo { max-width: 200px; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #1e40af; }
        .date { color: #666; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 5px; }
        .disclaimer { background: #fee; border: 2px solid #f00; padding: 20px; margin: 30px 0; border-radius: 8px; }
        .disclaimer-title { font-weight: bold; color: #c00; font-size: 16px; margin-bottom: 10px; }
        .service-list { list-style: none; padding: 0; }
        .service-item { background: #f0f9ff; padding: 10px; margin: 5px 0; border-left: 3px solid #1e40af; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #1e40af; color: white; }
      </style>
    </head>
    <body>
      <div class="watermark">DRAFT – LEGAL REVIEW REQUIRED</div>

      ${logoUrl ? `<div class="header"><img src="${logoUrl}" class="logo" alt="Company Logo" /></div>` : ''}

      <div class="header">
        <div class="title">LETTER OF INTENT</div>
        <div class="date">${today}</div>
      </div>

      <div class="disclaimer">
        <div class="disclaimer-title">⚠️ IMPORTANT LEGAL DISCLAIMER</div>
        <p><strong>This Letter of Intent is a NON-BINDING expression of intent only.</strong></p>
        <p>No contractual relationship is created, implied, or established by this document. This letter does not constitute an offer, acceptance, or agreement to enter into any contract. No legal obligations or liabilities are created by this document.</p>
        <p>This document is subject to legal review, formal contract negotiation, and execution of definitive agreements. All terms are indicative only and subject to change.</p>
        <p><strong>Do not commence any work based on this letter alone.</strong></p>
      </div>

      <div class="section">
        <div class="section-title">To: ${loi.supplier_name}</div>
        ${loi.supplier_address ? `<p>${loi.supplier_address}</p>` : ''}
        ${loi.supplier_contact ? `<p><strong>Attention:</strong> ${loi.supplier_contact}</p>` : ''}
        ${loi.supplier_email ? `<p><strong>Email:</strong> ${loi.supplier_email}</p>` : ''}
        ${loi.supplier_phone ? `<p><strong>Phone:</strong> ${loi.supplier_phone}</p>` : ''}
      </div>

      <div class="section">
        <div class="section-title">Scope of Works (Indicative)</div>
        <p>${loi.scope_summary}</p>

        ${loi.service_types.length > 0 ? `
          <p><strong>Service Types (Indicative):</strong></p>
          <ul class="service-list">
            ${loi.service_types.map(type => `<li class="service-item">${type}</li>`).join('')}
          </ul>
        ` : ''}
      </div>

      <div class="section">
        <div class="section-title">Indicative Timeline</div>
        <table>
          <tr>
            <th>Milestone</th>
            <th>Indicative Date</th>
          </tr>
          <tr>
            <td>Proposed Start Date</td>
            <td>${loi.target_start_date ? new Date(loi.target_start_date).toLocaleDateString() : 'To Be Confirmed'}</td>
          </tr>
          <tr>
            <td>Proposed Completion Date</td>
            <td>${loi.target_completion_date ? new Date(loi.target_completion_date).toLocaleDateString() : 'To Be Confirmed'}</td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #666;"><em>Note: All dates are indicative and subject to formal contract terms.</em></p>
      </div>

      <div class="section">
        <div class="section-title">Next Steps (Indicative)</div>
        <ul>
          <li>Provide current insurance certificates</li>
          <li>Submit health and safety documentation</li>
          <li>Provide method statements</li>
          <li>Confirm availability and resource allocation</li>
          <li>Attend pre-contract meeting</li>
          <li>Legal review and formal contract negotiation</li>
        </ul>
      </div>

      ${loi.custom_terms ? `
        <div class="section">
          <div class="section-title">Additional Terms (Indicative)</div>
          <p>${loi.custom_terms}</p>
        </div>
      ` : ''}

      <div class="disclaimer">
        <p><strong>RECONFIRMATION OF NON-BINDING NATURE:</strong></p>
        <p>This document creates absolutely no binding obligations, commitments, or liabilities whatsoever. No party should rely on this document for any purpose. Any work commenced prior to execution of formal contracts is done entirely at the subcontractor's own risk.</p>
        <p><strong>This document must be reviewed by legal counsel before distribution.</strong></p>
      </div>

      <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; text-align: center;">
        <p>Generated by VerifyTrade Contract Manager • ${today}</p>
        <p><strong>DRAFT DOCUMENT – NOT FOR DISTRIBUTION WITHOUT LEGAL REVIEW</strong></p>
      </div>
    </body>
    </html>
  `;
}

interface SiteHandoverTabProps {
  projectId: string;
  awardInfo: AwardInfo | null;
  projectInfo: ProjectInfo | null;
  scopeSystems: ScopeSystem[];
  generatingJunior: boolean;
  generatingSenior: boolean;
  generatingJuniorPdf: boolean;
  generatingSeniorPdf: boolean;
  onGenerateJunior: () => void;
  onGenerateSenior: () => void;
  onGenerateJuniorPdf: () => void;
  onGenerateSeniorPdf: () => void;
}

function SiteHandoverTab({
  awardInfo,
  projectInfo,
  scopeSystems,
  generatingJunior,
  generatingSenior,
  generatingJuniorPdf,
  generatingSeniorPdf,
  onGenerateJunior,
  onGenerateSenior,
  onGenerateJuniorPdf,
  onGenerateSeniorPdf
}: SiteHandoverTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
          <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full"></div>
          Site Handover
        </h3>
        <p className="text-slate-400 text-sm">Generate comprehensive handover documentation for site teams and senior management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Site Team Pack */}
        <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 rounded-xl border border-blue-700/50 p-6 hover:border-blue-600/70 transition-all">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-blue-600/20 rounded-lg border border-blue-600/30">
              <Users size={28} className="text-blue-400" />
            </div>
            <div>
              <h4 className="text-xl font-bold text-white mb-1">Site Team Pack</h4>
              <p className="text-slate-400 text-sm">On-site operational documentation for construction teams</p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <span>Scope of works breakdown by system</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <span>Line item details with quantities and specifications</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <span>Practical site-focused information</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <span>Subcontractor contact details</span>
            </div>
          </div>

          {awardInfo && (
            <div className="bg-slate-900/50 rounded-lg p-4 mb-6 border border-slate-700/50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-slate-400 text-xs mb-1">Subcontractor</div>
                  <div className="text-white font-medium">{awardInfo.supplier_name}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Project</div>
                  <div className="text-white font-medium">{projectInfo?.name || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Systems</div>
                  <div className="text-white font-medium">{scopeSystems.length} types</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Contract Value</div>
                  <div className="text-white font-medium">${awardInfo.total_amount.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={onGenerateJunior}
              disabled={generatingJunior || !awardInfo}
              className="hidden flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-sm"
            >
              <Download size={18} />
              {generatingJunior ? 'Generating...' : 'HTM Export'}
            </button>
            <button
              onClick={onGenerateJuniorPdf}
              disabled={generatingJuniorPdf || !awardInfo}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-sm relative overflow-hidden"
            >
              {generatingJuniorPdf ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span className="text-white font-medium">Processing</span>
                </div>
              ) : (
                <>
                  <FileText size={18} />
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>

        {/* Senior Management Pack */}
        <div className="bg-gradient-to-br from-orange-900/20 to-orange-800/10 rounded-xl border border-orange-700/50 p-6 hover:border-orange-600/70 transition-all">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-orange-600/20 rounded-lg border border-orange-600/30">
              <Briefcase size={28} className="text-orange-400" />
            </div>
            <div>
              <h4 className="text-xl font-bold text-white mb-1">Senior Management Pack</h4>
              <p className="text-slate-400 text-sm">Executive summary and commercial analysis</p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <span>Executive contract summary</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <span>Commercial analysis and benchmarking</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <span>Risk assessment and recommendations</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <span>Financial breakdown and forecasting</span>
            </div>
          </div>

          {awardInfo && (
            <div className="bg-slate-900/50 rounded-lg p-4 mb-6 border border-slate-700/50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-slate-400 text-xs mb-1">Supplier</div>
                  <div className="text-white font-medium">{awardInfo.supplier_name}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Client</div>
                  <div className="text-white font-medium">{projectInfo?.client || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Award Date</div>
                  <div className="text-white font-medium">
                    {awardInfo.awarded_date ? new Date(awardInfo.awarded_date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Total Value</div>
                  <div className="text-white font-medium">${awardInfo.total_amount.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={onGenerateSenior}
              disabled={generatingSenior || !awardInfo}
              className="hidden flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-sm"
            >
              <Download size={18} />
              {generatingSenior ? 'Generating...' : 'HTM Export'}
            </button>
            <button
              onClick={onGenerateSeniorPdf}
              disabled={generatingSeniorPdf || !awardInfo}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-sm relative overflow-hidden"
            >
              {generatingSeniorPdf ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span className="text-white font-medium">Processing</span>
                </div>
              ) : (
                <>
                  <FileText size={18} />
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-900/10 border border-blue-700/30 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <FileText className="text-blue-400" size={20} />
          </div>
          <div className="flex-1">
            <h5 className="text-white font-semibold mb-2">About Handover Packs</h5>
            <p className="text-slate-400 text-sm leading-relaxed mb-3">
              These comprehensive documents ensure smooth contract handover to site teams and management. Each pack is tailored to its audience:
            </p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span><strong className="text-slate-300">Site Team Pack:</strong> Focused on practical execution with detailed scope, specifications, and contact information for on-site coordination.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400">•</span>
                <span><strong className="text-slate-300">Senior Management Pack:</strong> High-level strategic overview with commercial analysis, risk assessment, and executive recommendations for decision-making.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
