import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { ReviewComment } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';

interface PlumbingReviewCommentsPanelProps {
  comments: ReviewComment[];
  onAddComment: (text: string) => Promise<void>;
  currentUserId?: string;
}

export default function PlumbingReviewCommentsPanel({ comments, onAddComment, currentUserId }: PlumbingReviewCommentsPanelProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(text.trim());
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-white">Internal Comments</h2>
        <span className="text-[10px] text-gray-600">{comments.length}</span>
      </div>

      <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
        {comments.length === 0 && (
          <div className="py-6 text-center text-xs text-gray-600">No comments yet</div>
        )}
        {comments.map((c) => (
          <div key={c.id} className="px-5 py-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                c.author_id === currentUserId ? 'bg-teal-700 text-white' : 'bg-gray-700 text-gray-300'
              }`}>
                {c.author_id === currentUserId ? 'Me' : c.author_id.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-[10px] text-gray-500">
                {c.author_id === currentUserId ? 'You' : `${c.author_id.slice(0, 8)}…`}
              </span>
              <span className="text-[10px] text-gray-600">{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{c.comment_text}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 border-t border-gray-800 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Add internal comment..."
          className="flex-1 text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none resize-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          {submitting ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
