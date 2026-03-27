import { useEffect, useState } from 'react';
import { PlusCircle, MessageSquare, CheckCircle, CreditCard as Edit3, Trash2, Tag, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  getAdjudicationEvents,
  getAdjudicationNotes,
  createAdjudicationEvent,
  createAdjudicationNote,
  CORRECTION_TYPE_LABELS,
  FIELD_TYPE_LABELS,
  NOTE_TYPE_LABELS,
  ROOT_CAUSE_CATEGORIES,
  type AdjudicationEvent,
  type AdjudicationNote,
  type CorrectionType,
  type FieldType,
  type NoteType,
} from '../../../lib/shadow/phase2/adjudicationService';

interface Props {
  runId: string;
  moduleKey: string;
}

function correctionTypeBadgeClass(type: CorrectionType): string {
  if (type === 'total_correction') return 'bg-red-900/40 text-red-300 border-red-700';
  if (type === 'line_item_add') return 'bg-teal-900/40 text-teal-300 border-teal-700';
  if (type === 'line_item_remove') return 'bg-orange-900/40 text-orange-300 border-orange-700';
  if (type === 'line_item_edit') return 'bg-amber-900/40 text-amber-300 border-amber-700';
  if (type === 'classification_correction') return 'bg-blue-900/40 text-blue-300 border-blue-700';
  if (type === 'failure_override') return 'bg-gray-800 text-gray-300 border-gray-600';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function noteTypeBadgeClass(type: NoteType): string {
  if (type === 'commercial') return 'bg-teal-900/40 text-teal-300 border-teal-700';
  if (type === 'parser_observation') return 'bg-amber-900/40 text-amber-300 border-amber-700';
  if (type === 'supplier_pattern') return 'bg-blue-900/40 text-blue-300 border-blue-700';
  if (type === 'rollout_warning') return 'bg-red-900/40 text-red-300 border-red-700';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' });
}

interface AddEventFormState {
  correctionType: CorrectionType;
  fieldType: FieldType;
  rootCauseCategory: string;
  humanReason: string;
  financialImpact: string;
}

interface AddNoteFormState {
  noteType: NoteType;
  noteText: string;
}

export default function RunAdjudicationPanel({ runId, moduleKey }: Props) {
  const [events, setEvents] = useState<AdjudicationEvent[]>([]);
  const [notes, setNotes] = useState<AdjudicationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEventForm, setShowEventForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const [eventForm, setEventForm] = useState<AddEventFormState>({
    correctionType: 'total_correction',
    fieldType: 'document_total',
    rootCauseCategory: '',
    humanReason: '',
    financialImpact: '',
  });

  const [noteForm, setNoteForm] = useState<AddNoteFormState>({
    noteType: 'general',
    noteText: '',
  });

  useEffect(() => {
    load();
  }, [runId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [evts, nts] = await Promise.all([
        getAdjudicationEvents(runId),
        getAdjudicationNotes(runId),
      ]);
      setEvents(evts);
      setNotes(nts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load adjudications');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEvent() {
    setSubmittingEvent(true);
    try {
      await createAdjudicationEvent({
        runId,
        moduleKey,
        correctionType: eventForm.correctionType,
        fieldType: eventForm.fieldType,
        rootCauseCategory: eventForm.rootCauseCategory || null,
        humanReason: eventForm.humanReason || null,
        financialImpactEstimate: eventForm.financialImpact ? parseFloat(eventForm.financialImpact) : null,
      });
      setShowEventForm(false);
      setEventForm({ correctionType: 'total_correction', fieldType: 'document_total', rootCauseCategory: '', humanReason: '', financialImpact: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create correction');
    } finally {
      setSubmittingEvent(false);
    }
  }

  async function handleAddNote() {
    if (!noteForm.noteText.trim()) return;
    setSubmittingNote(true);
    try {
      await createAdjudicationNote({
        runId,
        noteType: noteForm.noteType,
        noteText: noteForm.noteText,
      });
      setShowNoteForm(false);
      setNoteForm({ noteType: 'general', noteText: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create note');
    } finally {
      setSubmittingNote(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-500 text-sm">Loading adjudication data...</div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Corrections</div>
          <div className="text-2xl font-bold text-amber-400">{events.length}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">adjudication events</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Notes</div>
          <div className="text-2xl font-bold text-blue-400">{notes.length}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">attached observations</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowEventForm(!showEventForm); setShowNoteForm(false); }}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-lg hover:bg-amber-500/20 transition-colors"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Add Correction
        </button>
        <button
          onClick={() => { setShowNoteForm(!showNoteForm); setShowEventForm(false); }}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/20 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Add Note
        </button>
      </div>

      {/* Add Correction Form */}
      {showEventForm && (
        <div className="bg-gray-900 border border-amber-500/20 rounded-xl p-4 space-y-4">
          <div className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Record Correction
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Correction Type</label>
              <select
                value={eventForm.correctionType}
                onChange={(e) => setEventForm((p) => ({ ...p, correctionType: e.target.value as CorrectionType }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                {(Object.keys(CORRECTION_TYPE_LABELS) as CorrectionType[]).map((k) => (
                  <option key={k} value={k}>{CORRECTION_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Field Type</label>
              <select
                value={eventForm.fieldType}
                onChange={(e) => setEventForm((p) => ({ ...p, fieldType: e.target.value as FieldType }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((k) => (
                  <option key={k} value={k}>{FIELD_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Root Cause Category</label>
              <select
                value={eventForm.rootCauseCategory}
                onChange={(e) => setEventForm((p) => ({ ...p, rootCauseCategory: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— select category —</option>
                {ROOT_CAUSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Financial Impact (NZD)</label>
              <input
                type="number"
                value={eventForm.financialImpact}
                onChange={(e) => setEventForm((p) => ({ ...p, financialImpact: e.target.value }))}
                placeholder="e.g. 5000"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Human Reason / Notes</label>
            <textarea
              value={eventForm.humanReason}
              onChange={(e) => setEventForm((p) => ({ ...p, humanReason: e.target.value }))}
              rows={2}
              placeholder="Describe what was wrong and why..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddEvent}
              disabled={submittingEvent}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-gray-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {submittingEvent && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Correction
            </button>
            <button onClick={() => setShowEventForm(false)} className="px-3 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Note Form */}
      {showNoteForm && (
        <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-4 space-y-4">
          <div className="text-sm font-semibold text-blue-300 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Add Observation Note
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Note Type</label>
            <select
              value={noteForm.noteType}
              onChange={(e) => setNoteForm((p) => ({ ...p, noteType: e.target.value as NoteType }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(NOTE_TYPE_LABELS) as NoteType[]).map((k) => (
                <option key={k} value={k}>{NOTE_TYPE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Note</label>
            <textarea
              value={noteForm.noteText}
              onChange={(e) => setNoteForm((p) => ({ ...p, noteText: e.target.value }))}
              rows={3}
              placeholder="Observation, pattern, or warning..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddNote}
              disabled={submittingNote || !noteForm.noteText.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-400 transition-colors disabled:opacity-50"
            >
              {submittingNote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Note
            </button>
            <button onClick={() => setShowNoteForm(false)} className="px-3 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Correction Events */}
      <div>
        <div className="text-xs font-semibold tracking-widest text-gray-600 uppercase mb-3 flex items-center gap-2">
          <Edit3 className="w-3 h-3" />
          Correction Events
        </div>
        {events.length === 0 ? (
          <div className="py-6 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
            <CheckCircle className="w-5 h-5 text-gray-700 mx-auto mb-2" />
            <div className="text-xs text-gray-600">No corrections recorded yet.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => {
              const expanded = expandedEvent === ev.id;
              return (
                <div key={ev.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedEvent(expanded ? null : ev.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
                  >
                    <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${correctionTypeBadgeClass(ev.correction_type as CorrectionType)}`}>
                      {CORRECTION_TYPE_LABELS[ev.correction_type as CorrectionType] ?? ev.correction_type}
                    </span>
                    <span className="text-xs text-gray-400">{FIELD_TYPE_LABELS[ev.field_type as FieldType] ?? ev.field_type}</span>
                    {ev.root_cause_category && (
                      <span className="text-[10px] text-gray-600 flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {ev.root_cause_category.replace(/_/g, ' ')}
                      </span>
                    )}
                    {ev.financial_impact_estimate != null && (
                      <span className="text-xs text-teal-400 ml-auto mr-2">
                        ${ev.financial_impact_estimate.toLocaleString()}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600 ml-auto">{formatDate(ev.created_at)}</span>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 space-y-2 border-t border-gray-800">
                      {ev.human_reason && (
                        <div className="pt-3">
                          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Human Reason</div>
                          <div className="text-sm text-gray-300">{ev.human_reason}</div>
                        </div>
                      )}
                      {ev.original_value_json && (
                        <div>
                          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Original Value</div>
                          <pre className="text-xs text-gray-500 bg-gray-950 rounded p-2 overflow-x-auto">
                            {JSON.stringify(ev.original_value_json, null, 2)}
                          </pre>
                        </div>
                      )}
                      {ev.corrected_value_json && (
                        <div>
                          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Corrected Value</div>
                          <pre className="text-xs text-gray-500 bg-gray-950 rounded p-2 overflow-x-auto">
                            {JSON.stringify(ev.corrected_value_json, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <div className="text-xs font-semibold tracking-widest text-gray-600 uppercase mb-3 flex items-center gap-2">
          <MessageSquare className="w-3 h-3" />
          Observation Notes
        </div>
        {notes.length === 0 ? (
          <div className="py-6 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
            <div className="text-xs text-gray-600">No notes attached yet.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${noteTypeBadgeClass(note.note_type as NoteType)}`}>
                    {NOTE_TYPE_LABELS[note.note_type as NoteType] ?? note.note_type}
                  </span>
                  <span className="text-[10px] text-gray-600 ml-auto">{formatDate(note.created_at)}</span>
                </div>
                <div className="text-sm text-gray-300">{note.note_text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
