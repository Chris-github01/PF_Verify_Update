import { GitBranch, Rocket, RotateCcw, Play, TrendingUp, Pause, Tag } from 'lucide-react';
import type { ModuleVersionHistoryRecord, VersionHistoryEventType } from '../../../types/shadow';

const EVENT_CONFIG: Record<VersionHistoryEventType, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = {
  promoted_to_rc: {
    label: 'Promoted to Release Candidate',
    icon: <GitBranch className="w-3.5 h-3.5" />,
    color: 'text-amber-300',
    bg: 'bg-amber-500',
  },
  promoted_to_production: {
    label: 'Promoted to Production',
    icon: <Rocket className="w-3.5 h-3.5" />,
    color: 'text-teal-300',
    bg: 'bg-teal-500',
  },
  rolled_back: {
    label: 'Rollback Executed',
    icon: <RotateCcw className="w-3.5 h-3.5" />,
    color: 'text-red-300',
    bg: 'bg-red-500',
  },
  beta_started: {
    label: 'Beta Started',
    icon: <Play className="w-3.5 h-3.5" />,
    color: 'text-cyan-300',
    bg: 'bg-cyan-500',
  },
  beta_expanded: {
    label: 'Beta Expanded',
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: 'text-blue-300',
    bg: 'bg-blue-500',
  },
  beta_paused: {
    label: 'Beta Paused',
    icon: <Pause className="w-3.5 h-3.5" />,
    color: 'text-orange-300',
    bg: 'bg-orange-500',
  },
  version_set: {
    label: 'Version Set',
    icon: <Tag className="w-3.5 h-3.5" />,
    color: 'text-gray-300',
    bg: 'bg-gray-600',
  },
};

interface PlumbingReleaseTimelineProps {
  history: ModuleVersionHistoryRecord[];
}

export default function PlumbingReleaseTimeline({ history }: PlumbingReleaseTimelineProps) {
  if (history.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No release history recorded yet. Actions will appear here as the release progresses.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Release Timeline</h2>
      </div>
      <div className="p-5">
        <div className="relative space-y-4">
          <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-800" />
          {history.map((item) => {
            const cfg = EVENT_CONFIG[item.event_type] ?? {
              label: item.event_type,
              icon: <Tag className="w-3.5 h-3.5" />,
              color: 'text-gray-400',
              bg: 'bg-gray-600',
            };
            return (
              <div key={item.id} className="flex items-start gap-4 relative">
                <div className={`w-6 h-6 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 text-white z-10`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <div className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</div>
                  {(item.from_version || item.to_version) && (
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                      {item.from_version && <span>{item.from_version} → </span>}
                      <span className="text-gray-300">{item.to_version}</span>
                    </div>
                  )}
                  {item.from_rollout_status && item.to_rollout_status && (
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {item.from_rollout_status} → {item.to_rollout_status}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-[10px] text-gray-500 italic mt-1">{item.notes}</div>
                  )}
                  <div className="text-[10px] text-gray-700 mt-1 font-mono">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
