import { useEffect, useState } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import PlumbingRegressionRecommendationBanner from '../../components/regression/PlumbingRegressionRecommendationBanner';
import PlumbingRegressionSummaryCards from '../../components/regression/PlumbingRegressionSummaryCards';
import PlumbingRegressionCaseTable from '../../components/regression/PlumbingRegressionCaseTable';
import PlumbingRegressionCaseResultDetail from '../../components/regression/PlumbingRegressionCaseResultDetail';
import PlumbingRegressionFailureList from '../../components/regression/PlumbingRegressionFailureList';
import {
  dbGetPlumbingSuiteRun,
  dbGetSuiteRunCaseResults,
} from '../../lib/db/plumbingRegressionDb';
import type {
  RegressionSuiteRunRecordExtended,
  RegressionSuiteCaseResultRecord,
  SuiteRunSummary,
  CaseEvalResult,
  SuiteRecommendation,
} from '../../lib/modules/parsers/plumbing/regression/types';

function getRunId(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/modules\/plumbing_parser\/regression\/runs\/([^/]+)$/);
  return m ? m[1] : undefined;
}

function recordToEvalResult(r: RegressionSuiteCaseResultRecord): CaseEvalResult {
  const live = r.live_output_json as unknown as CaseEvalResult['liveOutput'];
  const shadow = r.shadow_output_json as unknown as CaseEvalResult['shadowOutput'];
  const metrics = r.metrics_json as unknown as CaseEvalResult['metrics'];
  const assertions = (r.expected_json?.assertionResults as CaseEvalResult['assertionResults']) ?? [];

  return {
    caseId: r.suite_case_id,
    caseLabel: String(r.expected_json?.caseLabel ?? r.source_id ?? r.suite_case_id),
    sourceType: r.source_type,
    sourceId: r.source_id,
    isMustPass: Boolean(r.expected_json?.isMustPass),
    passStatus: r.pass_status,
    overallSeverity: r.severity as CaseEvalResult['overallSeverity'],
    assertionResults: assertions,
    failureReasons: (r.failure_reasons_json as string[]) ?? [],
    shadowBetterThanLive: Boolean(metrics?.shadowBetterThanLive),
    livePassStatus: r.pass_status,
    shadowPassStatus: r.pass_status,
    metrics: metrics ?? {
      liveTotalDelta: null, shadowTotalDelta: null,
      liveDocTotalDelta: null, shadowDocTotalDelta: null,
      includedLineDelta: 0, excludedLineDelta: 0,
      classificationMismatchCount: 0, riskFlagMismatchCount: 0,
      shadowBetterThanLive: false, shadowMatchedExpectedTotal: false, liveMatchedExpectedTotal: false,
    },
    liveOutput: live ?? {
      parsedTotal: 0, detectedDocumentTotal: null, includedLineCount: 0,
      excludedLineCount: 0, excludedSummaryPhrases: [], riskFlagIds: [],
      classifiedRows: [], parserWarnings: [],
    },
    shadowOutput: shadow ?? {
      parsedTotal: 0, detectedDocumentTotal: null, includedLineCount: 0,
      excludedLineCount: 0, excludedSummaryPhrases: [], riskFlagIds: [],
      classifiedRows: [], parserWarnings: [],
    },
  };
}

export default function PlumbingRegressionRunPage() {
  const runId = getRunId();
  const [run, setRun] = useState<RegressionSuiteRunRecordExtended | null>(null);
  const [caseResults, setCaseResults] = useState<CaseEvalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseEvalResult | null>(null);

  useEffect(() => { if (runId) load(runId); }, [runId]);

  async function load(id: string) {
    setLoading(true);
    try {
      const [runData, rawResults] = await Promise.all([
        dbGetPlumbingSuiteRun(id),
        dbGetSuiteRunCaseResults(id),
      ]);
      if (!runData) throw new Error('Suite run not found');
      setRun(runData);
      setCaseResults(rawResults.map(recordToEvalResult));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }

  if (!runId) {
    return (
      <ShadowGuard>
        <ShadowLayout>
          <div className="text-center py-16 text-red-400 text-sm">Invalid URL — no run ID</div>
        </ShadowLayout>
      </ShadowGuard>
    );
  }

  const summary = run?.summary_json as unknown as Partial<SuiteRunSummary> | undefined;
  const recommendation = (run?.recommendation ?? summary?.recommendation ?? 'inconclusive') as SuiteRecommendation;
  const reasons = (summary?.recommendationReasons as string[]) ?? [];

  const criticalCases = caseResults.filter((r) => r.passStatus === 'fail_critical');
  const allFailed = caseResults.filter((r) => r.passStatus !== 'pass');
  const allAssertions = caseResults.flatMap((r) => r.assertionResults);
  const failedAssertions = allAssertions.filter((a) => !a.passed);

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-6">
          {selectedCase ? (
            <PlumbingRegressionCaseResultDetail
              result={selectedCase}
              onBack={() => setSelectedCase(null)}
            />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <a
                  href={run?.suite_id ? `/shadow/modules/plumbing_parser/regression/${run.suite_id}` : '/shadow/modules/plumbing_parser/regression'}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </a>
                <div>
                  <h1 className="text-xl font-bold text-white">Regression Run Results</h1>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{runId?.slice(0, 8)}...</span>
                    {run?.completed_at && <span>Completed {new Date(run.completed_at).toLocaleString()}</span>}
                    <span className={`font-medium ${run?.status === 'completed' ? 'text-green-400' : run?.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                      {run?.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}

              {loading ? (
                <div className="text-center py-12 text-gray-500 text-sm">Loading results...</div>
              ) : (
                <>
                  {recommendation !== 'inconclusive' && (
                    <PlumbingRegressionRecommendationBanner recommendation={recommendation} reasons={reasons} />
                  )}

                  <PlumbingRegressionSummaryCards
                    summary={{
                      casesTotal: run?.cases_total ?? 0,
                      casesPassed: run?.cases_passed ?? 0,
                      casesFailedMinor: run?.cases_failed_minor ?? 0,
                      casesFailedMajor: run?.cases_failed_major ?? 0,
                      casesFailedCritical: run?.cases_failed_critical ?? 0,
                      mustPassCasesFailed: (summary?.mustPassCasesFailed as number) ?? 0,
                      shadowBetterCount: (summary?.shadowBetterCount as number) ?? 0,
                      liveBetterCount: (summary?.liveBetterCount as number) ?? 0,
                      inconclusiveCount: (summary?.inconclusiveCount as number) ?? 0,
                    }}
                  />

                  {criticalCases.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-red-400 mb-3">Critical Failures ({criticalCases.length})</h3>
                      <div className="space-y-2">
                        {criticalCases.map((r) => (
                          <button
                            key={r.caseId}
                            onClick={() => setSelectedCase(r)}
                            className="w-full text-left px-3 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 rounded-lg text-xs text-red-300 transition-colors"
                          >
                            {r.caseLabel} — {r.failureReasons[0]?.slice(0, 80) ?? 'Critical error'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">All Cases</h3>
                    <PlumbingRegressionCaseTable
                      results={caseResults}
                      onSelectCase={setSelectedCase}
                    />
                  </div>

                  {failedAssertions.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">
                        Failed Assertions Across Suite ({failedAssertions.length})
                      </h3>
                      <PlumbingRegressionFailureList assertions={failedAssertions.slice(0, 30)} showOnlyFailed />
                      {failedAssertions.length > 30 && (
                        <p className="text-xs text-gray-600 mt-2">Showing first 30 of {failedAssertions.length} failures. Click a case row above for full detail.</p>
                      )}
                    </div>
                  )}

                  {allFailed.length > 0 && allFailed.every((r) => r.shadowBetterThanLive) && (
                    <div className="bg-cyan-950/20 border border-cyan-900/40 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-cyan-400 mb-2">Shadow Corrections Detected</h3>
                      <p className="text-xs text-gray-400">
                        In all failed cases, shadow parser performed better than live. This indicates shadow parser is
                        correcting known issues but may not yet fully match expected values. Consider reviewing tolerance rules.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
