import { Play, ArrowUpCircle, RotateCcw, Zap, ChevronRight } from 'lucide-react';
import type { ModuleRegistryRecord, ModuleVersionRecord } from '../../types/shadow';
import ModuleVersionBadge from './ModuleVersionBadge';

interface Props {
  module: ModuleRegistryRecord;
  version?: ModuleVersionRecord;
  killSwitchActive?: boolean;
  onKillSwitch: (moduleKey: string, active: boolean) => void;
  onPromote: (moduleKey: string) => void;
  onRollback: (moduleKey: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  parser:     'bg-blue-950 text-blue-400 border-blue-800',
  scoring:    'bg-green-950 text-green-400 border-green-800',
  export:     'bg-amber-950 text-amber-400 border-amber-800',
  classifier: 'bg-teal-950 text-teal-400 border-teal-800',
  workflow:   'bg-gray-800 text-gray-400 border-gray-700',
};

export default function ShadowModuleCard({ module, version, killSwitchActive, onKillSwitch, onPromote, onRollback }: Props) {
  return (
    <div className={`
      bg-gray-900 border rounded-xl p-5 flex flex-col gap-4 transition-all
      ${killSwitchActive ? 'border-red-800 shadow-red-900/20 shadow-lg' : 'border-gray-800 hover:border-gray-700'}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white truncate">{module.module_name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[module.module_type] ?? TYPE_COLORS.workflow}`}>
              {module.module_type}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{module.module_key}</p>
        </div>
        {version && <ModuleVersionBadge status={version.rollout_status} />}
      </div>

      {/* Description */}
      {module.description && (
        <p className="text-xs text-gray-400 leading-relaxed">{module.description}</p>
      )}

      {/* Versions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-950 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Live Version</div>
          <div className="text-sm font-mono font-medium text-white">{version?.live_version ?? 'v1'}</div>
        </div>
        <div className="bg-gray-950 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Shadow Version</div>
          <div className="text-sm font-mono font-medium text-gray-300">{version?.shadow_version ?? '—'}</div>
        </div>
      </div>

      {/* Kill switch warning */}
      {killSwitchActive && (
        <div className="flex items-center gap-2 bg-red-950/60 border border-red-800 rounded-lg px-3 py-2">
          <Zap className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300 font-medium">Kill switch active — all traffic forced to live</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href={`/shadow/modules/${module.module_key}`}
          className="flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          Open
        </a>
        <a
          href={`/shadow/modules/${module.module_key}/compare`}
          className="flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Compare
        </a>
        {version?.promoted_candidate_version && (
          <button
            onClick={() => onPromote(module.module_key)}
            className="flex items-center gap-1.5 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            Promote
          </button>
        )}
        {version?.rollback_version && (
          <button
            onClick={() => onRollback(module.module_key)}
            className="flex items-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Rollback
          </button>
        )}
        <button
          onClick={() => onKillSwitch(module.module_key, !killSwitchActive)}
          className={`
            flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors
            ${killSwitchActive
              ? 'bg-red-500/20 text-red-300 border-red-500/50 hover:bg-red-500/30'
              : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-white'
            }
          `}
        >
          <Zap className="w-3.5 h-3.5" />
          {killSwitchActive ? 'Disable Kill Switch' : 'Kill Switch'}
        </button>
      </div>
    </div>
  );
}
