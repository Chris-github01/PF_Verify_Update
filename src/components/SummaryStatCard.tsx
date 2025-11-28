import { LucideIcon } from 'lucide-react';

interface SummaryStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: 'navy' | 'success' | 'orange';
  statusDot?: boolean;
}

export default function SummaryStatCard({
  label,
  value,
  icon: Icon,
  tone,
  statusDot = false,
}: SummaryStatCardProps) {
  const toneClasses = {
    navy: 'bg-blue-50 text-blue-700',
    success: 'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {statusDot && (
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            )}
          </div>
        </div>
        <div className={`p-3 rounded-lg ${toneClasses[tone]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
