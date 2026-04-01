import { useEffect, useState } from 'react';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingDiscrepancySummaryCards from '../../components/plumbing/PlumbingDiscrepancySummaryCards';
import PlumbingRiskFlagsBanner from '../../components/plumbing/PlumbingRiskFlagsBanner';
import PlumbingRowDiffTable from '../../components/plumbing/PlumbingRowDiffTable';
import PlumbingExcludedRowsTable from '../../components/plumbing/PlumbingExcludedRowsTable';
import PlumbingSuspiciousRowsTable from '../../components/plumbing/PlumbingSuspiciousRowsTable';
import PlumbingAdjudicationSummary from '../../components/plumbing/PlumbingAdjudicationSummary';
import DocumentTotalCandidatesPanel from '../../components/plumbing/DocumentTotalCandidatesPanel';
import PlumbingSystemicMissBlock from '../../components/plumbing/PlumbingSystemicMissBlock';
import { dbGetShadowRun, dbGetShadowRunResults } from '../../lib/db/shadowRuns';
import { normalizeForShadowCompare } from '../../lib/modules/parsers/plumbing/plumbingNormalizer';
import { buildPlumbingDiff } from '../../lib/modules/parsers/plumbing/plumbingDiffBuilder';
import { savePlumbingAdjudicationDraft } from '../../lib/modules/parsers/plumbing/savePlumbingDraft';
import type { ShadowRunRecord } from '../../types/shadow';
import type { PlumbingDiff, ReviewStatus } from '../../types/plumbingDiscrepancy';

function getRunIdFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/plumbing\/compare\/([^/?#]+)\/?$/);
  return m ? m[1] : undefined;
}

type Section = 'diff_table' | 'excluded_rows' | 'suspicious_rows' | 'adjudication';

export default function PlumbingCompareView() {
  const runId = getRunIdFromPath();
  const [run, setRun] = useState<ShadowRunRecord | null>(null);
  const [diff, setDiff] = useState<PlumbingDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('diff_table');
  const [saving, setSaving] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('unreviewed');

  useEffect(() => {
    if (!runId) return;
    loadCompare(runId);
  }, [runId]);

  async function loadCompare(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [runData, results] = await Promise.all([
        dbGetShadowRun(id),
        dbGetShadowRunResults(id),
      ]);

      if (!runData) throw new Error('Shadow run not found');
      if (runData.module_key !== 'plumbing_parser') {
        throw new Error(`This view is only for plumbing_parser runs (got: ${runData.module_key})`);
      }

      setRun(runData);

      const liveResult = results.find((r) => r.result_type === 'live');
      const shadowResult = results.find((r) => r.result_type === 'shadow');

      if (!liveResult || !shadowResult) {
        throw new Error('Run results incomplete — both live and shadow outputs are required');
      }

      const liveOutput = liveResult.output_json as Record<string, unknown>;
      const shadowOutput = shadowResult.output_json as Record<string, unknown>;

      const documentTotal =
        (liveOutput.documentTotal as number | null) ??
        (liveOutput.detectedDocumentTotal as number | null) ??
        null;

      const liveRows = extractRows(liveOutput);
      const shadowRows = extractRows(shadowOutput);

      if (liveRows.length === 0 && shadowRows.length === 0) {
        throw new Error('No row data found in run results. Ensure runs store normalized row arrays.');
      }

      const liveNormalized = normalizeForShadowCompare(liveRows, documentTotal);
      const shadowNormalized = normalizeForShadowCompare(shadowRows, documentTotal);
      const plumbingDiff = buildPlumbingDiff(liveNormalized, shadowNormalized);

      setDiff(plumbingDiff);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load compare data');
    } finally {
      setLoading(false);
    }
  }

  function extractRows(output: Record<string, unknown>): Array<Record<string, unknown>> {
    if (Array.isArray(output.rows)) return output.rows as Array<Record<string, unknown>>;
    if (Array.isArray(output.items)) return output.items as Array<Record<string, unknown>>;
    if (Array.isArray(output.lineItems)) return output.lineItems as Array<Record<string, unknown>>;
    const inner = output.summary ?? output.output ?? output.result;
    if (inner && typeof inner === 'object') {
      const o = inner as Record<string, unknown>;
      if (Array.isArray(o.rows)) return o.rows as Array<Record<string, unknown>>;
      if (Array.isArray(o.items)) return o.items as Array<Record<string, unknown>>;
    }
    return [];
  }

  async function handleSaveDraft() {
    if (!run || !diff || !runId) return;
    setSaving(true);
    try {
      const draftId = await savePlumbingAdjudicationDraft({
        runId,
        sourceType: run.source_type,
        sourceId: run.source_id,
        diff,
        adminNote: adminNote || undefined,
        reviewStatus,
      });
      setSavedDraftId(draftId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  }

  const sections: { id: Section; label: string; count?: number }[] = [
    { id: 'diff_table', label: 'Row Classification Diff', count: diff?.rowClassificationChanges.length },
    { id: 'excluded_rows', label: 'Excluded Summary Rows', count: diff?.shadowExcludedRows.length },
    { id: 'suspicious_rows', label: 'Suspicious Rows', count: diff?.shadowSuspiciousRows.length },
    { id: 'adjudication', label: 'Adjudication Summary' },
  ];

  if (!runId) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-red-400 text-sm">Invalid URL — no run ID found</div>
      </ShadowLayout>
    );
  }

  return (
    <ShadowLayout>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <a href="/shadow/modules/plumbing_parser" className="text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
              <div>
                <h1 className="text-xl font-bold text-white">Plumbing Parser — Discrepancy Review</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 font-mono">Run: {runId.slice(0, 8)}...</span>
                  {run && (
                    <>
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-gray-600">{run.source_label ?? run.source_id.slice(0, 16)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {savedDraftId ? (
                <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-green-400 bg-green-950/30 border border-green-800 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Draft saved
                </div>
              ) : (
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || !diff}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading compare data...</div>
          ) : diff ? (
            <div className="space-y-6">
              <PlumbingDiscrepancySummaryCards diff={diff} />
              {diff.systemicFailure && <PlumbingSystemicMissBlock diff={diff} />}
              <PlumbingRiskFlagsBanner flags={diff.riskFlags} />

              <div className="flex gap-2 border-b border-gray-800 pb-0">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeSection === s.id
                        ? 'border-amber-500 text-amber-400'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {s.label}
                    {s.count !== undefined && (
                      <span className={`ml-1.5 text-[10px] px-1 rounded ${
                        activeSection === s.id ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-500'
                      }`}>
                        {s.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {activeSection === 'diff_table' && (
                <PlumbingRowDiffTable changes={diff.rowClassificationChanges} />
              )}

              {activeSection === 'excluded_rows' && (
                <div className="space-y-4">
                  <PlumbingExcludedRowsTable
                    rows={diff.shadowExcludedRows}
                    title="Shadow Excluded Rows"
                    emptyMessage="Shadow parser did not exclude any rows"
                  />
                  {diff.liveExcludedRows.length > 0 && (
                    <PlumbingExcludedRowsTable
                      rows={diff.liveExcludedRows}
                      title="Live Excluded Rows (for comparison)"
                    />
                  )}
                </div>
              )}

              {activeSection === 'suspicious_rows' && (
                <PlumbingSuspiciousRowsTable rows={diff.shadowSuspiciousRows} />
              )}

              {activeSection === 'adjudication' && (
                <div className="space-y-4">
                  <DocumentTotalCandidatesPanel validation={diff.documentTotalValidation} />
                  <PlumbingAdjudicationSummary diff={diff} />

                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-white">Admin Review</h3>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Review Status</label>
                      <select
                        value={reviewStatus}
                        onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}
                        className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="reviewed_ok">Reviewed — OK</option>
                        <option value="reviewed_needs_changes">Reviewed — Needs Changes</option>
                        <option value="reviewed_blocked">Reviewed — Blocked</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Admin Note (optional)</label>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        rows={3}
                        placeholder="Add internal notes about this comparison..."
                        className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 resize-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {savedDraftId ? (
                        <div className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Saved to shadow_drafts · {savedDraftId.slice(0, 8)}
                        </div>
                      ) : (
                        <button
                          onClick={handleSaveDraft}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-amber-500 text-gray-950 font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
                        >
                          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Adjudication Draft
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-700">This saves to shadow_drafts only. No customer data is affected.</p>
                  </div>

                  {diff.totalsComparison.shadowParsedTotal > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-white">Parser Warnings</h3>
                      {diff.riskFlags.length === 0 ? (
                        <p className="text-xs text-gray-500">No parser warnings</p>
                      ) : (
                        <div className="space-y-1">
                          {diff.riskFlags.map((flag) => (
                            <div key={flag.id} className="text-xs text-amber-300/80">• {flag.title}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </ShadowLayout>
  );
}
