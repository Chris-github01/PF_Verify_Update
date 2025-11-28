import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface WorkflowNavProps {
  currentStep: number;
  totalSteps?: number;
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  disabledNext?: boolean;
}

export default function WorkflowNav({
  currentStep,
  totalSteps = 5,
  onBack,
  onNext,
  backLabel,
  nextLabel,
  disabledNext = false,
}: WorkflowNavProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-8 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={16} />
              {backLabel || 'Back'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          Step {currentStep + 1} of {totalSteps}
        </div>

        <div className="flex-1 flex justify-end">
          {onNext && (
            <button
              onClick={onNext}
              disabled={disabledNext}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                disabledNext
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {nextLabel || 'Next step'}
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
