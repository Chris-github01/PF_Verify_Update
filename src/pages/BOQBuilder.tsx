import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, RefreshCw, AlertTriangle, CheckCircle, Tag as TagIcon, FileText, ChevronRight, ChevronDown, Flame } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateBaselineBOQ } from '../lib/boq/boqGenerator';
import { exportBOQPack, exportTagsClarifications } from '../lib/boq/boqExporter';
import TagLibraryModal from '../components/TagLibraryModal';
import FireScheduleImport from '../components/FireScheduleImport';
import type { BOQLine, BOQTendererMap, ScopeGap, ProjectTag, ModuleKey } from '../types/boq.types';

type TabType = 'baseline' | 'mapping' | 'gaps' | 'tags' | 'fire-schedule';

interface BOQBuilderProps {
  projectId?: string;
}

export default function BOQBuilder({ projectId }: BOQBuilderProps = {}) {

  const [project, setProject] = useState<any>(null);
  const [moduleKey, setModuleKey] = useState<ModuleKey>('passive_fire');
  const [activeTab, setActiveTab] = useState<TabType>('baseline');

  const [boqLines, setBoqLines] = useState<BOQLine[]>([]);
  const [mappings, setMappings] = useState<BOQTendererMap[]>([]);
  const [gaps, setGaps] = useState<ScopeGap[]>([]);
  const [tags, setTags] = useState<ProjectTag[]>([]);
  const [tenderers, setTenderers] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showTagLibrary, setShowTagLibrary] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const [generationResult, setGenerationResult] = useState<any>(null);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    if (project) {
      loadBOQData();
    }
  }, [project, moduleKey]);

  const loadProject = async () => {
    if (!projectId) return;

    const { data, error } = await supabase
      .from('projects')
      .select('*, organisations(name)')
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('Error loading project:', error);
      return;
    }

    setProject(data);
    setModuleKey((data.trade as ModuleKey) || 'passive_fire');
  };

  const loadBOQData = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      console.log('=== Loading BOQ Data ===');
      console.log('Project ID:', projectId);
      console.log('Module Key:', moduleKey);

      // Load BOQ lines
      const { data: lines, error: linesError } = await supabase
        .from('boq_lines')
        .select('*')
        .eq('project_id', projectId)
        .eq('module_key', moduleKey)
        .order('boq_line_id');

      if (linesError) {
        console.error('Error loading BOQ lines:', linesError);
      } else {
        console.log('✓ BOQ Lines loaded:', lines?.length || 0);
      }

      setBoqLines(lines || []);

      // Load mappings
      const { data: maps, error: mapsError } = await supabase
        .from('boq_tenderer_map')
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `)
        .eq('project_id', projectId)
        .eq('module_key', moduleKey);

      if (mapsError) {
        console.error('Error loading mappings:', mapsError);
      } else {
        console.log('✓ Tenderer Mappings loaded:', maps?.length || 0);
        if (maps && maps.length > 0) {
          console.log('Sample mapping:', maps[0]);
        }
      }

      setMappings(maps || []);

      // Load gaps
      const { data: gapsData, error: gapsError } = await supabase
        .from('scope_gaps')
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `)
        .eq('project_id', projectId)
        .eq('module_key', moduleKey)
        .order('gap_id');

      if (gapsError) {
        console.error('Error loading gaps:', gapsError);
      } else {
        console.log('✓ Scope Gaps loaded:', gapsData?.length || 0);
      }

      setGaps(gapsData || []);

      // Load tags
      const { data: tagsData, error: tagsError } = await supabase
        .from('project_tags')
        .select('*')
        .eq('project_id', projectId)
        .eq('module_key', moduleKey)
        .order('tag_id');

      if (tagsError) {
        console.error('Error loading tags:', tagsError);
      } else {
        console.log('✓ Project Tags loaded:', tagsData?.length || 0);
      }

      setTags(tagsData || []);

      // Load tenderers - try with trade filter first, then without
      let quotesResult = await supabase
        .from('quotes')
        .select(`
          id,
          supplier_id,
          supplier_name,
          suppliers (
            id,
            name
          )
        `)
        .eq('project_id', projectId)
        .eq('trade', moduleKey);

      let quotes = quotesResult.data;

      // Fallback: if no quotes with trade filter, try without
      if (!quotes || quotes.length === 0) {
        const fallbackResult = await supabase
          .from('quotes')
          .select(`
            id,
            supplier_id,
            supplier_name,
            suppliers (
              id,
              name
            )
          `)
          .eq('project_id', projectId);
        quotes = fallbackResult.data;
      }

      const uniqueTenderers = quotes?.map(q => ({
        id: q.supplier_id,
        name: (q.suppliers as any)?.name || (q as any).supplier_name || 'Unknown'
      })).filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i) || [];

      console.log('✓ Tenderers loaded:', uniqueTenderers.length);
      console.log('Tenderers:', uniqueTenderers.map(t => t.name).join(', '));

      setTenderers(uniqueTenderers);

      console.log('=== BOQ Data Load Complete ===');
    } catch (error) {
      console.error('Error loading BOQ data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBOQ = async () => {
    if (!projectId) return;

    setGenerating(true);
    try {
      const result = await generateBaselineBOQ(projectId, moduleKey);
      setGenerationResult(result);
      await loadBOQData();
    } catch (error) {
      console.error('Error generating BOQ:', error);
      alert('Failed to generate BOQ. Please ensure quotes have been imported.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportBOQ = async (exportType: 'baseline' | 'awarded') => {
    if (!projectId) return;

    setExporting(true);
    try {
      const blob = await exportBOQPack({
        project_id: projectId,
        module_key: moduleKey,
        export_type: exportType === 'baseline' ? 'baseline_boq' : 'awarded_boq',
        tenderer_ids: tenderers.map(t => t.id),
        awarded_supplier_id: project?.approved_supplier_id,
        include_gaps: true,
        include_tags: true
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BOQ_PACK_${project?.name}_${moduleKey}_${new Date().toISOString().split('T')[0]}_v1.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error exporting BOQ:', error);
      alert(`Failed to export BOQ: ${error?.message || error}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportTags = async () => {
    if (!projectId) return;

    setExporting(true);
    try {
      const blob = await exportTagsClarifications(projectId, moduleKey);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TAGS_CLARIFICATIONS_${project?.name}_${moduleKey}_${new Date().toISOString().split('T')[0]}_v1.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting tags:', error);
      alert('Failed to export tags');
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerateBOQ = async () => {
    if (!projectId) {
      alert('No project ID found. Please refresh the page and try again.');
      return;
    }

    setRegenerating(true);
    setShowRegenerateConfirm(false);

    try {
      console.log('Starting BOQ regeneration for project:', projectId, 'module:', moduleKey);

      // Step 1: Delete all existing BOQ data for this project and module
      // Note: Deleting boq_lines will cascade to boq_tenderer_map and scope_gaps due to ON DELETE CASCADE
      console.log('Step 1: Deleting BOQ lines...');
      const { error: deleteBoqError } = await supabase
        .from('boq_lines')
        .delete()
        .eq('project_id', projectId)
        .eq('module_key', moduleKey);

      if (deleteBoqError) {
        console.error('Error deleting BOQ lines:', deleteBoqError);
        throw new Error(`Failed to delete BOQ lines: ${deleteBoqError.message}`);
      }

      // Step 2: Delete project tags
      console.log('Step 2: Deleting project tags...');
      const { error: deleteTagsError } = await supabase
        .from('project_tags')
        .delete()
        .eq('project_id', projectId)
        .eq('module_key', moduleKey);

      if (deleteTagsError) {
        console.error('Error deleting tags:', deleteTagsError);
        throw new Error(`Failed to delete tags: ${deleteTagsError.message}`);
      }

      // Step 3: Reset project BOQ completion flags
      console.log('Step 3: Resetting project flags...');
      const { error: updateProjectError } = await supabase
        .from('projects')
        .update({
          boq_builder_completed: false,
          boq_builder_completed_at: null
        })
        .eq('id', projectId);

      if (updateProjectError) {
        console.error('Error updating project:', updateProjectError);
        throw new Error(`Failed to reset project flags: ${updateProjectError.message}`);
      }

      // Step 4: Clear local state
      console.log('Step 4: Clearing local state...');
      setBoqLines([]);
      setMappings([]);
      setGaps([]);
      setTags([]);
      setGenerationResult(null);

      // Step 5: Regenerate BOQ from existing quotes
      console.log('Step 5: Regenerating BOQ...');
      const result = await generateBaselineBOQ(projectId, moduleKey);
      console.log('BOQ generation result:', result);
      setGenerationResult(result);

      // Step 6: Reload all data
      console.log('Step 6: Reloading data...');
      await loadBOQData();

      // Success notification
      console.log('Regeneration complete!');
      alert(`BOQ regenerated successfully!\n\n${result.lines_created} lines created\n${result.mappings_created} mappings created\n${result.gaps_detected} gaps detected`);
    } catch (error: any) {
      console.error('Error regenerating BOQ:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      alert(`Failed to regenerate BOQ:\n\n${errorMessage}\n\nPlease check the browser console for more details.`);
    } finally {
      setRegenerating(false);
    }
  };

  // Count unique BOQ lines with gaps (not total gap records)
  const uniqueBOQLinesWithGaps = new Set(gaps.map(g => g.boq_line_id)).size;
  const openGapsCount = gaps.filter(g => g.status === 'open').length;
  const totalGaps = gaps.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                <span>{project?.organisations?.name}</span>
                <ChevronRight size={16} />
                <span>{project?.name}</span>
                <ChevronRight size={16} />
                <span className="text-orange-400">BOQ Builder</span>
              </div>
              <h1 className="text-2xl font-bold text-white">BOQ Builder (Normalised Scope)</h1>
              <p className="text-slate-400 text-sm mt-1">
                {tenderers.length} tenderers • {boqLines.length} BOQ lines • {uniqueBOQLinesWithGaps > 0 ? `${uniqueBOQLinesWithGaps} lines with gaps` : 'No gaps detected'}
              </p>
            </div>

            <div className="flex gap-3">
              {boqLines.length === 0 ? (
                <button
                  onClick={handleGenerateBOQ}
                  disabled={generating}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 shadow-lg"
                >
                  {generating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={20} />
                      Generate Baseline BOQ
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowRegenerateConfirm(true)}
                    disabled={regenerating}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
                    title="Delete current BOQ and regenerate from quotes"
                  >
                    <RefreshCw size={18} />
                    Regenerate BOQ Builder
                  </button>
                  <button
                    onClick={() => handleExportBOQ('baseline')}
                    disabled={exporting}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
                  >
                    <Download size={18} />
                    Export BOQ Baseline
                  </button>
                  <button
                    onClick={handleExportTags}
                    disabled={exporting}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
                  >
                    <FileText size={18} />
                    Export Tags
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Generation Result Banner */}
      {generationResult && (
        <div className="bg-green-500/10 border-b border-green-500/20">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle size={20} />
              <span className="font-medium">
                BOQ Generated Successfully: {generationResult.lines_created} lines, {generationResult.mappings_created} mappings, {generationResult.gaps_detected} gaps detected
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('baseline')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'baseline'
                  ? 'text-orange-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Baseline BOQ Lines
              <span className="ml-2 px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                {boqLines.length}
              </span>
              {activeTab === 'baseline' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('mapping')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'mapping'
                  ? 'text-orange-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tenderer Mapping
              <span className="ml-2 px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                {mappings.length}
              </span>
              {activeTab === 'mapping' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('gaps')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'gaps'
                  ? 'text-orange-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Scope Gaps Register
              <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                {uniqueBOQLinesWithGaps}
              </span>
              {activeTab === 'gaps' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('tags')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'tags'
                  ? 'text-orange-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tags & Clarifications
              <span className="ml-2 px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                {tags.length}
              </span>
              {activeTab === 'tags' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
            {moduleKey === 'passive_fire' && (
              <button
                onClick={() => setActiveTab('fire-schedule')}
                className={`px-6 py-3 font-medium transition-colors relative ${
                  activeTab === 'fire-schedule'
                    ? 'text-orange-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Flame size={18} />
                  Fire Engineer Schedule
                </span>
                {project?.fire_schedule_imported && (
                  <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                    ✓
                  </span>
                )}
                {activeTab === 'fire-schedule' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : boqLines.length === 0 ? (
          <div className="text-center py-12">
            <FileSpreadsheet className="mx-auto text-slate-600 mb-4" size={64} />
            <h3 className="text-xl font-semibold text-white mb-2">No BOQ Generated Yet</h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Generate the baseline BOQ to normalize tender scope, expose missing scope, and create a comprehensive Bill of Quantities.
            </p>
            <button
              onClick={handleGenerateBOQ}
              disabled={generating}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw size={20} />
                  Generate Baseline BOQ
                </>
              )}
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'baseline' && (
              <BaselineBOQPanel lines={boqLines} tenderers={tenderers} mappings={mappings} />
            )}
            {activeTab === 'mapping' && (
              <TendererMappingPanel lines={boqLines} tenderers={tenderers} mappings={mappings} />
            )}
            {activeTab === 'gaps' && (
              <ScopeGapsPanel gaps={gaps} lines={boqLines} onRefresh={loadBOQData} />
            )}
            {activeTab === 'tags' && (
              <TagsPanel
                tags={tags}
                onAddTags={() => setShowTagLibrary(true)}
                onRefresh={loadBOQData}
                onExport={handleExportTags}
              />
            )}
            {activeTab === 'fire-schedule' && moduleKey === 'passive_fire' && (
              <FireScheduleImport
                projectId={projectId || ''}
                moduleKey={moduleKey}
                onImportComplete={(result) => {
                  console.log('Fire schedule imported:', result);
                  loadProject();
                }}
              />
            )}
          </>
        )}
      </div>

      <TagLibraryModal
        isOpen={showTagLibrary}
        onClose={() => setShowTagLibrary(false)}
        projectId={projectId || ''}
        moduleKey={moduleKey}
        onTagsAdded={loadBOQData}
      />

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full border border-slate-700">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle className="text-red-400" size={24} />
                </div>
                <h2 className="text-xl font-bold text-white">Regenerate BOQ Builder</h2>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-slate-300">
                This will <span className="font-semibold text-red-400">permanently delete</span> all current BOQ data and regenerate from scratch:
              </p>

              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-red-400 rounded-full" />
                  <span className="text-slate-300"><span className="font-semibold text-white">{boqLines.length}</span> BOQ baseline lines</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-red-400 rounded-full" />
                  <span className="text-slate-300"><span className="font-semibold text-white">{mappings.length}</span> tenderer mappings</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-red-400 rounded-full" />
                  <span className="text-slate-300"><span className="font-semibold text-white">{gaps.length}</span> scope gaps</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-red-400 rounded-full" />
                  <span className="text-slate-300"><span className="font-semibold text-white">{tags.length}</span> project tags & clarifications</span>
                </div>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                <p className="text-orange-300 text-sm">
                  <span className="font-semibold">Note:</span> All manual edits, custom tags, and gap closure evidence will be lost. The BOQ will be regenerated from the original quote data.
                </p>
              </div>

              <p className="text-slate-300 text-sm">
                Are you sure you want to continue?
              </p>
            </div>

            <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateBOQ}
                disabled={regenerating}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {regenerating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    Yes, Regenerate BOQ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BaselineBOQPanel({ lines, tenderers, mappings }: { lines: BOQLine[]; tenderers: any[]; mappings: BOQTendererMap[] }) {
  return (
    <div className="bg-slate-800 rounded-lg shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">BOQ Line ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">System</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Qty</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">FRR</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Tenderer Coverage</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const lineMappings = mappings.filter(m => m.boq_line_id === line.id);
              const includedCount = lineMappings.filter(m => m.included_status === 'included').length;

              return (
                <tr key={line.id} className={index % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/50'}>
                  <td className="px-4 py-3 text-sm text-white font-mono">{line.boq_line_id}</td>
                  <td className="px-4 py-3 text-sm text-white">{line.system_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{line.location_zone || '-'}</td>
                  <td className="px-4 py-3 text-sm text-white">{line.quantity}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{line.unit}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{line.frr_rating || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-white">{includedCount}/{tenderers.length}</div>
                      {includedCount === tenderers.length ? (
                        <CheckCircle className="text-green-400" size={16} />
                      ) : (
                        <AlertTriangle className="text-orange-400" size={16} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TendererMappingPanel({ lines, tenderers, mappings }: { lines: BOQLine[]; tenderers: any[]; mappings: BOQTendererMap[] }) {
  const [expandedTenderers, setExpandedTenderers] = React.useState<Set<string>>(new Set(tenderers.map(t => t.id)));

  const toggleTenderer = (tendererId: string) => {
    const newExpanded = new Set(expandedTenderers);
    if (newExpanded.has(tendererId)) {
      newExpanded.delete(tendererId);
    } else {
      newExpanded.add(tendererId);
    }
    setExpandedTenderers(newExpanded);
  };

  return (
    <div className="space-y-4">
      {tenderers.map(tenderer => {
        const tendererMappings = mappings.filter(m => m.tenderer_id === tenderer.id);
        const included = tendererMappings.filter(m => m.included_status === 'included').length;
        const missing = tendererMappings.filter(m => m.included_status === 'missing').length;
        const isExpanded = expandedTenderers.has(tenderer.id);

        return (
          <div key={tenderer.id} className="bg-slate-800 rounded-lg shadow-xl overflow-hidden">
            <div
              className="p-6 cursor-pointer hover:bg-slate-750 transition-colors"
              onClick={() => toggleTenderer(tenderer.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                  <h3 className="text-lg font-semibold text-white">{tenderer.name}</h3>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-green-400">
                    <CheckCircle size={16} className="inline mr-1" />
                    {included} included
                  </div>
                  <div className="text-red-400">
                    <AlertTriangle size={16} className="inline mr-1" />
                    {missing} missing
                  </div>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-700">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-slate-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">BOQ Line</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">System Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Location</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Baseline Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Tenderer Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Variance</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tendererMappings.map((mapping, index) => {
                        const boqLine = lines.find(l => l.id === mapping.boq_line_id);
                        if (!boqLine) return null;

                        const baselineQty = parseFloat(boqLine.quantity?.toString() || '0');
                        const tendererQty = parseFloat(mapping.tenderer_qty?.toString() || '0');
                        const variance = tendererQty - baselineQty;
                        const variancePercent = baselineQty > 0 ? ((variance / baselineQty) * 100) : 0;

                        return (
                          <tr
                            key={mapping.id}
                            className={`border-b border-slate-700/50 ${index % 2 === 0 ? 'bg-slate-800/50' : 'bg-slate-800/30'}`}
                          >
                            <td className="px-4 py-3 text-sm text-white font-mono">{boqLine.boq_line_id}</td>
                            <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate" title={boqLine.system_name}>
                              {boqLine.system_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-400">{boqLine.location_zone || '-'}</td>
                            <td className="px-4 py-3 text-sm text-white text-right font-medium">{baselineQty.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-white text-right font-medium">{tendererQty.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              {variance !== 0 ? (
                                <div className="flex items-center justify-end gap-2">
                                  <span className={variance > 0 ? 'text-green-400' : 'text-red-400'}>
                                    {variance > 0 ? '+' : ''}{variance.toLocaleString()}
                                  </span>
                                  <span className={`text-xs ${variance > 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                                    ({variancePercent > 0 ? '+' : ''}{variancePercent.toFixed(1)}%)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {mapping.included_status === 'included' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                                  <CheckCircle size={14} />
                                  Included
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                                  <AlertTriangle size={14} />
                                  Missing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScopeGapsPanel({ gaps, lines, onRefresh }: { gaps: ScopeGap[]; lines: BOQLine[]; onRefresh: () => void }) {
  const openGaps = gaps.filter(g => g.status === 'open');

  return (
    <div className="bg-slate-800 rounded-lg shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-red-900/20 border-b border-red-500/20">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Gap ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Treatment</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {openGaps.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No open scope gaps
                </td>
              </tr>
            ) : (
              openGaps.map((gap, index) => (
                <tr key={gap.id} className={index % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/50'}>
                  <td className="px-4 py-3 text-sm text-white font-mono">{gap.gap_id}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                      {gap.gap_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{gap.description}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{gap.commercial_treatment || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded ${
                      gap.status === 'open'
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {gap.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TagsPanel({ tags, onAddTags, onRefresh, onExport }: { tags: ProjectTag[]; onAddTags: () => void; onRefresh: () => void; onExport: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-white">Project Tags & Clarifications</h3>
          <p className="text-sm text-slate-400">Manage contract clarifications and commercial tags</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onExport}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
          >
            <Download size={18} />
            Export Tags
          </button>
          <button
            onClick={onAddTags}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center gap-2"
          >
            <TagIcon size={18} />
            Add from Library
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg shadow-xl divide-y divide-slate-700">
        {tags.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No tags added yet. Add tags from the library to get started.
          </div>
        ) : (
          tags.map(tag => (
            <div key={tag.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono text-slate-400">{tag.tag_id}</span>
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                      {tag.category}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                      {tag.default_position}
                    </span>
                  </div>
                  <h4 className="font-semibold text-white">{tag.title}</h4>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  tag.agreement_status === 'accepted'
                    ? 'bg-green-500/20 text-green-400'
                    : tag.agreement_status === 'rejected'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-orange-500/20 text-orange-400'
                }`}>
                  {tag.agreement_status}
                </span>
              </div>
              <p className="text-sm text-slate-300 mb-2">{tag.statement}</p>
              {tag.risk_if_not_agreed && (
                <p className="text-xs text-orange-400 italic">Risk: {tag.risk_if_not_agreed}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
