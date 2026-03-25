import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Shield, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ModuleHealthCard from '../../components/shadow/ModuleHealthCard';
import ModuleOnboardingWizard from '../../components/shadow/ModuleOnboardingWizard';
import { dbGetModuleHealthScores, buildDefaultHealthScore, dbSaveHealthScore } from '../../lib/intelligence/moduleHealth';
import { dbGetCrossTradePatterns } from '../../lib/intelligence/learning/crossTradePatterns';
import { getModuleConfig, isFeatureEnabled } from '../../lib/modules/moduleConfig';
import { TRADE_MODULES, TRADE_COLORS, STATUS_COLORS, CAPABILITY_LABELS } from '../../lib/modules/tradeRegistry';
import type { ModuleHealthScore } from '../../lib/intelligence/moduleHealth';
import type { CrossTradePattern } from '../../lib/intelligence/learning/crossTradePatterns';
import type { ModuleCapabilities } from '../../lib/modules/tradeRegistry';

export default function IntelligenceModuleDetail() {
  const moduleKey = window.location.pathname.split('/').pop() ?? '';
  const mod = TRADE_MODULES[moduleKey];

  const [scores, setScores] = useState<ModuleHealthScore[]>([]);
  const [latestScore, setLatestScore] = useState<ModuleHealthScore | null>(null);
  const [patterns, setPatterns] = useState<CrossTradePattern[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!moduleKey) return;
    const [allScores, crossPatterns] = await Promise.all([
      dbGetModuleHealthScores({ moduleKey, limit: 30 }),
      dbGetCrossTradePatterns({ status: 'active' }),
    ]);

    let finalScores = allScores;
    if (allScores.length === 0) {
      const s = await dbSaveHealthScore(buildDefaultHealthScore(moduleKey));
      finalScores = [s];
    }

    setScores(finalScores);
    setLatestScore(finalScores[0] ?? null);
    setPatterns(crossPatterns.filter((p) => p.affected_modules.includes(moduleKey)));
  }, [moduleKey]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (!mod) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-sm text-gray-500">Module '{moduleKey}' not found in registry.</div>
      </ShadowLayout>
    );
  }

  const config = getModuleConfig(moduleKey);
  const tradeColor = TRADE_COLORS[mod.trade_category];

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/shadow/intelligence/modules" className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className={`w-5 h-5 ${tradeColor}`} />
              {mod.module_name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-[10px] font-mono text-gray-500">{mod.module_key}</code>
              <span className={`text-[10px] ${STATUS_COLORS[mod.status]}`}>{mod.status}</span>
              <span className="text-[10px] text-gray-600">v{mod.version}</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-400">{mod.description}</p>

        {/* Latest health card */}
        {latestScore && !loading && (
          <div className="max-w-xs">
            <ModuleHealthCard score={latestScore} />
          </div>
        )}

        {/* Capabilities */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Intelligence capabilities</h2>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(Object.entries(mod.capabilities) as [keyof ModuleCapabilities, boolean][]).map(([cap, enabled]) => {
              const flagKey = `${cap}_enabled`;
              const flagOverride = isFeatureEnabled(moduleKey, flagKey);
              const effective = enabled || flagOverride;
              return (
                <div key={cap} className={`px-3 py-2.5 rounded-lg border ${effective ? 'border-teal-700/30 bg-teal-900/10' : 'border-gray-800 bg-gray-950'}`}>
                  <div className={`text-xs font-medium ${effective ? 'text-teal-300' : 'text-gray-600'}`}>{CAPABILITY_LABELS[cap]}</div>
                  <div className={`text-[10px] mt-0.5 ${effective ? 'text-teal-500' : 'text-gray-700'}`}>{effective ? 'Enabled' : 'Not enabled'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Module config */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Module configuration</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <ConfigSection label="Thresholds">
              {Object.entries(config.thresholds).map(([k, v]) => (
                <ConfigRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
              ))}
            </ConfigSection>
            <ConfigSection label="Learning params">
              {Object.entries(config.learning).map(([k, v]) => (
                <ConfigRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
              ))}
            </ConfigSection>
          </div>
        </div>

        {/* Cross-trade patterns affecting this module */}
        {patterns.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Cross-trade patterns affecting this module</h2>
            </div>
            <div className="p-5 space-y-2">
              {patterns.map((p) => (
                <div key={p.id} className="text-[10px] bg-amber-900/10 border border-amber-700/30 rounded-lg px-3 py-2">
                  <code className="text-amber-300 font-mono">{p.pattern_key}</code>
                  <span className="text-gray-500 ml-2">{p.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historical health scores */}
        {scores.length > 1 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Health history</h2>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="pb-2 px-2 text-left text-gray-500">Date</th>
                    <th className="pb-2 px-2 text-left text-gray-500">Overall</th>
                    <th className="pb-2 px-2 text-left text-gray-500">Regression</th>
                    <th className="pb-2 px-2 text-left text-gray-500">Accuracy</th>
                    <th className="pb-2 px-2 text-left text-gray-500">Anomaly</th>
                    <th className="pb-2 px-2 text-left text-gray-500">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.slice(0, 10).map((s) => {
                    const T = s.trend === 'improving' ? TrendingUp : s.trend === 'degrading' ? TrendingDown : Minus;
                    const tc = s.trend === 'improving' ? 'text-teal-400' : s.trend === 'degrading' ? 'text-red-400' : 'text-gray-500';
                    return (
                      <tr key={s.id} className="border-b border-gray-800/50">
                        <td className="py-2 px-2 text-gray-500">{s.snapshot_date}</td>
                        <td className="py-2 px-2 font-bold text-white">{s.overall_health_score}</td>
                        <td className="py-2 px-2 text-gray-400">{s.regression_pass_rate.toFixed(1)}%</td>
                        <td className="py-2 px-2 text-gray-400">{s.accuracy_score.toFixed(1)}%</td>
                        <td className="py-2 px-2 text-gray-400">{s.anomaly_rate.toFixed(1)}%</td>
                        <td className={`py-2 px-2 ${tc}`}><T className="w-3 h-3" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Onboarding wizard for experimental modules */}
        {(mod.status === 'experimental' || mod.status === 'beta') && (
          <ModuleOnboardingWizard targetModuleKey={moduleKey} />
        )}

        {/* Intelligence links for active modules */}
        {mod.status === 'active' && moduleKey === 'plumbing_parser' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs font-medium text-gray-400 mb-3">Intelligence modules</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Optimization engine', href: '/shadow/modules/plumbing_parser/optimization' },
                { label: 'Learning dashboard', href: '/shadow/modules/plumbing_parser/learning' },
                { label: 'Predictive intelligence', href: '/shadow/modules/plumbing_parser/predictive' },
                { label: 'Review operations', href: '/shadow/modules/plumbing_parser/review' },
                { label: 'Executive view', href: '/shadow/modules/plumbing_parser/executive' },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  className="text-xs text-teal-400 hover:text-teal-300 border border-teal-700/30 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  {label} →
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}

function ConfigSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</div>
      {children}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-gray-600 capitalize">{label}</span>
      <span className="text-gray-300 font-mono">{value}</span>
    </div>
  );
}
