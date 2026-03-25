import { useState } from 'react';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { TRADE_MODULES } from '../../lib/modules/tradeRegistry';

const ONBOARDING_STEPS = [
  { id: 'register',    label: 'Register module',        description: 'Add module to trade registry with module_key, name, and category.' },
  { id: 'adapter',     label: 'Define adapter',         description: 'Implement ParserModuleAdapter interface for your trade parser.' },
  { id: 'rules',       label: 'Configure rule system',  description: 'Define moduleConfig with thresholds, learning params, and feature flags.' },
  { id: 'regression',  label: 'Attach regression suite', description: 'Create minimum 5 regression test cases covering common quote formats.' },
  { id: 'shadow',      label: 'Enable shadow mode',     description: 'Enable shadow capability flag and run first shadow comparison.' },
  { id: 'predictive',  label: 'Enable predictive',      description: 'Enable predictive capability once shadow data reaches minimum threshold.' },
  { id: 'review',      label: 'Enable review workflow', description: 'Enable review capability and assign trade reviewer roles.' },
  { id: 'optimization',label: 'Enable optimization',    description: 'Enable optimization capability once learning data accumulates.' },
];

interface ModuleOnboardingWizardProps {
  targetModuleKey?: string;
}

export default function ModuleOnboardingWizard({ targetModuleKey }: ModuleOnboardingWizardProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [selectedModule, setSelectedModule] = useState(targetModuleKey ?? '');

  const experimentalModules = Object.values(TRADE_MODULES).filter((m) => m.status === 'experimental' || m.status === 'beta');
  const module = TRADE_MODULES[selectedModule];

  const prefilledSteps = new Set<string>();
  if (module) {
    if (module.parser_available) { prefilledSteps.add('register'); prefilledSteps.add('adapter'); }
    if (module.capabilities.shadow) prefilledSteps.add('shadow');
    if (module.capabilities.predictive) prefilledSteps.add('predictive');
    if (module.capabilities.review) prefilledSteps.add('review');
    if (module.capabilities.optimization) prefilledSteps.add('optimization');
    if (module.regression_suite_count > 0) prefilledSteps.add('regression');
  }
  const allCompleted = new Set([...prefilledSteps, ...completedSteps]);
  const pct = Math.round((allCompleted.size / ONBOARDING_STEPS.length) * 100);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Module Onboarding Wizard</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">Step-by-step expansion checklist for adding a new trade module to the intelligence platform</p>
      </div>

      <div className="p-5 space-y-4">
        {!targetModuleKey && (
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Select module to onboard</label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-600"
            >
              <option value="">Choose module...</option>
              {experimentalModules.map((m) => (
                <option key={m.module_key} value={m.module_key}>{m.module_name} ({m.status})</option>
              ))}
            </select>
          </div>
        )}

        {selectedModule && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">Onboarding progress</span>
              <span className="text-xs font-bold text-white">{pct}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>

            <div className="space-y-2 mt-2">
              {ONBOARDING_STEPS.map((step, i) => {
                const done = allCompleted.has(step.id);
                const isLocked = i > 0 && !allCompleted.has(ONBOARDING_STEPS[i - 1].id);

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                      done ? 'bg-teal-900/10 border-teal-800/30' : isLocked ? 'opacity-40 border-gray-800 bg-gray-950' : 'border-gray-800 bg-gray-950'
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (isLocked || prefilledSteps.has(step.id)) return;
                        setCompletedSteps((prev) => {
                          const next = new Set(prev);
                          if (next.has(step.id)) next.delete(step.id);
                          else next.add(step.id);
                          return next;
                        });
                      }}
                      disabled={isLocked}
                      className="shrink-0 mt-0.5"
                    >
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-teal-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-700" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${done ? 'text-white' : 'text-gray-400'}`}>{step.label}</span>
                        {prefilledSteps.has(step.id) && <span className="text-[9px] text-teal-500">auto-detected</span>}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5 leading-relaxed">{step.description}</p>
                    </div>
                    {!done && !isLocked && <ChevronRight className="w-3.5 h-3.5 text-gray-700 shrink-0 mt-0.5" />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
