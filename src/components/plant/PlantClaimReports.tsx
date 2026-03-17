import { useState, useMemo } from 'react';
import {
  usePlantClaimPeriods, usePlantClaimLines, usePlantSettings,
  createClaimPeriod, generateTimeHireCharges, generateClaimLines,
  finalizeClaimPeriod, formatCurrency,
} from '../../lib/plantHire/usePlantHire';
import { useOrganisation } from '../../lib/organisationContext';
import { FileText, Download, RefreshCw, Lock, ChevronDown, ChevronRight, Loader2, DollarSign } from 'lucide-react';
import type { PlantClaimLine, PlantClaimPeriod, ChargeType } from '../../types/plantHire.types';
import ExcelJS from 'exceljs';

const CHARGE_LABELS: Record<ChargeType, string> = {
  ON_HIRE_FIXED:  'On-Hire Charge',
  OFF_HIRE_FIXED: 'Off-Hire Charge',
  TIME_HIRE:      'Time Hire',
};

const STATUS_BADGE: Record<string, string> = {
  OPEN:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  LOCKED:    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  FINALIZED: 'bg-slate-600/30 text-slate-400 border-slate-600/30',
};

interface GroupedProject {
  projectId: string | null;
  projectName: string;
  lines: PlantClaimLine[];
  total: number;
}

function groupByProject(lines: PlantClaimLine[]): GroupedProject[] {
  const map = new Map<string, GroupedProject>();
  for (const line of lines) {
    const key = line.project_id || '__none__';
    if (!map.has(key)) {
      map.set(key, {
        projectId: line.project_id,
        projectName: (line.project as any)?.name || 'No Project',
        lines: [],
        total: 0,
      });
    }
    const g = map.get(key)!;
    g.lines.push(line);
    g.total += line.amount || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function ClaimSummary({ lines }: { lines: PlantClaimLine[] }) {
  const onHireTotal = lines.filter(l => l.line_type === 'ON_HIRE_FIXED').reduce((s, l) => s + (l.amount || 0), 0);
  const offHireTotal = lines.filter(l => l.line_type === 'OFF_HIRE_FIXED').reduce((s, l) => s + (l.amount || 0), 0);
  const timeTotal = lines.filter(l => l.line_type === 'TIME_HIRE').reduce((s, l) => s + (l.amount || 0), 0);
  const grand = onHireTotal + offHireTotal + timeTotal;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'On-Hire Charges', value: onHireTotal, color: 'text-emerald-400' },
        { label: 'Time Hire',       value: timeTotal,   color: 'text-sky-400' },
        { label: 'Off-Hire Charges',value: offHireTotal,color: 'text-amber-400' },
        { label: 'Grand Total',     value: grand,       color: 'text-white' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold mt-1 ${color}`}>{formatCurrency(value)}</p>
        </div>
      ))}
    </div>
  );
}

function ProjectGroup({ group, expanded, onToggle }: { group: GroupedProject; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          <span className="text-sm font-medium text-white">{group.projectName}</span>
          <span className="text-xs text-slate-500">{group.lines.length} line(s)</span>
        </div>
        <span className="text-sm font-semibold text-cyan-400">{formatCurrency(group.total)}</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-700/50 overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-slate-700/40">
                {['Asset', 'Type', 'Description', 'Qty', 'Rate', 'Amount'].map(h => (
                  <th key={h} className="text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/20">
              {group.lines.map(line => (
                <tr key={line.id} className="hover:bg-slate-700/10 transition-colors">
                  <td className="px-4 py-2.5 text-slate-300 text-xs">{(line.asset as any)?.asset_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      line.line_type === 'ON_HIRE_FIXED' ? 'bg-emerald-500/20 text-emerald-300' :
                      line.line_type === 'OFF_HIRE_FIXED' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-sky-500/20 text-sky-300'
                    }`}>
                      {CHARGE_LABELS[line.line_type as ChargeType]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 max-w-xs truncate">{line.description || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300 text-right">{line.quantity}</td>
                  <td className="px-4 py-2.5 text-slate-300 text-right">{formatCurrency(line.rate)}</td>
                  <td className="px-4 py-2.5 text-white font-medium text-right">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-700/40 bg-slate-700/10">
                <td colSpan={5} className="px-4 py-2.5 text-sm text-slate-400 text-right font-medium">Subtotal</td>
                <td className="px-4 py-2.5 text-white font-bold text-right">{formatCurrency(group.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PlantClaimReports() {
  const { currentOrganisation } = useOrganisation();
  const { periods, loading: periodsLoading, refresh: refreshPeriods } = usePlantClaimPeriods();
  const { settings } = usePlantSettings();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [selectedPeriodDate, setSelectedPeriodDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [genMsg, setGenMsg] = useState<string | null>(null);

  const { lines, loading: linesLoading, refresh: refreshLines } = usePlantClaimLines(selectedPeriodId);
  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const grouped = useMemo(() => groupByProject(lines), [lines]);

  const handleGenerate = async () => {
    if (!currentOrganisation?.id || !selectedPeriodDate) return;
    setGenerating(true);
    setGenMsg(null);

    const { periodId, error: cpErr } = await createClaimPeriod(currentOrganisation.id, selectedPeriodDate);
    if (cpErr || !periodId) { setGenMsg('Error: ' + cpErr); setGenerating(false); return; }

    const { count: timeCount, error: timeErr } = await generateTimeHireCharges(periodId);
    if (timeErr) { setGenMsg('Error generating time charges: ' + timeErr); setGenerating(false); return; }

    const { count: lineCount, error: lineErr } = await generateClaimLines(periodId);
    if (lineErr) { setGenMsg('Error generating claim lines: ' + lineErr); setGenerating(false); return; }

    setSelectedPeriodId(periodId);
    setGenMsg(`Generated ${timeCount} time charge(s), ${lineCount} claim line(s).`);
    setGenerating(false);
    refreshPeriods();
    refreshLines();
    setExpandedProjects(new Set(grouped.map(g => g.projectId || '__none__')));
  };

  const handleFinalize = async () => {
    if (!selectedPeriodId || !confirm('Finalize this period? This locks all charge events and cannot be undone.')) return;
    setFinalizing(true);
    const { success, error } = await finalizeClaimPeriod(selectedPeriodId);
    setFinalizing(false);
    if (!success) { alert('Error: ' + error); return; }
    refreshPeriods();
    refreshLines();
  };

  const toggleProject = (key: string) => {
    setExpandedProjects(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  };

  const exportExcel = async () => {
    if (!selectedPeriod || lines.length === 0) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plant Hire Claim');

    ws.columns = [
      { header: 'Project', key: 'project', width: 25 },
      { header: 'Asset', key: 'asset', width: 25 },
      { header: 'Booking Ref', key: 'booking', width: 15 },
      { header: 'Charge Type', key: 'type', width: 18 },
      { header: 'Description', key: 'desc', width: 40 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Amount', key: 'amount', width: 14 },
    ];

    ws.getRow(1).font = { bold: true };

    for (const line of lines) {
      ws.addRow({
        project: (line.project as any)?.name || 'No Project',
        asset: (line.asset as any)?.asset_name || '—',
        booking: (line.booking as any)?.booking_reference || '—',
        type: CHARGE_LABELS[line.line_type as ChargeType],
        desc: line.description || '',
        qty: line.quantity,
        rate: line.rate || 0,
        amount: line.amount || 0,
      });
    }

    const grandTotal = lines.reduce((s, l) => s + (l.amount || 0), 0);
    ws.addRow({});
    ws.addRow({ desc: 'GRAND TOTAL', amount: grandTotal }).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PlantHireClaim_${selectedPeriod.period_name.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!selectedPeriod || lines.length === 0) return;
    const grand = lines.reduce((s, l) => s + (l.amount || 0), 0);
    const projectRows = grouped.map(g =>
      `<tr style="background:#1e293b"><td colspan="6" style="padding:8px 12px;font-weight:600;color:#e2e8f0">${g.projectName}</td></tr>` +
      g.lines.map(l =>
        `<tr><td style="padding:6px 12px;color:#94a3b8;font-size:12px">${(l.asset as any)?.asset_name || '—'}</td>
         <td style="padding:6px 12px;font-size:12px">${CHARGE_LABELS[l.line_type as ChargeType]}</td>
         <td style="padding:6px 12px;font-size:12px">${l.description || ''}</td>
         <td style="padding:6px 12px;text-align:right;font-size:12px">${l.quantity}</td>
         <td style="padding:6px 12px;text-align:right;font-size:12px">${formatCurrency(l.rate)}</td>
         <td style="padding:6px 12px;text-align:right;font-size:12px;font-weight:600">${formatCurrency(l.amount)}</td></tr>`
      ).join('') +
      `<tr style="background:#0f172a"><td colspan="5" style="padding:6px 12px;text-align:right;font-size:12px;color:#94a3b8">Subtotal</td>
       <td style="padding:6px 12px;text-align:right;font-weight:700;color:#22d3ee">${formatCurrency(g.total)}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>Plant Hire Claim</title>
<style>body{font-family:sans-serif;background:#020617;color:#e2e8f0;margin:0;padding:24px}
h1{color:#fff;font-size:22px;margin:0}h2{color:#94a3b8;font-size:14px;font-weight:400;margin:4px 0 0}
table{width:100%;border-collapse:collapse;margin-top:24px}
thead tr{background:#1e293b}th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b}
tbody tr:hover{background:#1e293b10}
.total-row{background:#0f172a;font-weight:700;color:#22d3ee;font-size:15px}
</style></head><body>
<h1>Plant Hire Claim Report</h1>
<h2>${selectedPeriod.period_name}</h2>
<p style="font-size:12px;color:#64748b;margin-top:4px">Generated: ${new Date().toLocaleDateString('en-NZ', { dateStyle: 'full' })}</p>
<table>
<thead><tr><th>Asset</th><th>Charge Type</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${projectRows}
<tr class="total-row"><td colspan="5" style="padding:12px;text-align:right">GRAND TOTAL</td><td style="padding:12px;text-align:right">${formatCurrency(grand)}</td></tr>
</tbody></table></body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
        <p className="text-sm font-semibold text-white mb-4">Generate Claim Period</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1.5">
              Period End Date
              {settings && <span className="text-slate-500 ml-2">(end day = {settings.claim_period_end_day})</span>}
            </label>
            <input
              type="date"
              value={selectedPeriodDate}
              onChange={e => setSelectedPeriodDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedPeriodDate}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Generate
            </button>
          </div>
        </div>
        {genMsg && <p className="text-xs text-emerald-400 mt-2">{genMsg}</p>}
      </div>

      {/* Period list */}
      {periodsLoading ? null : periods.length > 0 && (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Claim Periods</p>
          </div>
          <div className="divide-y divide-slate-700/30">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPeriodId(p.id); refreshLines(); }}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition-colors text-left ${selectedPeriodId === p.id ? 'bg-slate-700/30' : ''}`}
              >
                <span className="text-sm text-white">{p.period_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected period report */}
      {selectedPeriod && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold text-white">{selectedPeriod.period_name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{lines.length} line(s) · Status: {selectedPeriod.status}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedPeriod.status !== 'FINALIZED' && (
                <button
                  onClick={handleFinalize}
                  disabled={finalizing || lines.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                >
                  {finalizing ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                  Finalize Period
                </button>
              )}
              <button onClick={exportExcel} disabled={lines.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors disabled:opacity-40">
                <Download size={12} />
                Export Excel
              </button>
              <button onClick={exportPDF} disabled={lines.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs hover:bg-blue-500/30 transition-colors disabled:opacity-40">
                <FileText size={12} />
                Print / PDF
              </button>
            </div>
          </div>

          {linesLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="text-slate-500 animate-spin" /></div>
          ) : lines.length === 0 ? (
            <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-10 text-center">
              <DollarSign size={32} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No charge lines for this period.</p>
              <p className="text-slate-500 text-xs mt-1">Generate the period to create charge lines from active bookings.</p>
            </div>
          ) : (
            <>
              <ClaimSummary lines={lines} />
              <div className="space-y-2">
                {grouped.map(g => (
                  <ProjectGroup
                    key={g.projectId || '__none__'}
                    group={g}
                    expanded={expandedProjects.has(g.projectId || '__none__')}
                    onToggle={() => toggleProject(g.projectId || '__none__')}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
