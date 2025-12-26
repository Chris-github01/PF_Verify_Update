import { CheckCircle2, Circle, Lock } from 'lucide-react';

export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  stepNumber: number;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  currentStep: string;
  completedSteps: string[];
  onStepClick?: (stepId: string) => void;
  lockedSteps?: string[];
}

export default function ContractWorkflowStepper({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  lockedSteps = []
}: WorkflowStepperProps) {
  const getStepStatus = (stepId: string) => {
    if (completedSteps.includes(stepId)) return 'completed';
    if (stepId === currentStep) return 'current';
    if (lockedSteps.includes(stepId)) return 'locked';
    return 'pending';
  };

  const getStepStyles = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          container: 'bg-green-500/10 border-green-500/50',
          number: 'bg-green-500 text-white',
          text: 'text-green-400',
          connector: 'bg-green-500'
        };
      case 'current':
        return {
          container: 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/20',
          number: 'bg-orange-500 text-white',
          text: 'text-orange-400',
          connector: 'bg-slate-700'
        };
      case 'locked':
        return {
          container: 'bg-slate-800/30 border-slate-700/30',
          number: 'bg-slate-700 text-slate-500',
          text: 'text-slate-600',
          connector: 'bg-slate-800'
        };
      default:
        return {
          container: 'bg-slate-800/50 border-slate-700/50',
          number: 'bg-slate-700 text-slate-400',
          text: 'text-slate-400',
          connector: 'bg-slate-700'
        };
    }
  };

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Contract Workflow Progress</h3>
        <div className="text-sm text-slate-400">
          {completedSteps.length} of {steps.length} completed
        </div>
      </div>

      <div className="relative">
        <div className="grid grid-cols-6 gap-2">
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);
            const styles = getStepStyles(status);
            const isClickable = status !== 'locked' && onStepClick;
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="relative flex flex-col items-center group">
                <button
                  onClick={() => isClickable && onStepClick(step.id)}
                  disabled={status === 'locked'}
                  className={`
                    relative flex flex-col items-center w-full
                    ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                    transition-all duration-200
                  `}
                >
                  <div className="relative w-full mb-3">
                    <div
                      className={`
                        relative z-10 flex items-center justify-center w-10 h-10 rounded-full mx-auto
                        border-2 transition-all duration-200
                        ${styles.number}
                        ${isClickable ? 'group-hover:scale-110 group-hover:shadow-lg' : ''}
                      `}
                    >
                      {status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : status === 'locked' ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-bold">{step.stepNumber}</span>
                      )}
                    </div>

                    {!isLast && (
                      <div className="absolute left-[calc(50%+20px)] right-[-50%] top-5 h-0.5 z-0">
                        <div className="absolute inset-0 bg-slate-800 rounded-full"></div>
                        <div
                          className={`
                            absolute inset-0 rounded-full transition-all duration-500
                            ${completedSteps.includes(step.id) ? 'bg-green-500 w-full' : 'bg-slate-700 w-0'}
                          `}
                        ></div>
                      </div>
                    )}
                  </div>

                  <div
                    className={`
                      px-3 py-2 rounded-lg border text-center w-full
                      transition-all duration-200
                      ${styles.container}
                      ${isClickable ? 'group-hover:border-orange-500/70' : ''}
                    `}
                  >
                    <div className={`text-xs font-semibold ${styles.text} truncate`}>
                      {step.label}
                    </div>
                    {status === 'current' && (
                      <div className="text-[10px] text-orange-300 mt-1">
                        Active
                      </div>
                    )}
                  </div>

                  {status === 'current' && (
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-700/50">
        <div className="text-sm text-slate-300">
          {steps.find(s => s.id === currentStep)?.description}
        </div>
      </div>
    </div>
  );
}
