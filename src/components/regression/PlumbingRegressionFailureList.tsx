import type { AssertionResult } from '../../lib/modules/parsers/plumbing/regression/types';

interface Props {
  assertions: AssertionResult[];
  showOnlyFailed?: boolean;
}

const SEVERITY_COLOR: Record<string, string> = {
  info:     'text-gray-500',
  low:      'text-teal-400',
  medium:   'text-amber-400',
  high:     'text-orange-400',
  critical: 'text-red-400',
};

export default function PlumbingRegressionFailureList({ assertions, showOnlyFailed = true }: Props) {
  const displayed = showOnlyFailed ? assertions.filter((a) => !a.passed) : assertions;

  if (displayed.length === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-4">
        {showOnlyFailed ? 'All assertions passed' : 'No assertions defined'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {displayed.map((a, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs ${
            a.passed
              ? 'bg-green-950/10 border-green-900/30'
              : 'bg-red-950/10 border-red-900/30'
          }`}
        >
          <span className={`shrink-0 font-bold uppercase text-[10px] tracking-wider mt-0.5 ${a.passed ? 'text-green-400' : SEVERITY_COLOR[a.severity]}`}>
            {a.passed ? 'OK' : a.severity}
          </span>
          <div className="flex-1 min-w-0">
            <div className={`font-medium ${a.passed ? 'text-gray-400' : 'text-white'}`}>{a.label}</div>
            <div className="text-gray-600 mt-0.5 flex gap-3 flex-wrap">
              <span>Expected: <span className="text-gray-400">{a.expected}</span></span>
              <span>Got: <span className={a.passed ? 'text-gray-400' : 'text-red-300'}>{a.actual}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
