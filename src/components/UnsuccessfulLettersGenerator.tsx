import { useState } from 'react';
import { FileText, Download } from 'lucide-react';

interface SupplierScore {
  supplierName: string;
  price: number;
}

interface UnsuccessfulLettersGeneratorProps {
  projectId: string;
  projectName: string;
  allSuppliers: SupplierScore[];
  preferredSupplier: SupplierScore;
  intelligenceData?: any;
  onGenerated: () => void;
}

export default function UnsuccessfulLettersGenerator({
  projectName,
  allSuppliers,
  preferredSupplier,
}: UnsuccessfulLettersGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const unsuccessfulCount = allSuppliers.filter(
    s => s.supplierName !== preferredSupplier.supplierName
  ).length;

  const handleGenerate = async () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 1000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <FileText className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">Unsuccessful Letters</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Generate letters for {unsuccessfulCount} unsuccessful supplier{unsuccessfulCount !== 1 ? 's' : ''} on {projectName}
      </p>
      {generated ? (
        <button
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-300 rounded-lg font-medium"
        >
          <Download size={18} />
          Download Letters
        </button>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
        >
          {generating ? 'Generating...' : 'Generate Letters'}
        </button>
      )}
    </div>
  );
}
