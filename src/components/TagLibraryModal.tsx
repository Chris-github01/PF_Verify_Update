import { useState, useEffect } from 'react';
import { X, Plus, Search, Tag as TagIcon, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TagLibrary, ProjectTag, TagCategory, ModuleKey } from '../types/boq.types';

interface TagLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  moduleKey: ModuleKey;
  onTagsAdded: () => void;
}

const CATEGORIES: { value: TagCategory; label: string }[] = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'technical', label: 'Technical' },
  { value: 'programme', label: 'Programme' },
  { value: 'qa', label: 'QA' },
  { value: 'hse', label: 'HSE' },
  { value: 'access', label: 'Access' },
  { value: 'design', label: 'Design' }
];

export default function TagLibraryModal({
  isOpen,
  onClose,
  projectId,
  moduleKey,
  onTagsAdded
}: TagLibraryModalProps) {
  const [libraryTags, setLibraryTags] = useState<TagLibrary[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TagCategory | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLibraryTags();
    }
  }, [isOpen, moduleKey]);

  const loadLibraryTags = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tag_library')
        .select('*')
        .or(`module_key.eq.${moduleKey},module_key.eq.all`)
        .order('category', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      setLibraryTags(data || []);
    } catch (error) {
      console.error('Error loading tag library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSelectedTags = async () => {
    if (selectedTags.size === 0) return;

    setLoading(true);
    try {
      // Get next tag ID
      const { data: existingTags } = await supabase
        .from('project_tags')
        .select('tag_id')
        .eq('project_id', projectId)
        .eq('module_key', moduleKey)
        .order('tag_id', { ascending: false })
        .limit(1);

      let nextTagNumber = 1;
      if (existingTags && existingTags.length > 0) {
        const lastId = existingTags[0].tag_id;
        const match = lastId.match(/TAG-(\d+)/);
        if (match) {
          nextTagNumber = parseInt(match[1]) + 1;
        }
      }

      // Create project tags from library
      const tagsToInsert = Array.from(selectedTags).map((tagId, index) => {
        const libraryTag = libraryTags.find(t => t.id === tagId);
        if (!libraryTag) return null;

        const newTagId = `TAG-${String(nextTagNumber + index).padStart(4, '0')}`;

        return {
          project_id: projectId,
          module_key: moduleKey,
          tag_id: newTagId,
          category: libraryTag.category,
          title: libraryTag.title,
          statement: libraryTag.statement,
          risk_if_not_agreed: libraryTag.risk_if_not_agreed,
          default_position: libraryTag.default_position,
          cost_impact_type: libraryTag.cost_impact_type,
          estimate_allowance: libraryTag.estimate_allowance,
          evidence_ref: libraryTag.evidence_ref,
          agreement_status: 'proposed'
        };
      }).filter(Boolean);

      const { error } = await supabase
        .from('project_tags')
        .insert(tagsToInsert);

      if (error) throw error;

      onTagsAdded();
      setSelectedTags(new Set());
      onClose();
    } catch (error) {
      console.error('Error adding tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTags = libraryTags.filter(tag => {
    const matchesSearch = !searchQuery ||
      tag.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tag.statement.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || tag.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const toggleTag = (tagId: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tagId)) {
      newSelected.delete(tagId);
    } else {
      newSelected.add(tagId);
    }
    setSelectedTags(newSelected);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <TagIcon className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Tag Library</h2>
              <p className="text-sm text-slate-400">Add standard tags to your project</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-4 border-b border-slate-700 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tags..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tags List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="text-center py-12">
              <TagIcon className="mx-auto text-slate-600 mb-3" size={48} />
              <p className="text-slate-400">No tags found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTags.map(tag => (
                <div
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedTags.has(tag.id)
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTags.has(tag.id)}
                      onChange={() => {}}
                      className="mt-1 w-5 h-5 rounded border-slate-600 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="font-semibold text-white mb-1">{tag.title}</h3>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                              {tag.category}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                              {tag.default_position?.toUpperCase() || 'N/A'}
                            </span>
                            {tag.estimate_allowance && (
                              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1">
                                <DollarSign size={12} />
                                {tag.estimate_allowance.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-slate-300 mb-2">{tag.statement}</p>
                      {tag.risk_if_not_agreed && (
                        <p className="text-xs text-orange-400 italic">
                          Risk: {tag.risk_if_not_agreed}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            {selectedTags.size} tag{selectedTags.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSelectedTags}
              disabled={selectedTags.size === 0 || loading}
              className="px-6 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
            >
              Add Selected Tags
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
