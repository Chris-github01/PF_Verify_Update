import { useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import type { ExpectedOutcome, RowClassificationAssertion } from '../../lib/modules/parsers/plumbing/regression/types';
import type { RowClassification } from '../../types/plumbingDiscrepancy';

interface Props {
  initialValues?: Partial<{
    caseLabel: string;
    sourceType: string;
    sourceId: string;
    isMustPass: boolean;
    notes: string;
    expectedOutcome: ExpectedOutcome;
  }>;
  onSave: (values: {
    caseLabel: string;
    sourceType: string;
    sourceId: string;
    isMustPass: boolean;
    notes: string;
    expectedOutcome: ExpectedOutcome;
  }) => void;
  onCancel?: () => void;
  saving?: boolean;
}

const CLASSIFICATION_OPTIONS: RowClassification[] = ['line_item', 'summary_total', 'subtotal', 'header', 'note', 'unclassified'];

export default function PlumbingRegressionCaseEditor({ initialValues, onSave, onCancel, saving }: Props) {
  const [caseLabel, setCaseLabel] = useState(initialValues?.caseLabel ?? '');
  const [sourceType, setSourceType] = useState(initialValues?.sourceType ?? 'quote');
  const [sourceId, setSourceId] = useState(initialValues?.sourceId ?? '');
  const [isMustPass, setIsMustPass] = useState(initialValues?.isMustPass ?? false);
  const [notes, setNotes] = useState(initialValues?.notes ?? '');

  const eo = initialValues?.expectedOutcome ?? {};
  const [expectedParsedTotal, setExpectedParsedTotal] = useState(eo.expectedParsedTotal?.toString() ?? '');
  const [expectedDocumentTotal, setExpectedDocumentTotal] = useState(eo.expectedDocumentTotal?.toString() ?? '');
  const [expectedIncludedCount, setExpectedIncludedCount] = useState(eo.expectedIncludedLineCount?.toString() ?? '');
  const [expectedExcludedCount, setExpectedExcludedCount] = useState(eo.expectedExcludedLineCount?.toString() ?? '');
  const [excludedPhrases, setExcludedPhrases] = useState<string[]>(eo.expectedExcludedSummaryPhrases ?? []);
  const [newPhrase, setNewPhrase] = useState('');
  const [toleranceType, setToleranceType] = useState<'absolute' | 'percentage'>(
    eo.toleranceRules?.parsedTotal?.type === 'percentage' ? 'percentage' : 'absolute'
  );
  const [toleranceValue, setToleranceValue] = useState(eo.toleranceRules?.parsedTotal?.value?.toString() ?? '0.5');
  const [classificationAssertions, setClassificationAssertions] = useState<RowClassificationAssertion[]>(
    eo.expectedClassificationAssertions ?? []
  );
  const [showJson, setShowJson] = useState(false);

  function buildOutcome(): ExpectedOutcome {
    const out: ExpectedOutcome = {};
    if (expectedParsedTotal) out.expectedParsedTotal = parseFloat(expectedParsedTotal);
    if (expectedDocumentTotal) out.expectedDocumentTotal = parseFloat(expectedDocumentTotal);
    if (expectedIncludedCount) out.expectedIncludedLineCount = parseInt(expectedIncludedCount);
    if (expectedExcludedCount) out.expectedExcludedLineCount = parseInt(expectedExcludedCount);
    if (excludedPhrases.length > 0) out.expectedExcludedSummaryPhrases = excludedPhrases;
    if (classificationAssertions.length > 0) out.expectedClassificationAssertions = classificationAssertions;
    if (toleranceValue) {
      out.toleranceRules = {
        parsedTotal: { type: toleranceType, value: parseFloat(toleranceValue) },
      };
    }
    return out;
  }

  function handleSubmit() {
    if (!caseLabel || !sourceId) return;
    onSave({ caseLabel, sourceType, sourceId, isMustPass, notes, expectedOutcome: buildOutcome() });
  }

  function addPhrase() {
    if (!newPhrase.trim()) return;
    setExcludedPhrases((p) => [...p, newPhrase.trim()]);
    setNewPhrase('');
  }

  function addAssertion() {
    setClassificationAssertions((a) => [...a, {
      matchType: 'phrase',
      matchValue: '',
      expectedClassification: 'summary_total',
      expectedIncluded: false,
      label: '',
    }]);
  }

  function updateAssertion(idx: number, updates: Partial<RowClassificationAssertion>) {
    setClassificationAssertions((prev) => prev.map((a, i) => i === idx ? { ...a, ...updates } : a));
  }

  function removeAssertion(idx: number) {
    setClassificationAssertions((prev) => prev.filter((_, i) => i !== idx));
  }

  const fieldCls = "w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50";
  const labelCls = "text-xs text-gray-500 mb-1 block";

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Case Label *</label>
          <input value={caseLabel} onChange={(e) => setCaseLabel(e.target.value)} placeholder="e.g. Quote A — final total duplication" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Source Type</label>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={fieldCls}>
            <option value="quote">quote</option>
            <option value="parsing_job">parsing_job</option>
            <option value="manual">manual</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Source ID *</label>
          <input value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="UUID or identifier" className={fieldCls} />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <button
            type="button"
            onClick={() => setIsMustPass((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors ${
              isMustPass
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            Must Pass
          </button>
          <span className="text-xs text-gray-600">Failure blocks beta recommendation</span>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Expected Outcomes</h4>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Expected Parsed Total</label>
            <input type="number" value={expectedParsedTotal} onChange={(e) => setExpectedParsedTotal(e.target.value)} placeholder="152340.40" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Expected Document Total</label>
            <input type="number" value={expectedDocumentTotal} onChange={(e) => setExpectedDocumentTotal(e.target.value)} placeholder="152340.40" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Tolerance</label>
            <div className="flex gap-2">
              <select value={toleranceType} onChange={(e) => setToleranceType(e.target.value as 'absolute' | 'percentage')} className={`${fieldCls} flex-1`}>
                <option value="absolute">Absolute ($)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
              <input type="number" value={toleranceValue} onChange={(e) => setToleranceValue(e.target.value)} className={`${fieldCls} w-20`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Expected Included Line Count</label>
            <input type="number" value={expectedIncludedCount} onChange={(e) => setExpectedIncludedCount(e.target.value)} placeholder="12" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Expected Excluded Line Count</label>
            <input type="number" value={expectedExcludedCount} onChange={(e) => setExpectedExcludedCount(e.target.value)} placeholder="2" className={fieldCls} />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Expected Excluded Phrases</h4>
        <div className="flex gap-2 mb-2">
          <input
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPhrase()}
            placeholder="e.g. Contract Total"
            className={`${fieldCls} flex-1`}
          />
          <button onClick={addPhrase} className="px-3 py-2 text-xs bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {excludedPhrases.map((p, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-950/30 border border-red-800/40 text-red-300 rounded">
              {p}
              <button onClick={() => setExcludedPhrases((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-300 ml-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {excludedPhrases.length === 0 && <span className="text-xs text-gray-700">No phrases added</span>}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Row Classification Assertions</h4>
          <button onClick={addAssertion} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
            <Plus className="w-3.5 h-3.5" />Add
          </button>
        </div>
        <div className="space-y-2">
          {classificationAssertions.map((a, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 bg-gray-800/40 rounded-lg p-3">
              <select value={a.matchType} onChange={(e) => updateAssertion(i, { matchType: e.target.value as RowClassificationAssertion['matchType'] })} className={`${fieldCls} col-span-1`}>
                <option value="phrase">Phrase</option>
                <option value="row_index">Row Index</option>
                <option value="amount_equals">Amount</option>
              </select>
              <input
                value={String(a.matchValue)}
                onChange={(e) => updateAssertion(i, { matchValue: a.matchType === 'row_index' ? parseInt(e.target.value) || 0 : a.matchType === 'amount_equals' ? parseFloat(e.target.value) || 0 : e.target.value })}
                placeholder={a.matchType === 'phrase' ? 'Match phrase...' : a.matchType === 'row_index' ? 'Row #' : 'Amount'}
                className={`${fieldCls} col-span-1`}
              />
              <select value={a.expectedClassification} onChange={(e) => updateAssertion(i, { expectedClassification: e.target.value as RowClassification })} className={`${fieldCls} col-span-1`}>
                {CLASSIFICATION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={String(a.expectedIncluded)} onChange={(e) => updateAssertion(i, { expectedIncluded: e.target.value === 'true' })} className={`${fieldCls} col-span-1`}>
                <option value="false">Excluded</option>
                <option value="true">Included</option>
              </select>
              <button onClick={() => removeAssertion(i)} className="flex items-center justify-center text-red-500 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {classificationAssertions.length === 0 && <span className="text-xs text-gray-700">No assertions added</span>}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <label className={labelCls}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Describe what this case tests..." className={`${fieldCls} resize-none`} />
      </div>

      <div className="border-t border-gray-800 pt-4">
        <button onClick={() => setShowJson((v) => !v)} className="text-xs text-gray-600 hover:text-gray-400 underline">
          {showJson ? 'Hide' : 'Show'} expected_json preview
        </button>
        {showJson && (
          <pre className="mt-2 text-[10px] bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto text-gray-400">
            {JSON.stringify(buildOutcome(), null, 2)}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={!caseLabel || !sourceId || saving}
          className="px-4 py-2 text-xs bg-amber-500 text-gray-950 font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Case'}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
