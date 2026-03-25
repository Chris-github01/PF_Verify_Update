import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingAnomalyTable from '../../components/plumbing/beta/PlumbingAnomalyTable';
import PlumbingAnomalyDetail from '../../components/plumbing/beta/PlumbingAnomalyDetail';
import { dbGetAnomalies, dbGetAnomaly } from '../../lib/db/plumbingBetaDb';
import type { AnomalyEventRecord } from '../../lib/modules/parsers/plumbing/beta/anomalyTypes';

const PAGE_SIZE = 30;

interface Filters {
  severity: string;
  anomalyType: string;
  resolutionStatus: string;
  periodDays: number;
}

export default function PlumbingBetaAnomaliesPage() {
  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<AnomalyEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>({
    severity: '',
    anomalyType: '',
    resolutionStatus: '',
    periodDays: 30,
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailAnomaly, setDetailAnomaly] = useState<AnomalyEventRecord | null>(null);

  const loadAnomalies = useCallback(async (f: Filters, p: number) => {
    const { data, count } = await dbGetAnomalies({
      limit: PAGE_SIZE,
      offset: p * PAGE_SIZE,
      severity: f.severity || undefined,
      anomalyType: f.anomalyType || undefined,
      resolutionStatus: f.resolutionStatus || undefined,
      periodDays: f.periodDays,
    });
    setAnomalies(data);
    setTotal(count);
  }, []);

  useEffect(() => {
    loadAnomalies(filters, page).finally(() => setLoading(false));
  }, [loadAnomalies, filters, page]);

  useEffect(() => {
    if (detailId) dbGetAnomaly(detailId).then(setDetailAnomaly);
    else setDetailAnomaly(null);
  }, [detailId]);

  function handleFilterChange(key: string, value: string | number) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  return (
    <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h1 className="text-xl font-bold text-white">All Anomaly Events</h1>
              </div>
              <p className="text-gray-400 text-sm mt-0.5">
                Full anomaly log for <code className="text-cyan-400 text-xs">plumbing_parser</code> beta.
              </p>
            </div>
            <a
              href="/shadow/modules/plumbing_parser/beta"
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              ← Back to dashboard
            </a>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading anomalies...</div>
          ) : (
            <PlumbingAnomalyTable
              anomalies={anomalies}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onDetailOpen={setDetailId}
              onRefresh={() => loadAnomalies(filters, page)}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          )}

          {detailAnomaly && (
            <PlumbingAnomalyDetail
              anomaly={detailAnomaly}
              onClose={() => setDetailId(null)}
              onRefresh={() => loadAnomalies(filters, page)}
            />
          )}
        </div>
      </ShadowLayout>
  );
}
