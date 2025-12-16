import { useState, useEffect } from 'react';
import { Download, Upload, Trash2, Settings as SettingsIcon, FileText, Globe, Sparkles, Save, Database, RefreshCw, AlertTriangle, LogOut, BookTemplate, ShieldCheck, Shield, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getModelRateProvider } from '../lib/modelRate/modelRateProvider';
import { saveProjectSnapshot, loadProjectSnapshot, listProjectSnapshots, deleteProjectSnapshot } from '../lib/snapshot/snapshotManager';
import { checkForLegacyData, migrateLegacyData } from '../lib/migration/legacyDataMigration';
import type { ModelRateSource, CSVModelRate} from '../types/modelRate.types';
import type { ProjectSnapshot } from '../types/snapshot.types';
import * as XLSX from 'xlsx';
import ThresholdsDropdowns from '../components/ThresholdsDropdowns';
import { t } from '../i18n';
import SystemCheck from './SystemCheck';
import CopilotAudit from './CopilotAudit';
import { checkExtractorHealth } from '../lib/api/pdfExtractor';

interface SettingsProps {
  projectId: string;
  onProjectDeleted: () => void;
  onNavigateToMatrix?: () => void;
}

export default function Settings({ projectId, onProjectDeleted, onNavigateToMatrix }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'project' | 'systemcheck' | 'copilotaudit'>('project');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [modelRateSource, setModelRateSource] = useState<ModelRateSource>('api');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [csvData, setCsvData] = useState<CSVModelRate[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingCSV, setIsUploadingCSV] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [hasLegacyData, setHasLegacyData] = useState(false);
  const [showSplashOnLoad, setShowSplashOnLoad] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState('');
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotClient, setSnapshotClient] = useState('');
  const [extractorHealthStatus, setExtractorHealthStatus] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const provider = getModelRateProvider(projectId);

  useEffect(() => {
    loadSettings();
    loadSnapshotList();
    loadUserPreferences();
    setHasLegacyData(checkForLegacyData());
  }, [projectId]);

  const loadSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const settings = await provider.loadSettings();
      if (settings) {
        setModelRateSource(settings.model_rate_source);
        setApiBaseUrl(settings.api_base_url);
        if (settings.csv_data) {
          setCsvData(settings.csv_data as CSVModelRate[]);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    setIsLoadingSettings(false);
  };

  const loadUserPreferences = async () => {
    try {
      const { data } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();

      if (data && data.preferences) {
        const showSplash = data.preferences.show_splash_on_load ?? true;
        setShowSplashOnLoad(showSplash);
        localStorage.setItem('showSplashOnLoad', String(showSplash));
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  const handleCheckExtractorHealth = async () => {
    setCheckingHealth(true);
    setExtractorHealthStatus(null);

    try {
      const result = await checkExtractorHealth();
      setExtractorHealthStatus(`✓ Healthy - ${result.status || 'OK'}${result.message ? `: ${result.message}` : ''}`);
      setMessage({ type: 'success', text: 'PDF Extractor API is healthy and responding' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setExtractorHealthStatus(`✗ Failed - ${errorMsg}`);
      setMessage({ type: 'error', text: `PDF Extractor health check failed: ${errorMsg}` });
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleToggleSplashScreen = async (enabled: boolean) => {
    try {
      const { data: existingData } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();

      const updatedPreferences = {
        ...(existingData?.preferences || {}),
        show_splash_on_load: enabled
      };

      const { error } = await supabase
        .from('user_preferences')
        .update({ preferences: updatedPreferences })
        .eq('id', '00000000-0000-0000-0000-000000000001');

      if (error) throw error;

      setShowSplashOnLoad(enabled);
      localStorage.setItem('showSplashOnLoad', String(enabled));
      setMessage({
        type: 'success',
        text: `Splash screen will ${enabled ? 'show' : 'not show'} on every load`
      });
    } catch (error) {
      console.error('Error updating splash preference:', error);
      setMessage({ type: 'error', text: 'Failed to update splash screen preference' });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setMessage(null);

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      const { data: quotes } = await supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId);

      const quoteIds = quotes?.map(q => q.id) || [];

      const { data: items } = await supabase
        .from('quote_items')
        .select('*')
        .in('quote_id', quoteIds);

      const { data: categories } = await supabase
        .from('scope_categories')
        .select('*')
        .eq('project_id', projectId);

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        project,
        quotes: quotes || [],
        quote_items: items || [],
        scope_categories: categories || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `passivefire-project-${projectId}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'Project data exported successfully!' });
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'error', text: 'Failed to export project data.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.quotes || !data.quote_items) {
        throw new Error('Invalid file format');
      }

      for (const quote of data.quotes) {
        const { id: oldQuoteId, project_id, created_at, updated_at, ...quoteData } = quote;

        const { data: newQuote, error: quoteError } = await supabase
          .from('quotes')
          .insert({
            ...quoteData,
            project_id: projectId,
          })
          .select()
          .single();

        if (quoteError) throw quoteError;

        const relatedItems = data.quote_items.filter((item: any) => item.quote_id === oldQuoteId);

        for (const item of relatedItems) {
          const { id, quote_id, created_at, updated_at, ...itemData } = item;

          const { error: itemError } = await supabase
            .from('quote_items')
            .insert({
              ...itemData,
              quote_id: newQuote.id,
            });

          if (itemError) throw itemError;
        }
      }

      if (data.scope_categories && data.scope_categories.length > 0) {
        for (const category of data.scope_categories) {
          const { id, project_id, created_at, ...categoryData } = category;

          await supabase
            .from('scope_categories')
            .insert({
              ...categoryData,
              project_id: projectId,
            });
        }
      }

      setMessage({ type: 'success', text: `Imported ${data.quotes.length} quotes successfully!` });
      event.target.value = '';
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: 'Failed to import project data. Please check the file format.' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRunMigration = async () => {
    if (!confirm('This will check for legacy data in localStorage and migrate it to a new project. Continue?')) {
      return;
    }

    setIsMigrating(true);
    setMessage(null);

    try {
      if (!checkForLegacyData()) {
        setMessage({ type: 'error', text: 'No legacy data found to migrate.' });
        setHasLegacyData(false);
        return;
      }

      const result = await migrateLegacyData();

      if (result.success && result.projectId) {
        setMessage({
          type: 'success',
          text: `Legacy data migrated successfully! ${result.itemsMigrated?.lines || 0} items from ${result.itemsMigrated?.suppliers || 0} suppliers. Reload the page to see the new project.`
        });
        setHasLegacyData(false);
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to migrate legacy data.'
        });
      }
    } catch (error) {
      console.error('Migration error:', error);
      setMessage({ type: 'error', text: 'An error occurred during migration.' });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm('Are you sure you want to delete this project? This will remove all quotes and data. This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;

      onProjectDeleted();
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({ type: 'error', text: 'Failed to delete project.' });
    }
  };

  const handleSaveModelRateSettings = async () => {
    setIsSavingSettings(true);
    setMessage(null);

    try {
      const success = await provider.saveSettings({
        model_rate_source: modelRateSource,
        api_base_url: apiBaseUrl,
        csv_data: csvData.length > 0 ? csvData : undefined,
      });

      if (success) {
        await supabase
          .from('projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', projectId);
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings.' });
      }
    } catch (error) {
      console.error('Save settings error:', error);
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingCSV(true);
    setMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(firstSheet);

      const parsedData: CSVModelRate[] = rows.map(row => ({
        systemId: String(row.systemId || row.SystemId || row.system_id || '').trim(),
        sizeBucket: String(row.sizeBucket || row.SizeBucket || row.size_bucket || '').trim(),
        frr: String(row.frr || row.FRR || '').trim(),
        service: String(row.service || row.Service || '').trim(),
        subclass: String(row.subclass || row.Subclass || row.sub_class || '').trim(),
        componentCount: parseInt(row.componentCount || row.ComponentCount || row.component_count || '0'),
        modelRate: parseFloat(row.modelRate || row.ModelRate || row.model_rate || '0'),
      })).filter(item => item.systemId && item.modelRate > 0);

      if (parsedData.length === 0) {
        throw new Error('No valid data found in CSV file');
      }

      setCsvData(parsedData);
      setMessage({ type: 'success', text: `Loaded ${parsedData.length} model rates from CSV.` });
      event.target.value = '';
    } catch (error) {
      console.error('CSV upload error:', error);
      setMessage({ type: 'error', text: 'Failed to parse CSV file. Please check the format.' });
    } finally {
      setIsUploadingCSV(false);
    }
  };


  const loadSnapshotList = async () => {
    setIsLoadingSnapshots(true);
    const list = await listProjectSnapshots();
    setSnapshots(list);
    setIsLoadingSnapshots(false);
  };

  const handleSaveSnapshot = async () => {
    if (!snapshotKey || !snapshotName) {
      setMessage({ type: 'error', text: 'Please provide snapshot key and name.' });
      return;
    }

    setIsSavingSnapshot(true);
    setMessage(null);

    try {
      const success = await saveProjectSnapshot(
        snapshotKey,
        projectId,
        {
          name: snapshotName,
          client: snapshotClient || 'Unknown',
          created: new Date().toISOString().split('T')[0],
        }
      );

      if (success) {
        setMessage({ type: 'success', text: `Snapshot "${snapshotKey}" saved successfully!` });
        setSnapshotKey('');
        setSnapshotName('');
        setSnapshotClient('');
        await loadSnapshotList();
      } else {
        setMessage({ type: 'error', text: 'Failed to save snapshot.' });
      }
    } catch (error) {
      console.error('Save snapshot error:', error);
      setMessage({ type: 'error', text: 'Failed to save snapshot.' });
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (key: string) => {
    if (!confirm(`Restore snapshot "${key}"? This will replace all current project data.`)) {
      return;
    }

    setIsRestoringSnapshot(true);
    setMessage(null);

    try {
      const success = await loadProjectSnapshot(key, projectId);

      if (success) {
        setMessage({ type: 'success', text: `Snapshot "${key}" restored successfully! Refresh the page to see changes.` });
        await loadSettings();
      } else {
        setMessage({ type: 'error', text: 'Failed to restore snapshot.' });
      }
    } catch (error) {
      console.error('Restore snapshot error:', error);
      setMessage({ type: 'error', text: 'Failed to restore snapshot.' });
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const handleDeleteSnapshot = async (key: string) => {
    if (!confirm(`Delete snapshot "${key}"? This action cannot be undone.`)) {
      return;
    }

    setMessage(null);

    try {
      const success = await deleteProjectSnapshot(key);

      if (success) {
        setMessage({ type: 'success', text: `Snapshot "${key}" deleted successfully!` });
        await loadSnapshotList();
      } else {
        setMessage({ type: 'error', text: 'Failed to delete snapshot.' });
      }
    } catch (error) {
      console.error('Delete snapshot error:', error);
      setMessage({ type: 'error', text: 'Failed to delete snapshot.' });
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    setSavingTemplate(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      if (!userId) {
        alert('You must be logged in to save templates');
        return;
      }

      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .maybeSingle();

      const currentSettings = await provider.loadSettings();

      const { data: thresholds } = await supabase
        .from('project_settings')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      const { error } = await supabase
        .from('project_templates')
        .insert({
          name: templateName.trim(),
          description: templateDescription.trim(),
          trade: 'Passive Fire',
          is_default: false,
          created_by_user_id: userId,
          project_settings: {
            ...currentSettings,
            ...thresholds,
          },
          analysis_settings: {},
          report_settings: {},
          compliance_settings: {},
        });

      if (error) throw error;

      setMessage({ type: 'success', text: t('saveProjectAsTemplate.toasts.success', { templateName, projectName: project?.name || 'Project' }) });
      setShowTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/60 rounded-lg shadow-sm border-b border-slate-700">
        <div className="flex gap-1 p-2">
          <button
            onClick={() => setActiveTab('project')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'project'
                ? 'bg-orange-50 text-brand-primary border border-brand-primary'
                : 'text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <SettingsIcon size={18} />
            Project Settings
          </button>
          <button
            onClick={() => setActiveTab('systemcheck')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'systemcheck'
                ? 'bg-orange-50 text-brand-primary border border-brand-primary'
                : 'text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <ShieldCheck size={18} />
            System Check
          </button>
          <button
            onClick={() => setActiveTab('copilotaudit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'copilotaudit'
                ? 'bg-orange-50 text-brand-primary border border-brand-primary'
                : 'text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <Shield size={18} />
            Copilot Audit
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {activeTab === 'systemcheck' ? (
        <SystemCheck />
      ) : activeTab === 'copilotaudit' ? (
        <CopilotAudit />
      ) : (
        <>
        <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SettingsIcon size={20} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Project Settings</h2>
          </div>
          <button
            onClick={() => {
              const { data: project } = supabase
                .from('projects')
                .select('name')
                .eq('id', projectId)
                .maybeSingle()
                .then(({ data }) => {
                  setTemplateName(`${data?.name || 'Project'} Template`);
                });
              setShowTemplateModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-medium text-sm border border-blue-200"
          >
            <BookTemplate size={16} />
            {t('saveProjectAsTemplate.buttonLabel')}
          </button>
        </div>

        <h3 className="text-base font-semibold text-gray-900 mb-4">Model Rate Provider</h3>

        {isLoadingSettings ? (
          <div className="text-center py-8 text-gray-500">Loading settings...</div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model Rate Source
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modelRateSource"
                    value="api"
                    checked={modelRateSource === 'api'}
                    onChange={(e) => setModelRateSource(e.target.value as ModelRateSource)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <Globe size={18} className="text-gray-600" />
                  <span className="text-sm text-gray-700">API</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modelRateSource"
                    value="csv"
                    checked={modelRateSource === 'csv'}
                    onChange={(e) => setModelRateSource(e.target.value as ModelRateSource)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <FileText size={18} className="text-gray-600" />
                  <span className="text-sm text-gray-700">CSV</span>
                </label>
              </div>
            </div>

            {modelRateSource === 'api' && (
              <div>
                <label htmlFor="apiBaseUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  API Base URL
                </label>
                <input
                  id="apiBaseUrl"
                  type="url"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="https://gkdvcyocchnfwelrxvmz.supabase.co/functions/v1/rate-api"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">
                    Leave empty to use the default Verify+ Rate API
                  </p>
                  <p className="text-xs text-blue-600 font-mono">
                    Default: https://gkdvcyocchnfwelrxvmz.supabase.co/functions/v1/rate-api
                  </p>
                  <p className="text-xs text-gray-500">
                    The API will be called as: POST {'{baseUrl}'}/rate with system_label, size, frr, service, and subclass
                  </p>
                </div>
              </div>
            )}

            <ThresholdsDropdowns projectId={projectId} />

            <div className="bg-slate-800/40 p-4 rounded-md border border-slate-700">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Project ID:</strong> <code className="text-xs bg-slate-900/50 px-2 py-1 rounded border border-slate-600">{projectId}</code>
              </p>
              <p className="text-xs text-gray-500">Used for storage keys and data isolation</p>
            </div>

            {modelRateSource === 'csv' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload ModelSolutions.csv
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer">
                    <Upload size={18} />
                    {isUploadingCSV ? 'Uploading...' : 'Upload CSV'}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      multiple={false}
                      onChange={handleCSVUpload}
                      disabled={isUploadingCSV}
                      className="hidden"
                    />
                  </label>
                  {csvData.length > 0 && (
                    <span className="text-sm text-gray-600">
                      {csvData.length} model rates loaded
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Required columns: systemId, sizeBucket, frr, service, subclass, componentCount, modelRate
                </p>
                {csvData.length > 0 && (
                  <div className="mt-4 border border-gray-200 rounded-md overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-900/50 border-b border-slate-700 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">System ID</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Size Bucket</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">FRR</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Service</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Subclass</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Components</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Model Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {csvData.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-700/30">
                              <td className="px-3 py-2 text-gray-900">{row.systemId}</td>
                              <td className="px-3 py-2 text-gray-600">{row.sizeBucket}</td>
                              <td className="px-3 py-2 text-gray-600">{row.frr}</td>
                              <td className="px-3 py-2 text-gray-600">{row.service}</td>
                              <td className="px-3 py-2 text-gray-600">{row.subclass}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{row.componentCount}</td>
                              <td className="px-3 py-2 text-right text-gray-900">${row.modelRate.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvData.length > 10 && (
                      <div className="px-3 py-2 bg-slate-800/40 border-t border-slate-700 text-xs text-slate-500">
                        Showing 10 of {csvData.length} rows
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleSaveModelRateSettings}
                disabled={isSavingSettings || (modelRateSource === 'csv' && csvData.length === 0)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="text-cyan-600" size={24} />
          <h2 className="text-xl font-semibold text-slate-100">User Experience</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg border border-slate-700">
            <div>
              <h3 className="text-sm font-medium text-slate-100">Show Splash Screen on Every Load</h3>
              <p className="text-xs text-slate-400 mt-1">
                Display the animated BurnRatePro splash screen each time the app loads
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showSplashOnLoad}
                onChange={(e) => handleToggleSplashScreen(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-slate-100 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-100 after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>

          <div className="text-xs text-slate-300 bg-blue-900/20 border border-blue-700 rounded-lg p-3">
            <p><strong>Tip:</strong> Press <kbd className="px-2 py-1 bg-slate-900/50 border border-blue-500 rounded text-xs">Shift</kbd> + <kbd className="px-2 py-1 bg-slate-900/50 border border-blue-500 rounded text-xs">S</kbd> to replay the splash screen at any time</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-slate-100 mb-6 flex items-center gap-2">
          <Activity size={20} className="text-slate-300" />
          PDF Extractor API
        </h2>

        <div className="space-y-4">
          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700">
            <h3 className="text-sm font-medium text-slate-100 mb-2">External PDF Extraction Service</h3>
            <p className="text-xs text-slate-300 mb-3">
              This service automatically extracts structured data from supplier quote PDFs.
            </p>
            <div className="text-xs text-slate-400 space-y-1 mb-4">
              <div><strong>Endpoint:</strong> https://verify-pdf-extractor.onrender.com</div>
              <div><strong>Status:</strong> {extractorHealthStatus || 'Not checked'}</div>
            </div>
            <button
              onClick={handleCheckExtractorHealth}
              disabled={checkingHealth}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
            >
              {checkingHealth ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Activity size={16} />
                  Check Health
                </>
              )}
            </button>
          </div>

          <div className="text-xs text-slate-300 bg-purple-900/20 border border-purple-700 rounded-lg p-3">
            <p><strong>Note:</strong> The PDF extractor is called automatically when you upload a PDF in the Import Quotes screen. This health check verifies the service is online and responding.</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-slate-100 mb-6">Project Data</h2>

        <div className="space-y-6">
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-lg font-medium text-slate-100 mb-3">Export Data</h3>
            <p className="text-sm text-slate-300 mb-4">
              Export all project data including quotes, items, and categories to a JSON file.
            </p>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              {isExporting ? 'Exporting...' : 'Export Project Data'}
            </button>
          </div>

          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-lg font-medium text-slate-100 mb-3">Import Data</h3>
            <p className="text-sm text-slate-300 mb-4">
              Import quotes and items from a previously exported JSON file. This will add to existing data.
            </p>
            <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors cursor-pointer inline-flex">
              <Upload size={18} />
              {isImporting ? 'Importing...' : 'Import Project Data'}
              <input
                type="file"
                accept=".json"
                multiple={false}
                onChange={handleImport}
                disabled={isImporting}
                className="hidden"
              />
            </label>
          </div>

          {hasLegacyData && (
            <div className="border-t border-slate-700 pt-6">
              <h3 className="text-lg font-medium text-yellow-400 mb-3 flex items-center gap-2">
                <AlertTriangle size={20} className="text-yellow-500" />
                Legacy Data Migration
              </h3>
              <p className="text-sm text-slate-300 mb-4">
                Legacy data detected in localStorage. Click below to migrate it to a new project in the database.
              </p>
              <button
                onClick={handleRunMigration}
                disabled={isMigrating}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <RefreshCw size={18} className={isMigrating ? 'animate-spin' : ''} />
                {isMigrating ? 'Migrating...' : 'Re-run Migration'}
              </button>
            </div>
          )}

          <div className="border-t border-slate-700 pt-6">
            <h3 className="text-lg font-medium text-red-400 mb-3">Danger Zone</h3>
            <p className="text-sm text-slate-300 mb-4">
              Permanently delete this project and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={handleDeleteProject}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              <Trash2 size={18} />
              Delete Project
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Database size={20} className="text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-100">Project Snapshots</h2>
        </div>

        <div className="space-y-6">
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-lg font-medium text-slate-100 mb-3">Save Current Project</h3>
            <p className="text-sm text-slate-300 mb-4">
              Create a snapshot of the current project state including all quotes, mappings, comparisons, and settings.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor="snapshotKey" className="block text-sm font-medium text-slate-300 mb-2">
                  Snapshot Key *
                </label>
                <input
                  id="snapshotKey"
                  type="text"
                  value={snapshotKey}
                  onChange={(e) => setSnapshotKey(e.target.value)}
                  placeholder="HowickLibrary_2025"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
              <div>
                <label htmlFor="snapshotName" className="block text-sm font-medium text-slate-300 mb-2">
                  Project Name *
                </label>
                <input
                  id="snapshotName"
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  placeholder="Howick Library"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
              <div>
                <label htmlFor="snapshotClient" className="block text-sm font-medium text-slate-300 mb-2">
                  Client
                </label>
                <input
                  id="snapshotClient"
                  type="text"
                  value={snapshotClient}
                  onChange={(e) => setSnapshotClient(e.target.value)}
                  placeholder="Cassidy"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
            </div>
            <button
              onClick={handleSaveSnapshot}
              disabled={isSavingSnapshot || !snapshotKey || !snapshotName}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Save size={18} />
              {isSavingSnapshot ? 'Saving Snapshot...' : 'Save Snapshot'}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-slate-100">Saved Snapshots</h3>
              <button
                onClick={loadSnapshotList}
                disabled={isLoadingSnapshots}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 transition-colors"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>

            {isLoadingSnapshots ? (
              <div className="text-center py-8 text-slate-400">Loading snapshots...</div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 bg-slate-800/40 rounded-md border border-slate-700">
                No snapshots saved yet.
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="p-4 bg-slate-800/40 rounded-md border border-slate-700 hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-100">{snapshot.projectMeta.name}</h4>
                          <code className="px-2 py-0.5 text-xs bg-slate-900 rounded border border-slate-600 text-slate-300">
                            {snapshot.projectKey}
                          </code>
                        </div>
                        <div className="text-sm text-slate-300 space-y-1">
                          <p>
                            <strong>Client:</strong> {snapshot.projectMeta.client} |
                            <strong className="ml-2">Created:</strong> {snapshot.projectMeta.created}
                          </p>
                          <p>
                            <strong>Suppliers:</strong> {snapshot.suppliers.length} |
                            <strong className="ml-2">Items:</strong> {snapshot.normalisedLines.length} |
                            <strong className="ml-2">Saved:</strong> {new Date(snapshot.snapshotDate || '').toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleRestoreSnapshot(snapshot.projectKey)}
                          disabled={isRestoringSnapshot}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400"
                        >
                          <RefreshCw size={14} />
                          Restore
                        </button>
                        <button
                          onClick={() => handleDeleteSnapshot(snapshot.projectKey)}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-slate-100 mb-4">Account</h3>
        <div className="space-y-4">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-slate-100 mb-4">About VerifyTrade</h3>
        <div className="text-sm text-slate-300 space-y-2">
          <p>Version 1.0</p>
          <p>
            VerifyTrade helps you manage and analyze quotes for passive fire protection projects.
            Import quotes, review items, compare suppliers, and generate award reports.
          </p>
        </div>
      </div>
      </>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">{t('saveProjectAsTemplate.modal.title')}</h2>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('saveProjectAsTemplate.modal.fields.name.label')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                  placeholder={t('saveProjectAsTemplate.modal.fields.name.placeholder', { projectName: 'Project' })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('saveProjectAsTemplate.modal.fields.description.label')}
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('saveProjectAsTemplate.modal.fields.description.placeholder')}
                />
              </div>

              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                {t('saveProjectAsTemplate.modal.description')}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  setTemplateName('');
                  setTemplateDescription('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm"
              >
                {t('saveProjectAsTemplate.modal.buttons.cancel')}
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {savingTemplate ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {t('saveProjectAsTemplate.modal.buttons.confirm')}
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
