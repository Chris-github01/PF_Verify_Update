import { useState, useEffect } from 'react';
import { Upload, Scissors, Sparkles, Grid3x3 as Grid3X3, CheckCircle, Loader2, X, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import SCCQuoteImport from './SCCQuoteImport';
import ReviewClean from '../ReviewClean';
import QuoteIntelligence from '../QuoteIntelligence';
import ScopeMatrix from '../ScopeMatrix';

type WorkflowStep = 'import' | 'review_clean' | 'quote_intelligence' | 'scope_matrix';

const STEPS: { id: WorkflowStep; label: string; desc: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
  { id: 'import',             label: 'Quote Import',       desc: 'Parse & establish baseline',  icon: Upload },
  { id: 'review_clean',       label: 'Review & Clean',     desc: 'Tidy up line items',           icon: Scissors },
  { id: 'quote_intelligence', label: 'Quote Intelligence', desc: 'AI-powered analysis',          icon: Sparkles },
  { id: 'scope_matrix',       label: 'Scope Matrix',       desc: 'Compare & validate scope',     icon: Grid3X3 },
];

const STEP_INTROS: Record<WorkflowStep, { title: string; what: string; tasks: string[]; color: string; bg: string }> = {
  import: {
    title: 'Upload your subcontractor\'s quote',
    what: 'The AI reads your quote document and extracts every line item automatically. You then review the items, toggle any you want to exclude, and set it as your active baseline.',
    tasks: [
      'Upload a PDF, Excel (.xlsx), or CSV file',
      'Wait for the AI to finish parsing (usually under a minute)',
      'Check the items look right — toggle off anything you want to exclude',
      'Click "Set as Active Baseline" to lock in the scope',
    ],
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  review_clean: {
    title: 'Tidy up the extracted line items',
    what: 'This step normalises the data — fixing unit spellings, grouping items into standard categories, and flagging anything that looks unusual. Click "Smart Clean" to run it automatically.',
    tasks: [
      'Click "Smart Clean" to automatically fix units and categorise items',
      'Review any items flagged in red — they may need your attention',
      'Edit individual line descriptions if anything is unclear',
      'Click "Next" when you\'re happy with the result',
    ],
    color: 'text-blue-300',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  quote_intelligence: {
    title: 'Get an AI analysis of the quote',
    what: 'The AI summarises the quote for you — highlighting risks, identifying unusual pricing, and flagging items that might cause problems down the track. Useful to share with your PM.',
    tasks: [
      'Review the AI\'s summary of the quote',
      'Check the risk flags — red items need your attention',
      'Note any items marked as unusual or high-value',
      'Click "Next" to continue, or "Back" to revisit previous steps',
    ],
    color: 'text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  scope_matrix: {
    title: 'Check how the scope maps to standard categories',
    what: 'This view shows how every line item in the quote maps to standard construction work categories. It\'s a way to confirm you\'ve been awarded the full scope and nothing important is missing.',
    tasks: [
      'Select the quotes you want to compare',
      'Click "Generate Scope Matrix" to build the comparison',
      'Look for any gaps — grey cells mean that category isn\'t covered',
      'Export to Excel if you want to share the comparison with your team',
    ],
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
};

const STEP_ORDER: WorkflowStep[] = ['import', 'review_clean', 'quote_intelligence', 'scope_matrix'];

function deriveWorkflowState(importStatus: string | null): { completed: Set<WorkflowStep>; step: WorkflowStep } {
  if (!importStatus) return { completed: new Set(), step: 'import' };
  if (importStatus === 'reviewed' || importStatus === 'locked') {
    return { completed: new Set(['import'] as WorkflowStep[]), step: 'review_clean' };
  }
  if (importStatus === 'parsed') {
    return { completed: new Set(['import'] as WorkflowStep[]), step: 'review_clean' };
  }
  return { completed: new Set(), step: 'import' };
}

export default function SCCQuoteWorkflow() {
  const { currentOrganisation } = useOrganisation();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('import');
  const [sentinelProjectId, setSentinelProjectId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());
  const [dismissedIntros, setDismissedIntros] = useState<Set<WorkflowStep>>(new Set());

  useEffect(() => {
    if (currentOrganisation?.id) {
      initialiseWorkflow();
    }
  }, [currentOrganisation?.id]);

  const initialiseWorkflow = async () => {
    if (!currentOrganisation?.id) return;
    setLoadingProject(true);
    try {
      const [projectRes, importRes] = await Promise.all([
        supabase.rpc('get_or_create_scc_sentinel_project', { org_id: currentOrganisation.id }),
        supabase
          .from('scc_quote_imports')
          .select('status, scc_workflow_step')
          .eq('organisation_id', currentOrganisation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (projectRes.data) setSentinelProjectId(projectRes.data);

      const latestImport = importRes.data;
      const savedStep = latestImport?.scc_workflow_step as WorkflowStep | null;

      if (savedStep && STEP_ORDER.includes(savedStep)) {
        const idx = STEP_ORDER.indexOf(savedStep);
        const completed = new Set(STEP_ORDER.slice(0, idx)) as Set<WorkflowStep>;
        setCompletedSteps(completed);
        setCurrentStep(savedStep);
      } else {
        const { completed, step } = deriveWorkflowState(latestImport?.status ?? null);
        setCompletedSteps(completed);
        setCurrentStep(step);
      }
    } catch (err) {
      console.error('Failed to initialise SCC workflow:', err);
    } finally {
      setLoadingProject(false);
    }
  };

  const persistStep = async (step: WorkflowStep) => {
    if (!currentOrganisation?.id) return;
    try {
      await supabase
        .from('scc_quote_imports')
        .update({ scc_workflow_step: step, updated_at: new Date().toISOString() })
        .eq('organisation_id', currentOrganisation.id)
        .order('created_at', { ascending: false })
        .limit(1);
    } catch {
    }
  };

  const markComplete = (step: WorkflowStep) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  };

  const dismissIntro = (step: WorkflowStep) => {
    setDismissedIntros(prev => new Set([...prev, step]));
  };

  const goToStep = (step: WorkflowStep) => {
    const stepIdx = STEP_ORDER.indexOf(step);
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    if (stepIdx <= currentIdx || completedSteps.has(step) || stepIdx === currentIdx + 1) {
      setCurrentStep(step);
      persistStep(step);
    }
  };

  const handleProceedToWorkflow = (pid: string) => {
    setSentinelProjectId(pid);
    markComplete('import');
    setCurrentStep('review_clean');
    persistStep('review_clean');
  };

  const handleNext = (from: WorkflowStep) => {
    markComplete(from);
    const idx = STEP_ORDER.indexOf(from);
    if (idx < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[idx + 1];
      setCurrentStep(next);
      persistStep(next);
    }
  };

  const handleBack = (from: WorkflowStep) => {
    const idx = STEP_ORDER.indexOf(from);
    if (idx > 0) {
      const prev = STEP_ORDER[idx - 1];
      setCurrentStep(prev);
      persistStep(prev);
    }
  };

  const currentStepIdx = STEP_ORDER.indexOf(currentStep);
  const intro = STEP_INTROS[currentStep];
  const showIntro = !dismissedIntros.has(currentStep);

  return (
    <div className="flex flex-col h-full">
      {/* Workflow Stepper Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-800/60 bg-slate-900/30 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((step, i) => {
            const isActive = step.id === currentStep;
            const isCompleted = completedSteps.has(step.id);
            const stepIdx = STEP_ORDER.indexOf(step.id);
            const isClickable = isCompleted || stepIdx <= currentStepIdx;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => isClickable && goToStep(step.id)}
                  disabled={!isClickable}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
                    isActive
                      ? 'bg-cyan-900/60 border border-cyan-700/60 cursor-default'
                      : isClickable
                      ? 'hover:bg-slate-800/60 cursor-pointer border border-transparent'
                      : 'opacity-35 cursor-default border border-transparent'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    isCompleted ? 'bg-green-700 text-white' :
                    isActive ? 'bg-cyan-500 text-white' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {isCompleted ? <CheckCircle size={13} /> : <Icon size={12} />}
                  </div>
                  <div className="text-left">
                    <p className={`text-xs font-semibold whitespace-nowrap ${
                      isActive ? 'text-cyan-200' : isCompleted ? 'text-green-400' : 'text-slate-400'
                    }`}>{step.label}</p>
                    <p className="text-xs text-slate-600 whitespace-nowrap hidden sm:block">{step.desc}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px flex-shrink-0 ${i < currentStepIdx ? 'bg-cyan-700' : 'bg-slate-700'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        {loadingProject && currentStep !== 'import' ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={24} className="animate-spin text-cyan-400" />
          </div>
        ) : (
          <>
            {/* Step intro card — shown until dismissed */}
            {showIntro && (
              <div className={`mx-6 mt-5 rounded-2xl border ${intro.bg} p-5 flex gap-4`}>
                <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center flex-shrink-0">
                  <Info size={16} className={intro.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${intro.color} mb-1`}>{intro.title}</p>
                  <p className="text-slate-300 text-xs leading-relaxed mb-3">{intro.what}</p>
                  <ol className="space-y-1">
                    {intro.tasks.map((task, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                        <span className={`font-bold flex-shrink-0 ${intro.color}`}>{i + 1}.</span>
                        {task}
                      </li>
                    ))}
                  </ol>
                </div>
                <button
                  onClick={() => dismissIntro(currentStep)}
                  className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 self-start"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {currentStep === 'import' && (
              <div className="p-6">
                <SCCQuoteImport
                  onProceedToWorkflow={handleProceedToWorkflow}
                />
              </div>
            )}

            {currentStep === 'review_clean' && sentinelProjectId && (
              <ReviewClean
                projectId={sentinelProjectId}
                dashboardMode="original"
                onNavigateBack={() => handleBack('review_clean')}
                onNavigateNext={() => handleNext('review_clean')}
              />
            )}

            {currentStep === 'quote_intelligence' && sentinelProjectId && (
              <QuoteIntelligence
                projectId={sentinelProjectId}
                dashboardMode="original"
                onNavigateBack={() => handleBack('quote_intelligence')}
                onNavigateNext={() => handleNext('quote_intelligence')}
              />
            )}

            {currentStep === 'scope_matrix' && sentinelProjectId && (
              <ScopeMatrix
                projectId={sentinelProjectId}
                dashboardMode="original"
                onNavigateBack={() => handleBack('scope_matrix')}
                onNavigateNext={() => {
                  markComplete('scope_matrix');
                  setCurrentStep('import');
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
