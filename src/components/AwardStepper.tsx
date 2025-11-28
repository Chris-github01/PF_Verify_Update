import { CheckCircle, Circle } from 'lucide-react';

export type AwardStepId =
  | 'equalisation'
  | 'award-report'
  | 'trade-analysis'
  | 'rfi-pack'
  | 'unsuccessful-letters';

interface AwardStepperProps {
  activeStep: AwardStepId;
  onStepChange: (step: AwardStepId) => void;
  completed: {
    equalisation: boolean;
    awardReportReviewed: boolean;
    preferredApproved: boolean;
    rfiGenerated: boolean;
    unsuccessfulGenerated: boolean;
  };
}

interface Step {
  id: AwardStepId;
  label: string;
  completedKey: keyof AwardStepperProps['completed'];
}

const steps: Step[] = [
  { id: 'equalisation', label: 'Equalisation', completedKey: 'equalisation' },
  { id: 'award-report', label: 'Award Report', completedKey: 'awardReportReviewed' },
  { id: 'trade-analysis', label: 'Trade Analysis', completedKey: 'preferredApproved' },
  { id: 'rfi-pack', label: 'RFI Pack', completedKey: 'rfiGenerated' },
  { id: 'unsuccessful-letters', label: 'Unsuccessful Letters', completedKey: 'unsuccessfulGenerated' },
];

export default function AwardStepper({ activeStep, onStepChange, completed }: AwardStepperProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-8 py-6">
      <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {steps.map((step, index) => {
          const isActive = activeStep === step.id;
          const isCompleted = completed[step.completedKey];
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => onStepChange(step.id)}
                className={`flex flex-col items-center gap-2 transition-all ${
                  isActive ? 'scale-105' : 'hover:scale-105'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isActive
                      ? 'bg-blue-600 border-blue-600'
                      : isCompleted
                      ? 'bg-green-50 border-green-600'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle
                      className={`w-5 h-5 ${
                        isActive ? 'text-white' : 'text-gray-400'
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`text-xs font-medium text-center max-w-[120px] ${
                    isActive
                      ? 'text-blue-700'
                      : isCompleted
                      ? 'text-gray-900'
                      : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {!isLast && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    isCompleted ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
