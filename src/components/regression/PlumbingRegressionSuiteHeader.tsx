import { ArrowLeft, Play, Download, Upload, Loader } from 'lucide-react';
import type { RegressionSuiteRecordExtended } from '../../lib/modules/parsers/plumbing/regression/types';

interface Props {
  suite: RegressionSuiteRecordExtended;
  caseCount: number;
  runCount: number;
  onRunSuite: () => void;
  onExport: () => void;
  onImport: () => void;
  running?: boolean;
}

export default function PlumbingRegressionSuiteHeader({
  suite, caseCount, runCount, onRunSuite, onExport, onImport, running,
}: Props) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <a href="/shadow/modules/plumbing_parser/regression" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">{suite.suite_name}</h1>
            {!suite.is_active && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500">Inactive</span>
            )}
          </div>
          {suite.description && <p className="text-sm text-gray-500 mt-0.5">{suite.description}</p>}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
            <span>{caseCount} case{caseCount !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{runCount} run{runCount !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>Created {new Date(suite.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onImport}
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Import
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <button
          onClick={onRunSuite}
          disabled={running || caseCount === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-amber-500 text-gray-950 font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {running
            ? <><Loader className="w-3.5 h-3.5 animate-spin" />Running...</>
            : <><Play className="w-3.5 h-3.5" />Run Suite</>
          }
        </button>
      </div>
    </div>
  );
}
