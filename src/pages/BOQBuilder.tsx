import { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, RefreshCw, AlertTriangle, CheckCircle, Tag as TagIcon, FileText, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateBaselineBOQ } from '../lib/boq/boqGenerator';
import { exportBOQPack, exportTagsClarifications } from '../lib/boq/boqExporter';
import TagLibraryModal from '../components/TagLibraryModal';
import type { BOQLine, BOQTendererMap, ScopeGap, ProjectTag, ModuleKey } from '../types/boq.types';

type TabType = 'baseline' | 'mapping' | 'gaps' | 'tags';

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
  const [showTagLibrary, setShowTagLibrary] = useState(false);

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
      // Load BOQ lines
      const { data: lines } = await supabase
        .from('boq_lines')
        .select('*')
        .eq('project_id', projectId)
        .eq('module_key', moduleKey)
        .order('boq_line_id');

      setBoqLines(lines || []);

      // Load mappings
      const { data: maps } = await supabase
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

      setMappings(maps || []);

      // Load gaps
      const { data: gapsData } = await supabase
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

      setGaps(gapsData || []);

      // Load tags
      const { data: tagsData } = await supabase
        .from('project_tags')
        .select('*')
        .eq('project_id', projectId)
        .eq('module_key', moduleKey)
        .order('tag_id');

      setTags(tagsData || []);

      // Load tenderers
      const { data: quotes } = await supabase
        .from('quotes')
        .select(`
          id,
          supplier_id,
          suppliers (
            id,
            name
          )
        `)
        .eq('project_id', projectId)
        .eq('trade', moduleKey);

      const uniqueTenderers = quotes?.map(q => ({
        id: q.supplier_id,
        name: (q.suppliers as any)?.name || 'Unknown'
      })).filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i) || [];

      setTenderers(uniqueTenderers);
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
    } catch (error) {
      console.error('Error exporting BOQ:', error);
      alert('Failed to export BOQ');
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
                {tenderers.length} tenderers • {boqLines.length} BOQ lines • {openGapsCount}/{totalGaps} gaps open
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
                {openGapsCount}
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
  return (
    <div className="space-y-4">
      {tenderers.map(tenderer => {
        const tendererMappings = mappings.filter(m => m.tenderer_id === tenderer.id);
        const included = tendererMappings.filter(m => m.included_status === 'included').length;
        const missing = tendererMappings.filter(m => m.included_status === 'missing').length;

        return (
          <div key={tenderer.id} className="bg-slate-800 rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{tenderer.name}</h3>
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
