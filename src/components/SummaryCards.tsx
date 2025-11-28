import { FileText, CheckCircle, TrendingDown } from 'lucide-react';
import SummaryStatCard from './SummaryStatCard';

interface SummaryCardsProps {
  quotesCount?: number;
  reportStatus?: string;
  savingsIdentified?: number;
}

export default function SummaryCards({
  quotesCount = 0,
  reportStatus = 'Ready',
  savingsIdentified = 0,
}: SummaryCardsProps) {
  const formattedSavings = savingsIdentified != null
    ? new Intl.NumberFormat('en-NZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(savingsIdentified)
    : '0.00';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
      <SummaryStatCard
        label="Quotes"
        value={quotesCount}
        icon={FileText}
        tone="navy"
      />

      <SummaryStatCard
        label="Report Status"
        value={reportStatus}
        icon={CheckCircle}
        tone="success"
        statusDot={reportStatus.toLowerCase() === 'ready'}
      />

      <SummaryStatCard
        label="Savings Identified"
        value={`$${formattedSavings}`}
        icon={TrendingDown}
        tone="orange"
      />
    </div>
  );
}
