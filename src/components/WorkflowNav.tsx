import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface WorkflowNavProps {
  currentStep: number | string;
  totalSteps?: number;
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  disabledNext?: boolean;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
}

export default function WorkflowNav({
  currentStep,
  totalSteps = 5,
  onBack,
  onNext,
  backLabel,
  nextLabel,
  disabledNext = false,
  onNavigateBack,
  onNavigateNext,
}: WorkflowNavProps) {
  // Use the new onNavigateBack/onNavigateNext if provided, otherwise fall back to onBack/onNext
  const handleBack = onNavigateBack || onBack;
  const handleNext = onNavigateNext || onNext;

  return (
    <div className="border-t border-slate-700/50 bg-slate-800/40 px-8 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex-1">
          {handleBack && (
            <button
              onClick={() => {
                // Trigger dashboard refresh when navigating back
                window.dispatchEvent(new Event('refresh-dashboard'));
                handleBack();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-all"
            >
              <ChevronLeft size={18} />
              {backLabel || 'Back'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          {typeof currentStep === 'number' ? (
            <>Step {currentStep + 1} of {totalSteps}</>
          ) : (
            <>Workflow: {currentStep}</>
          )}
        </div>

        <div className="flex-1 flex justify-end">
          {handleNext && (
            <button
              onClick={handleNext}
              disabled={disabledNext}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all ${
                disabledNext
                  ? 'bg-slate-700/50 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800'
              }`}
            >
              {nextLabel || 'Next step'}
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
