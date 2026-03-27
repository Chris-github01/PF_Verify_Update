import { BookOpen } from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import LearningQueueTable from '../../../components/shadow/phase2/LearningQueueTable';

export default function ShadowReviewQueuePage() {
  function handleSelectRun(runId: string) {
    window.location.href = `/shadow/runs/${runId}/intelligence`;
  }

  return (
    <ShadowLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Active Learning Queue</h1>
            </div>
            <p className="text-sm text-gray-500 max-w-xl">
              Shadow runs are automatically scored and queued for human review based on failure patterns, confidence misalignment, and financial impact. Highest-priority runs are surfaced first.
            </p>
          </div>
        </div>

        {/* Priority legend */}
        <div className="flex items-center gap-4 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-xs">
          <span className="text-gray-600 font-medium">Priority Scale:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-gray-400">70–100 Critical</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-gray-400">40–69 High</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-gray-400">15–39 Medium</span>
          </span>
        </div>

        <LearningQueueTable onSelectRun={handleSelectRun} />
      </div>
    </ShadowLayout>
  );
}
