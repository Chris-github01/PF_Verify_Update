import { useState } from 'react';
import { Briefcase, FileText } from 'lucide-react';
import BaseTracker from './BaseTracker';
import ClaimsVariations from './ClaimsVariations';

interface ContractManagerProps {
  projectId: string;
}

type TabType = 'basetracker' | 'claims';

export default function ContractManager({ projectId }: ContractManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('basetracker');

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold brand-navy">Contract Manager</h1>
              <p className="text-gray-600 text-base">Base contract tracking and management</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('basetracker')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'basetracker'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FileText size={16} />
            Base Tracker
          </button>
          {/* Claims & Variations tab hidden for current release */}
          {/* <button
            onClick={() => setActiveTab('claims')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'claims'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <DollarSign size={16} />
            Claims & Variations
          </button> */}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'basetracker' && <BaseTracker projectId={projectId} />}
        {activeTab === 'claims' && <ClaimsVariations projectId={projectId} />}
      </div>
    </div>
  );
}
