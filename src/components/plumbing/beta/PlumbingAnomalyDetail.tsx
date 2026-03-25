import { X, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { AnomalyEventRecord, AnomalyResolutionStatus } from '../../../lib/modules/parsers/plumbing/beta/anomalyTypes';
import { dbUpdateAnomalyStatus } from '../../../lib/db/plumbingBetaDb';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-300 border-red-500/40 bg-red-500/10',
  high: 'text-orange-300 border-orange-500/40 bg-orange-500/10',
  medium: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  low: 'text-gray-400 border-gray-700 bg-gray-800',
};

interface PlumbingAnomalyDetailProps {
  anomaly: AnomalyEventRecord;
  onClose: () => void;
  onRefresh: () => void;
}

export default function PlumbingAnomalyDetail({ anomaly, onClose, onRefresh }: PlumbingAnomalyDetailProps) {
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');

  async function handleAction(status: AnomalyResolutionStatus) {
    setBusy(true);
    try {
      await dbUpdateAnomalyStatus(anomaly.id, status, notes || undefined);
      onRefresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${SEVERITY_COLORS[anomaly.severity] ?? ''}`}>
              {anomaly.severity.toUpperCase()}
            </span>
            <h2 className="text-sm font-semibold text-white truncate">{anomaly.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <InfoRow label="Anomaly Type" value={anomaly.anomaly_type} mono />
            <InfoRow label="Score" value={String(anomaly.anomaly_score)} />
            <InfoRow label="Status" value={anomaly.resolution_status} />
            <InfoRow label="Detected" value={new Date(anomaly.created_at).toLocaleString()} />
            {anomaly.org_id && <InfoRow label="Org ID" value={anomaly.org_id} mono />}
            {anomaly.source_id && <InfoRow label="Source ID" value={anomaly.source_id} mono />}
            {anomaly.run_id && (
              <div>
                <div className="text-gray-500 mb-0.5">Run ID</div>
                <a
                  href={`/shadow/modules/plumbing_parser/runs/${anomaly.run_id}`}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                  target="_blank" rel="noreferrer"
                >
                  {anomaly.run_id.slice(0, 16)}… <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {anomaly.description && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Description</div>
              <p className="text-sm text-gray-300 leading-relaxed">{anomaly.description}</p>
            </div>
          )}

          <div>
            <div className="text-xs text-gray-500 mb-2">Evidence</div>
            <pre className="text-[10px] text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(anomaly.evidence_json, null, 2)}
            </pre>
          </div>

          {anomaly.resolution_notes && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Resolution Notes</div>
              <p className="text-sm text-gray-400">{anomaly.resolution_notes}</p>
            </div>
          )}

          {anomaly.run_id && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Related Links</div>
              <a
                href={`/shadow/plumbing/compare?run_id=${anomaly.run_id}`}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                View discrepancy compare <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {anomaly.resolution_status === 'open' || anomaly.resolution_status === 'acknowledged' ? (
            <div className="border-t border-gray-800 pt-5 space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Resolution Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none resize-none"
                  placeholder="Add context before resolving or ignoring..."
                />
              </div>
              <div className="flex items-center gap-3">
                {anomaly.resolution_status === 'open' && (
                  <button
                    onClick={() => handleAction('acknowledged')}
                    disabled={busy}
                    className="text-xs font-medium px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors"
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  onClick={() => handleAction('resolved')}
                  disabled={busy}
                  className="text-xs font-medium px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50 transition-colors"
                >
                  Mark Resolved
                </button>
                <button
                  onClick={() => handleAction('ignored')}
                  disabled={busy}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Ignore
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-800 pt-4">
              <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                anomaly.resolution_status === 'resolved' ? 'bg-teal-500/15 text-teal-300'
                : 'bg-gray-800 text-gray-500'
              }`}>
                {anomaly.resolution_status === 'resolved' ? 'Resolved' : 'Ignored'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-gray-500 mb-0.5">{label}</div>
      <div className={`text-gray-200 ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</div>
    </div>
  );
}
