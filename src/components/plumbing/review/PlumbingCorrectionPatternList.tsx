import { Wrench } from 'lucide-react';
import type { ReviewFeedback } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';

interface PlumbingCorrectionPatternListProps {
  feedback: ReviewFeedback[];
}

interface Pattern {
  phrase: string;
  action: string;
  count: number;
  confidence: number;
  feedbackIds: string[];
}

export default function PlumbingCorrectionPatternList({ feedback }: PlumbingCorrectionPatternListProps) {
  const correctionFeedback = feedback.filter(
    (f) => f.feedback_type === 'rule_training' || f.feedback_type === 'pattern_training'
  );

  const patternMap = new Map<string, Pattern>();

  for (const fb of correctionFeedback) {
    const phrase = String(fb.payload_json.targetRowPhrase ?? fb.payload_json.phrase ?? '');
    const action = String(fb.payload_json.correctAction ?? fb.payload_json.action ?? 'unspecified');
    if (!phrase) continue;
    const key = `${phrase}::${action}`;
    const existing = patternMap.get(key) ?? { phrase, action, count: 0, confidence: 0, feedbackIds: [] };
    existing.count++;
    existing.confidence += Number(fb.payload_json.confidence ?? 0);
    existing.feedbackIds.push(fb.id);
    patternMap.set(key, existing);
  }

  const patterns = Array.from(patternMap.values())
    .map((p) => ({ ...p, confidence: p.count > 0 ? p.confidence / p.count : 0 }))
    .sort((a, b) => b.count - a.count);

  if (patterns.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No correction patterns recorded yet. Patterns appear when reviewers record structured decisions with correction payloads.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <Wrench className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-white">Correction Patterns</h2>
        <p className="text-[10px] text-gray-500 ml-auto">Candidates for rule formalization</p>
      </div>
      <div className="divide-y divide-gray-800">
        {patterns.map((p) => (
          <div key={`${p.phrase}::${p.action}`} className="px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-medium text-white truncate">"{p.phrase}"</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Action: <span className="text-gray-300">{p.action.replace(/_/g, ' ')}</span></div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-[10px] text-gray-500">Frequency</div>
                <div className="text-sm font-bold text-white">{p.count}×</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-500">Avg confidence</div>
                <div className={`text-sm font-bold ${p.confidence >= 7 ? 'text-teal-300' : p.confidence >= 5 ? 'text-amber-300' : 'text-red-300'}`}>
                  {p.confidence.toFixed(1)}/10
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
