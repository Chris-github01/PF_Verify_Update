import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';

interface ExportDropdownProps {
  disabled?: boolean;
  onExport: (mode: 'site' | 'commercial') => void;
  loading?: boolean;
}

export default function ExportDropdown({ disabled, onExport, loading }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleExport = (mode: 'site' | 'commercial') => {
    setIsOpen(false);
    onExport(mode);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        title={disabled ? 'Export is available after a preferred supplier has been selected.' : 'Export documents'}
      >
        <Download size={16} />
        {loading ? 'Exporting...' : 'Export'}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && !loading && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <button
            onClick={() => handleExport('site')}
            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium text-gray-900 text-sm">Site Scope Pack</div>
            <div className="text-xs text-gray-500 mt-0.5">No pricing or commercial terms</div>
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => handleExport('commercial')}
            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium text-gray-900 text-sm">Commercial Handover Pack</div>
            <div className="text-xs text-gray-500 mt-0.5">Full contract details with pricing</div>
          </button>
        </div>
      )}
    </div>
  );
}
