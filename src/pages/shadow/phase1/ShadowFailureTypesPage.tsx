import { useEffect, useState } from 'react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import { getAllFailureTypes } from '../../../lib/shadow/phase1/failureClassifier';
import { ShieldAlert } from 'lucide-react';

interface FailureType {
  id: string;
  failure_code: string;
  title: string;
  description: string;
  severity: string;
  business_impact_type: string;
  active: boolean;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function severityColor(severity: string): string {
  if (severity === 'critical') return 'border-l-red-600 bg-red-950/10';
  if (severity === 'high') return 'border-l-orange-600 bg-orange-950/10';
  if (severity === 'medium') return 'border-l-amber-600 bg-amber-950/10';
  if (severity === 'low') return 'border-l-blue-600 bg-blue-950/10';
  return 'border-l-gray-700 bg-gray-900';
}

function severityBadge(severity: string): string {
  if (severity === 'critical') return 'bg-red-900/50 text-red-300 border-red-700';
  if (severity === 'high') return 'bg-orange-900/50 text-orange-300 border-orange-700';
  if (severity === 'medium') return 'bg-amber-900/50 text-amber-300 border-amber-700';
  if (severity === 'low') return 'bg-blue-900/50 text-blue-300 border-blue-700';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function impactColor(type: string): string {
  if (type === 'financial') return 'text-teal-400';
  if (type === 'accuracy') return 'text-blue-400';
  if (type === 'completeness') return 'text-amber-400';
  if (type === 'risk') return 'text-red-400';
  return 'text-gray-400';
}

export default function ShadowFailureTypesPage() {
  const [types, setTypes] = useState<FailureType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllFailureTypes();
      setTypes(data as FailureType[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load failure types');
    } finally {
      setLoading(false);
    }
  }

  const filtered = types.filter((t) => !filterSeverity || t.severity === filterSeverity);
  const sorted = [...filtered].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return (
    <ShadowLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Failure Taxonomy</h1>
            <p className="text-gray-500 text-sm">Standardized failure type library for shadow run classification</p>
          </div>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none"
          >
            <option value="">All severities</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-gray-600 mb-3">{sorted.length} failure types</div>
            {sorted.map((t) => (
              <div
                key={t.id}
                className={`border border-gray-800 border-l-4 rounded-xl px-4 py-3.5 space-y-1.5 ${severityColor(t.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{t.title}</span>
                      <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${severityBadge(t.severity)}`}>
                        {t.severity}
                      </span>
                      <span className={`text-[10px] font-medium ${impactColor(t.business_impact_type)}`}>
                        {t.business_impact_type}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-gray-500 mt-0.5">{t.failure_code}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">{t.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
