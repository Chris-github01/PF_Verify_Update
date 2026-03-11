import { useState, useEffect } from 'react';
import { Upload, Scissors, Sparkles, Grid3X3, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import SCCQuoteImport from './SCCQuoteImport';
import ReviewClean from '../ReviewClean';
import QuoteIntelligence from '../QuoteIntelligence';
import ScopeMatrix from '../ScopeMatrix';

type WorkflowStep = 'import' | 'review_clean' | 'quote_intelligence' | 'scope_matrix';

const STEPS: { id: WorkflowStep; label: string; desc: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
  { id: 'import',            label: 'Quote Import',       desc: 'Parse & establish baseline',  icon: Upload },
  { id: 'review_clean',      label: 'Review & Clean',     desc: 'Normalise & map items',        icon: Scissors },
  { id: 'quote_intelligence',label: 'Quote Intelligence', desc: 'AI-powered analysis',          icon: Sparkles },
  { id: 'scope_matrix',      label: 'Scope Matrix',       desc: 'Compare & validate scope',     icon: Grid3X3 },
];

const STEP_ORDER: WorkflowStep[] = ['import', 'review_clean', 'quote_intelligence', 'scope_matrix'];

export default function SCCQuoteWorkflow() {
  const { currentOrganisation } = useOrganisation();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('import');
  const [sentinelProjectId, setSentinelProjectId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());

  useEffect(() => {
    if (currentOrganisation?.id) {
      ensureSentinelProject();
    }
  }, [currentOrganisation?.id]);

  const ensureSentinelProject = async () => {
    if (!currentOrganisation?.id) return;
    setLoadingProject(true);
    try {
      const { data } = await supabase.rpc('get_or_create_scc_sentinel_project', {
        org_id: currentOrganisation.id,
      });
      if (data) setSentinelProjectId(data);
    } catch (err) {
      console.error('Failed to get SCC sentinel project:', err);
    } finally {
      setLoadingProject(false);
    }
  };

  const markComplete = (step: WorkflowStep) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  };

  const goToStep = (step: WorkflowStep) => {
    const stepIdx = STEP_ORDER.indexOf(step);
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    if (stepIdx <= currentIdx || completedSteps.has(step) || stepIdx === currentIdx + 1) {
      setCurrentStep(step);
    }
  };

  const handleProceedToWorkflow = (pid: string) => {
    setSentinelProjectId(pid);
    markComplete('import');
    setCurrentStep('review_clean');
  };

  const handleNext = (from: WorkflowStep) => {
    markComplete(from);
    const idx = STEP_ORDER.indexOf(from);
    if (idx < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[idx + 1]);
    }
  };

  const handleBack = (from: WorkflowStep) => {
    const idx = STEP_ORDER.indexOf(from);
    if (idx > 0) {
      setCurrentStep(STEP_ORDER[idx - 1]);
    }
  };

  const currentStepIdx = STEP_ORDER.indexOf(currentStep);

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
