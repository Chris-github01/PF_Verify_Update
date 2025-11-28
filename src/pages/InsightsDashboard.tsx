import PageHeader from '../components/PageHeader';

interface InsightsDashboardProps {
  projectId: string;
}

export default function InsightsDashboard({ projectId }: InsightsDashboardProps) {
  return (
    <div className="p-8">
      <PageHeader
        title="Insights Dashboard"
        description="AI-powered insights and analytics"
      />
      <div className="mt-6 p-6 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-600">
          Insights Dashboard - Analytics and intelligence coming soon
        </p>
      </div>
    </div>
  );
}
