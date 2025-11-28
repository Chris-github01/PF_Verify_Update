import PageHeader from '../components/PageHeader';
import { useOrganisation } from '../lib/organisationContext';

export default function OrganisationSettings() {
  const { currentOrganisation } = useOrganisation();

  return (
    <div>
      <PageHeader
        title="Organisation Settings"
        description="Manage your organisation preferences"
      />
      <div className="mt-6 p-6 bg-white rounded-lg border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-2">Current Organisation</h3>
        <p className="text-gray-600">{currentOrganisation?.name}</p>
      </div>
    </div>
  );
}
