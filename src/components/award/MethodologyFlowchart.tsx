import { FileUp, Database, SearchCheck, Shield, Award, ChevronRight } from 'lucide-react';

interface MethodologyFlowchartProps {
  compact?: boolean;
}

export default function MethodologyFlowchart({ compact = false }: MethodologyFlowchartProps) {
  const steps = [
    {
      number: 1,
      title: 'Quote Import & Validation',
      icon: FileUp,
      color: 'blue',
      description: 'PDF/Excel parsing with ML extraction, automated validation, and quality checks',
    },
    {
      number: 2,
      title: 'Data Normalization',
      icon: Database,
      color: 'green',
      description: 'Unit standardization, price normalization, and system categorization',
    },
    {
      number: 3,
      title: 'Scope Gap Analysis',
      icon: SearchCheck,
      color: 'purple',
      description: 'Cross-supplier comparison, missing item detection, and coverage calculation',
    },
    {
      number: 4,
      title: 'Risk Assessment',
      icon: Shield,
      color: 'orange',
      description: 'Compliance checks, delivery risk scoring, and red flag identification',
    },
    {
      number: 5,
      title: 'Multi-Criteria Scoring',
      icon: Award,
      color: 'red',
      description: 'Weighted evaluation across price, compliance, coverage, and risk factors',
    },
  ];

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
      blue: {
        bg: 'bg-blue-600',
        text: 'text-blue-400',
        border: 'border-blue-600',
        gradient: 'from-blue-600 to-blue-700',
      },
      green: {
        bg: 'bg-green-600',
        text: 'text-green-400',
        border: 'border-green-600',
        gradient: 'from-green-600 to-green-700',
      },
      purple: {
        bg: 'bg-purple-600',
        text: 'text-purple-400',
        border: 'border-purple-600',
        gradient: 'from-purple-600 to-purple-700',
      },
      orange: {
        bg: 'bg-orange-600',
        text: 'text-orange-400',
        border: 'border-orange-600',
        gradient: 'from-orange-600 to-orange-700',
      },
      red: {
        bg: 'bg-red-600',
        text: 'text-red-400',
        border: 'border-red-600',
        gradient: 'from-red-600 to-red-700',
      },
    };
    return colorMap[color] || colorMap.blue;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {steps.map((step, idx) => {
          const colors = getColorClasses(step.color);
          const Icon = step.icon;

          return (
            <div key={idx} className="flex items-center gap-3">
              <div
                className="group relative"
                title={step.description}
              >
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg transition-all hover:scale-110 cursor-pointer`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <div className={`absolute -top-2 -right-2 w-7 h-7 ${colors.bg} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md`}>
                  {step.number}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <ChevronRight className="w-5 h-5 text-slate-600" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-700">
        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg flex items-center justify-center">
            <Award className="w-6 h-6 text-white" />
          </div>
          Report Methodology
        </h3>
        <p className="text-slate-400 mt-2 text-sm">
          Five-stage evaluation process for objective, data-driven supplier selection
        </p>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {steps.map((step, idx) => {
            const colors = getColorClasses(step.color);
            const Icon = step.icon;

            return (
              <div key={idx} className="relative">
                <div
                  className={`group border-2 ${colors.border} bg-slate-800/40 rounded-2xl p-6 text-center transition-all hover:scale-105 hover:shadow-xl cursor-pointer h-full flex flex-col items-center justify-center`}
                >
                  {/* Step Number */}
                  <div className={`w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white font-bold text-2xl shadow-lg`}>
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-md`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Title */}
                  <h4 className="font-bold text-white text-base mb-3 leading-tight min-h-[3rem] flex items-center">
                    {step.title}
                  </h4>

                  {/* Description */}
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {step.description}
                  </p>

                  {/* Hover Effect */}
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${colors.gradient} opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none`}></div>
                </div>

                {/* Arrow between steps */}
                {idx < steps.length - 1 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 transform -translate-y-1/2 z-10">
                    <ChevronRight className="w-6 h-6 text-slate-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Additional Info */}
        <div className="mt-8 p-6 bg-gradient-to-r from-orange-900/20 to-transparent rounded-xl border-l-4 border-orange-600">
          <h4 className="font-bold text-white mb-3">What This Means for You</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5">•</span>
              <span><strong className="text-white">Trusted Data:</strong> All prices, quantities, and descriptions are validated for accuracy</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5">•</span>
              <span><strong className="text-white">Fair Comparison:</strong> Apples-to-apples analysis across all suppliers with normalized units</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5">•</span>
              <span><strong className="text-white">Risk Mitigation:</strong> Potential issues identified early with actionable recommendations</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5">•</span>
              <span><strong className="text-white">Objective Decision:</strong> Weighted multi-criteria analysis removes subjective bias</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
