import { CheckCircle2, Circle, Clock, AlertCircle, Map } from 'lucide-react';

type StepStatus = { title: string; complete: boolean };

type Phase = {
  id: string;
  title: string;
  status: 'IN_PROGRESS' | 'NOT_STARTED' | 'COMPLETE';
  steps: StepStatus[];
};

const roadmap: Phase[] = [
  {
    id: 'phase_1',
    title: 'Roadmap Tracker',
    status: 'IN_PROGRESS',
    steps: [
      { title: 'Create UI Page', complete: true },
      { title: 'Add Progress System', complete: false },
      { title: 'Add Validation Logs', complete: false },
    ],
  },
  {
    id: 'phase_2',
    title: 'Commercial Module',
    status: 'NOT_STARTED',
    steps: [],
  },
  {
    id: 'phase_3',
    title: 'Procurement Module',
    status: 'NOT_STARTED',
    steps: [],
  },
];

function getProgressPercent(steps: StepStatus[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.complete).length;
  return Math.round((done / steps.length) * 100);
}

function StatusBadge({ status }: { status: Phase['status'] }) {
  if (status === 'IN_PROGRESS') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/30">
        <Clock className="h-3 w-3" />
        In Progress
      </span>
    );
  }
  if (status === 'COMPLETE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/60 px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-slate-600/40">
      <AlertCircle className="h-3 w-3" />
      Not Started
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-slate-500 uppercase tracking-widest">Progress</span>
        <span className="text-xs font-semibold text-slate-300">{percent}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const percent = getProgressPercent(phase.steps);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 text-sm font-bold flex-shrink-0">
            {String(index + 1).padStart(2, '0')}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500 mb-0.5">
              Phase {index + 1}
            </p>
            <h3 className="text-base font-semibold text-slate-100">{phase.title}</h3>
          </div>
        </div>
        <StatusBadge status={phase.status} />
      </div>

      {phase.steps.length > 0 ? (
        <>
          <div className="divide-y divide-slate-800/60">
            {phase.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                {step.complete ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-600 flex-shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    step.complete ? 'text-slate-300 line-through decoration-slate-600' : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </span>
                {step.complete && (
                  <span className="ml-auto text-[10px] font-medium text-emerald-500 uppercase tracking-wider">
                    Done
                  </span>
                )}
              </div>
            ))}
          </div>
          <ProgressBar percent={percent} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-800/20 px-4 py-5 text-center">
          <p className="text-sm text-slate-500">No steps defined yet.</p>
        </div>
      )}
    </div>
  );
}

export default function FutureBuildsRoadmap() {
  const totalSteps = roadmap.flatMap((p) => p.steps).length;
  const completedSteps = roadmap.flatMap((p) => p.steps).filter((s) => s.complete).length;
  const overallPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const inProgressCount = roadmap.filter((p) => p.status === 'IN_PROGRESS').length;
  const notStartedCount = roadmap.filter((p) => p.status === 'NOT_STARTED').length;

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-10">
      <div className="max-w-4xl mx-auto">

        {/* Page Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 shadow-lg shadow-sky-500/20 flex-shrink-0">
            <Map className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20 mb-2">
              DEV-ONLY
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Future Builds Roadmap</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Internal development tracker — not visible to clients.
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500 mb-1">Phases</p>
            <p className="text-3xl font-bold text-slate-100">{roadmap.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500 mb-1">In Progress</p>
            <p className="text-3xl font-bold text-amber-400">{inProgressCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500 mb-1">Not Started</p>
            <p className="text-3xl font-bold text-slate-400">{notStartedCount}</p>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-300">Overall Completion</p>
            <p className="text-sm font-semibold text-sky-400">
              {completedSteps} / {totalSteps} steps
            </p>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-700"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          <p className="text-right mt-1.5 text-xs text-slate-500">{overallPercent}% complete</p>
        </div>

        {/* Phase Cards */}
        <div className="space-y-4">
          {roadmap.map((phase, index) => (
            <PhaseCard key={phase.id} phase={phase} index={index} />
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-10 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 px-5 py-4 text-center">
          <p className="text-xs text-slate-500">
            This page is admin-only and contains no database calls, API calls, or production logic.
            Static data only.
          </p>
        </div>
      </div>
    </div>
  );
}
