import { Shield, CheckCircle2, Clock, FlaskConical, XCircle, Zap } from 'lucide-react';
import { TRADE_MODULES, STATUS_COLORS, TRADE_COLORS, CAPABILITY_LABELS } from '../../lib/modules/tradeRegistry';
import type { ModuleCapabilities, ModuleStatus } from '../../lib/modules/tradeRegistry';

const STATUS_ICONS: Record<ModuleStatus, React.ComponentType<{ className?: string }>> = {
  active:       CheckCircle2,
  beta:         Zap,
  experimental: FlaskConical,
  disabled:     XCircle,
};

export default function TradeModuleRegistryView() {
  const modules = Object.values(TRADE_MODULES);

  return (
    <div className="space-y-3">
      {modules.map((mod) => {
        const StatusIcon = STATUS_ICONS[mod.status];
        const enabledCaps = Object.entries(mod.capabilities).filter(([, v]) => v).map(([k]) => k as keyof ModuleCapabilities);
        const totalCaps = Object.keys(mod.capabilities).length;

        return (
          <div key={mod.module_key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-start gap-3">
              <Shield className={`w-4 h-4 mt-0.5 shrink-0 ${TRADE_COLORS[mod.trade_category]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{mod.module_name}</span>
                  <code className="text-[10px] font-mono text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{mod.module_key}</code>
                  <span className={`flex items-center gap-1 text-[10px] font-medium ${STATUS_COLORS[mod.status]}`}>
                    <StatusIcon className="w-3 h-3" />
                    {mod.status}
                  </span>
                  <span className="text-[10px] text-gray-600">v{mod.version}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{mod.description}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {(Object.keys(mod.capabilities) as (keyof ModuleCapabilities)[]).map((cap) => {
                    const enabled = mod.capabilities[cap];
                    return (
                      <span
                        key={cap}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          enabled
                            ? 'text-teal-300 bg-teal-900/20 border-teal-700/30'
                            : 'text-gray-700 bg-gray-900 border-gray-800'
                        }`}
                      >
                        {CAPABILITY_LABELS[cap]}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xl font-black text-white tabular-nums">{enabledCaps.length}<span className="text-sm text-gray-600">/{totalCaps}</span></div>
                <div className="text-[10px] text-gray-600">capabilities</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
