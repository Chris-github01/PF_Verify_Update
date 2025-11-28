import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowRight } from 'lucide-react';

type SecondaryTab = string;

interface SearchResult {
  id: SecondaryTab;
  title: string;
  description: string;
  category: string;
}

const searchableItems: SearchResult[] = [
  { id: 'dashboard', title: 'Project Dashboard', description: 'View project overview', category: 'Project' },
  { id: 'projectsettings', title: 'Project Settings', description: 'Configure project settings', category: 'Project' },
  { id: 'importquotes', title: 'Import Quotes', description: 'Upload PDF, Excel, or CSV supplier quotes', category: 'Import' },
  { id: 'importboq', title: 'Import Excel BOQ', description: 'Multi-supplier BOQ with auto-detection', category: 'Import' },
  { id: 'review', title: 'Review & Clean', description: 'Normalize and validate imported data', category: 'Import' },
  { id: 'scope', title: 'Scope Matrix', description: 'Side-by-side scope comparison', category: 'Analysis' },
  { id: 'equalisation', title: 'Equalisation', description: 'Adjust quotes to common scope', category: 'Analysis' },
  { id: 'tradeanalysis', title: 'Trade Analysis', description: 'Compare suppliers line-by-line', category: 'Analysis' },
  { id: 'quoteintel', title: 'Quote Intelligence', description: 'AI-powered insights and anomalies', category: 'Analysis' },
  { id: 'basetracker', title: 'Base Tracker', description: 'Track awarded contract baseline', category: 'Analysis' },
  { id: 'claimsvariations', title: 'Claims & Variations', description: 'Manage changes and claims', category: 'Analysis' },
  { id: 'award', title: 'Award Report', description: 'Generate final award documentation', category: 'Reports' },
  { id: 'insights', title: 'Insights Dashboard', description: 'Analytics and project metrics', category: 'Reports' },
  { id: 'exports', title: 'Exports', description: 'Download reports in Excel/PDF', category: 'Reports' },
];

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: SecondaryTab) => void;
}

export default function GlobalSearch({ isOpen, onClose, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.trim()
    ? searchableItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      )
    : searchableItems;

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  const handleSelect = (tab: SecondaryTab) => {
    onNavigate(tab);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <Search className="text-gray-400" size={20} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="Search features, pages, or actions..."
                  className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-lg"
                />
                <button
                  onClick={onClose}
                  className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {results.length > 0 ? (
                  <div className="p-2">
                    {results.map((result, index) => (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result.id)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`
                          w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all
                          ${
                            index === selectedIndex
                              ? 'bg-cyan-500/20 border border-cyan-500/50'
                              : 'hover:bg-white/5'
                          }
                        `}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">
                              {result.title}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-white/10 text-gray-300 rounded">
                              {result.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 mt-1">
                            {result.description}
                          </p>
                        </div>
                        <ArrowRight
                          className={`${index === selectedIndex ? 'text-cyan-400' : 'text-gray-600'}`}
                          size={16}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    No results found for "{query}"
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">↑</kbd>
                    <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">Enter</kbd>
                    Select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">Esc</kbd>
                    Close
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
