import { useState } from 'react';
import { Save, AlertTriangle, RefreshCw } from 'lucide-react';
import { dbCreateRuleVersion, getDefaultRuleVersionConfig } from '../../../lib/db/learningDb';
import type { RuleVersionRecord } from '../../../lib/modules/parsers/plumbing/learning/learningTypes';
import { applyProposedRuleToConfig } from '../../../lib/modules/parsers/plumbing/learning/analyzeRuleImpact';

interface PlumbingRuleEditorProps {
  baseVersion?: RuleVersionRecord | null;
  suggestedRuleJson?: Record<string, unknown>;
  sourceSuggestionIds?: string[];
  onVersionCreated: (version: RuleVersionRecord) => void;
}

export default function PlumbingRuleEditor({
  baseVersion,
  suggestedRuleJson,
  sourceSuggestionIds = [],
  onVersionCreated,
}: PlumbingRuleEditorProps) {
  const baseRules = baseVersion?.rules_json ?? getDefaultRuleVersionConfig();
  const initialRules = suggestedRuleJson
    ? applyProposedRuleToConfig(baseRules, suggestedRuleJson as Parameters<typeof applyProposedRuleToConfig>[1])
    : baseRules;

  const [rawJson, setRawJson] = useState(() => JSON.stringify(initialRules, null, 2));
  const [versionLabel, setVersionLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleJsonChange(v: string) {
    setRawJson(v);
    try {
      JSON.parse(v);
      setParseError(null);
    } catch (e) {
      setParseError(String(e));
    }
  }

  function resetToBase() {
    setRawJson(JSON.stringify(baseRules, null, 2));
    setParseError(null);
  }

  async function handleSave() {
    if (parseError) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return;
    }

    if (!versionLabel.trim()) {
      setParseError('Version label is required');
      return;
    }

    setBusy(true);
    try {
      const version = `v-${Date.now()}`;
      const record = await dbCreateRuleVersion({
        version,
        label: versionLabel.trim(),
        rules: parsed,
        parentVersionId: baseVersion?.id,
        sourceSuggestionIds,
        notes: notes.trim() || undefined,
      });
      onVersionCreated(record);
      setVersionLabel('');
      setNotes('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Rule Editor</h2>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Edit rule config JSON and save as a new version. Will not affect live parser.
          {baseVersion && <span className="ml-1">Based on: <code className="text-cyan-400">{baseVersion.version}</code></span>}
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Version label *</label>
            <input
              type="text"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. Add GST phrase variants"
              className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brief description of changes..."
              className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-gray-500">rules_json</label>
            <button
              onClick={resetToBase}
              className="text-[10px] text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Reset to base
            </button>
          </div>
          <textarea
            value={rawJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={18}
            className={`w-full text-[10px] font-mono bg-gray-800 border ${parseError ? 'border-red-500/50' : 'border-gray-700'} text-gray-200 px-3 py-2.5 rounded-lg focus:outline-none resize-y`}
          />
        </div>

        {parseError && (
          <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
            {parseError}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-600">
            Saving creates a new version. Shadow parser must be manually pointed at this version.
          </p>
          <button
            onClick={handleSave}
            disabled={!!parseError || !versionLabel.trim() || busy}
            className="flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {busy ? 'Saving...' : 'Save as new version'}
          </button>
        </div>
      </div>
    </div>
  );
}
