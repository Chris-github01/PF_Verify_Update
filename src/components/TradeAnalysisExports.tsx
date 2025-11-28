import React from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";

export default function TradeAnalysisExports({
  supplier1,
  supplier2,
  comparisonRows,
  supplier1ItemsCount,
  supplier2ItemsCount,
  onExportExcel,
  onExportPDF,
}: {
  supplier1: any;
  supplier2: any;
  comparisonRows?: any[];
  supplier1ItemsCount?: number;
  supplier2ItemsCount?: number;
  onExportExcel: () => void;
  onExportPDF: () => void;
}) {
  const datasetsReady =
    supplier1 && supplier2 && supplier1.id !== supplier2.id;

  const hasRawData =
    (supplier1ItemsCount ?? 0) > 0 && (supplier2ItemsCount ?? 0) > 0;

  const hasFilteredData =
    Array.isArray(comparisonRows) && comparisonRows.length > 0;

  const enableExports = datasetsReady && hasRawData;

  const hint = !datasetsReady
    ? "Select two different datasets to enable export"
    : !hasRawData
    ? "No comparison data loaded yet"
    : "";

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        title={hint}
        onClick={() => enableExports && onExportExcel()}
        disabled={!enableExports}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold transition-all ${
          enableExports
            ? "bg-blue-600 text-white border-transparent hover:bg-blue-700 cursor-pointer"
            : "bg-slate-800 text-slate-400 border-transparent cursor-not-allowed"
        }`}
      >
        <FileSpreadsheet size={18} />
        Export Excel
      </button>
      <button
        type="button"
        title={hint}
        onClick={() => enableExports && onExportPDF()}
        disabled={!enableExports}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold transition-all ${
          enableExports
            ? "bg-blue-600 text-white border-transparent hover:bg-blue-700 cursor-pointer"
            : "bg-slate-800 text-slate-400 border-transparent cursor-not-allowed"
        }`}
      >
        <FileDown size={18} />
        Export PDF
      </button>
      {!enableExports && hint && (
        <span className="text-slate-400 text-xs">{hint}</span>
      )}
    </div>
  );
}
