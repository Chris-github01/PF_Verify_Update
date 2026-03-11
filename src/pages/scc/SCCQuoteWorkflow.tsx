import { useState, useEffect } from 'react';
import { Upload, Scissors, Sparkles, CheckCircle, Loader2, X, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import SCCQuoteImport from './SCCQuoteImport';
import SCCReviewClean from './SCCReviewClean';
import QuoteIntelligence from '../QuoteIntelligence';

type WorkflowStep = 'import' | 'review_clean' | 'quote_intelligence';

const STEPS: { id: WorkflowStep; label: string; desc: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
  { id: 'import',             label: 'Quote Import',       desc: 'Parse & establish baseline', icon: Upload },
  { id: 'review_clean',       label: 'Review & Clean',     desc: 'Tidy up line items',          icon: Scissors },
  { id: 'quote_intelligence', label: 'Quote Intelligence', desc: 'AI-powered analysis',         icon: Sparkles },
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
      'Click "Finish" to complete the workflow and move to the Base Tracker',
    ],
    color: 'text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
};

const STEP_ORDER: WorkflowStep[] = ['import', 'review_clean', 'quote_intelligence'];

function deriveWorkflowState(
  importStatus: string | null,
  savedStep: WorkflowStep | null,
  savedCompletedSteps: WorkflowStep[],
): { completed: Set<WorkflowStep>; step: WorkflowStep } {
  if (savedCompletedSteps.length > 0) {
    const completed = new Set(savedCompletedSteps) as Set<WorkflowStep>;
    const step = savedStep && STEP_ORDER.includes(savedStep) ? savedStep : 'import';
    return { completed, step };
  }

  if (savedStep && STEP_ORDER.includes(savedStep)) {
    const idx = STEP_ORDER.indexOf(savedStep);
    const completed = new Set(STEP_ORDER.slice(0, idx)) as Set<WorkflowStep>;
    return { completed, step: savedStep };
  }

  if (!importStatus) return { completed: new Set(), step: 'import' };
  if (importStatus === 'reviewed' || importStatus === 'locked' || importStatus === 'parsed') {
    return { completed: new Set(['import'] as WorkflowStep[]), step: 'review_clean' };
  }
  return { completed: new Set(), step: 'import' };
}

export default function SCCQuoteWorkflow({ onFinish }: { onFinish?: () => void } = {}) {
  const { currentOrganisation } = useOrganisation();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('import');
  const [sentinelProjectId, setSentinelProjectId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());
  const [dismissedIntros, setDismissedIntros] = useState<Set<WorkflowStep>>(new Set());
  const [finished, setFinished] = useState(false);
  const [latestImportId, setLatestImportId] = useState<string | null>(null);

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
          .select('id, status, scc_workflow_step, completed_steps, parsing_job_id')
          .eq('organisation_id', currentOrganisation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const pid: string | null = projectRes.data ?? null;
      if (pid) setSentinelProjectId(pid);

      const latestImport = importRes.data;
      if (latestImport?.id) setLatestImportId(latestImport.id);

      if (pid && latestImport?.parsing_job_id) {
        const { data: job } = await supabase
          .from('parsing_jobs')
          .select('quote_id')
          .eq('id', latestImport.parsing_job_id)
          .maybeSingle();
        if (job?.quote_id) {
          const { data: quote } = await supabase
            .from('quotes')
            .select('is_selected')
            .eq('id', job.quote_id)
            .maybeSingle();
          if (quote && !quote.is_selected) {
            await supabase
              .from('quotes')
              .update({ is_selected: true, updated_at: new Date().toISOString() })
              .eq('id', job.quote_id);
          }
        }
      }

      const savedStep = latestImport?.scc_workflow_step as WorkflowStep | null;
      const savedCompletedSteps: WorkflowStep[] = Array.isArray(latestImport?.completed_steps)
        ? (latestImport.completed_steps as WorkflowStep[]).filter(s => STEP_ORDER.includes(s))
        : [];

      const { completed, step } = deriveWorkflowState(
        latestImport?.status ?? null,
        savedStep,
        savedCompletedSteps,
      );

      setCompletedSteps(completed);
      setCurrentStep(step);
    } catch (err) {
      console.error('Failed to initialise SCC workflow:', err);
    } finally {
      setLoadingProject(false);
    }
  };

  const persistProgress = async (
    step: WorkflowStep,
    completed: Set<WorkflowStep>,
    importIdOverride?: string,
  ) => {
    if (!currentOrganisation?.id) return;
    const targetId = importIdOverride ?? latestImportId;
    if (!targetId) {
      console.warn('persistProgress: no latestImportId — skipping write');
      return;
    }
    try {
      const completedArr = Array.from(completed);
      const { error } = await supabase
        .from('scc_quote_imports')
        .update({
          scc_workflow_step: step,
          completed_steps: completedArr,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);
      if (error) {
        console.error('persistProgress failed:', error.message);
      }
    } catch (err) {
      console.error('persistProgress exception:', err);
    }
  };

  const markComplete = (step: WorkflowStep): Set<WorkflowStep> => {
    const next = new Set([...completedSteps, step]);
    setCompletedSteps(next);
    return next;
  };

  const dismissIntro = (step: WorkflowStep) => {
    setDismissedIntros(prev => new Set([...prev, step]));
  };

  const goToStep = (step: WorkflowStep) => {
    const stepIdx = STEP_ORDER.indexOf(step);
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    if (stepIdx <= currentIdx || completedSteps.has(step) || stepIdx === currentIdx + 1) {
      setCurrentStep(step);
      persistProgress(step, completedSteps);
    }
  };

  const handleProceedToWorkflow = (pid: string, importId?: string) => {
    setSentinelProjectId(pid);
    if (importId) setLatestImportId(importId);
    const completed = markComplete('import');
    setCurrentStep('review_clean');
    persistProgress('review_clean', completed, importId ?? latestImportId ?? undefined);
  };

  const handleNext = (from: WorkflowStep) => {
    const completed = markComplete(from);
    const idx = STEP_ORDER.indexOf(from);
    if (idx < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[idx + 1];
      setCurrentStep(next);
      persistProgress(next, completed);
    } else {
      persistProgress(from, completed);
      setFinished(true);
      setTimeout(() => {
        onFinish?.();
      }, 1800);
    }
  };

  const handleBack = (from: WorkflowStep) => {
    const idx = STEP_ORDER.indexOf(from);
    if (idx > 0) {
      const prev = STEP_ORDER[idx - 1];
      setCurrentStep(prev);
      persistProgress(prev, completedSteps);
    }
  };

  const currentStepIdx = STEP_ORDER.indexOf(currentStep);
  const intro = STEP_INTROS[currentStep];
  const showIntro = !dismissedIntros.has(currentStep);

  if (finished) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 px-6 text-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-2xl flex items-center justify-center mb-6">
          <CheckCircle size={40} className="text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Workflow Complete</h2>
        <p className="text-gray-400 text-sm max-w-sm mb-8">
          Your quote has been imported, cleaned, and analysed. Opening the Base Tracker…
        </p>
        <div className="w-8 h-8">
          <Loader2 size={28} className="text-cyan-400 animate-spin" />
        </div>
      </div>
    );
  }

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
                  <div className={`w-6 h-px flex-shrink-0 ${
                    completedSteps.has(STEP_ORDER[i]) ? 'bg-green-700' :
                    i < currentStepIdx ? 'bg-cyan-700' : 'bg-slate-700'
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress summary strip */}
        {completedSteps.size > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/60">
            <span className="text-xs text-slate-500">Progress:</span>
            {STEP_ORDER.map(s => (
              <span key={s} className={`text-xs px-2 py-0.5 rounded-full ${
                completedSteps.has(s)
                  ? 'bg-green-500/15 text-green-400'
                  : s === currentStep
                  ? 'bg-cyan-500/15 text-cyan-400'
                  : 'bg-slate-700/50 text-slate-500'
              }`}>
                {completedSteps.has(s) ? '✓ ' : ''}{STEPS.find(st => st.id === s)?.label}
              </span>
            ))}
          </div>
        )}
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

            {/* Resuming banner — shown when returning to a step that was previously completed */}
            {completedSteps.has(currentStep) && (
              <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2.5">
                <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-300">
                  This step was already completed. You can review it or navigate forward using the stepper above.
                </p>
              </div>
            )}

            {currentStep === 'import' && (
              <div className="p-6">
                <SCCQuoteImport
                  onProceedToWorkflow={handleProceedToWorkflow}
                />
              </div>
            )}

            {currentStep === 'review_clean' && (
              <SCCReviewClean
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
                workflowStep={2}
                workflowTotal={3}
                backLabel="Back: Review & Clean"
                nextLabel="Finish"
                hideRecommendedActions
              />
            )}

          </>
        )}
      </div>
    </div>
  );
}
