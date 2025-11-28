import { Download, Printer, FileText } from 'lucide-react';

export type ExportType = 'print' | 'html' | 'excel';

interface ReportExportBarProps {
  onExport: (type: ExportType) => void;
  availableTypes: ExportType[];
}

export default function ReportExportBar({ onExport, availableTypes }: ReportExportBarProps) {
  return (
    <div className="flex items-center gap-2">
      {availableTypes.includes('print') && (
        <button
          onClick={() => onExport('print')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Printer size={16} />
          Print
        </button>
      )}
      {availableTypes.includes('html') && (
        <button
          onClick={() => onExport('html')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Export PDF
        </button>
      )}
      {availableTypes.includes('excel') && (
        <button
          onClick={() => onExport('excel')}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <FileText size={16} />
          Export Excel
        </button>
      )}
    </div>
  );
}
