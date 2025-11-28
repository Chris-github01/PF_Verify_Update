import { useState, useEffect } from 'react';
import { FileText, Download, Search, Filter, ExternalLink } from 'lucide-react';
import { getAllQuotes, type GlobalQuote } from '../../lib/admin/adminApi';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';

export default function GlobalPDFVault() {
  const [quotes, setQuotes] = useState<GlobalQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [organisations, setOrganisations] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [quotesData, orgsData] = await Promise.all([
        getAllQuotes(),
        supabase.from('organisations').select('id, name').order('name')
      ]);

      setQuotes(quotesData);
      setOrganisations(orgsData.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (quote: GlobalQuote) => {
    try {
      // Get signed URL from storage
      const storagePath = quote.supplier_name ?
        `${quote.organisation_id}/${quote.supplier_name.replace(/\s+/g, '_')}_${quote.quote_id}.pdf` :
        `${quote.organisation_id}/quote_${quote.quote_id}.pdf`;

      const { data, error } = await supabase.storage
        .from('quotes')
        .createSignedUrl(storagePath, 3600);

      if (error) throw error;

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to download:', error);
      alert('Failed to download PDF. It may have been deleted or moved.');
    }
  };

  const filteredQuotes = quotes.filter(quote => {
    if (searchTerm && !quote.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !quote.organisation_name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (tradeFilter !== 'all' && quote.trade_type !== tradeFilter) {
      return false;
    }
    if (orgFilter !== 'all' && quote.organisation_id !== orgFilter) {
      return false;
    }
    return true;
  });

  const stats = {
    total: quotes.length,
    totalSize: quotes.reduce((sum, q) => sum + (q.items_count || 0), 0),
    avgConfidence: quotes.length > 0
      ? (quotes.reduce((sum, q) => sum + (q.avg_confidence || 0), 0) / quotes.length * 100).toFixed(1)
      : '0'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading PDF vault...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global PDF Vault"
        subtitle="Every PDF ever uploaded by any client, searchable and downloadable"
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <FileText className="text-gray-600" size={24} />
            <div>
              <div className="text-sm text-gray-600">Total PDFs</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <FileText className="text-gray-600" size={24} />
            <div>
              <div className="text-sm text-gray-600">Total Line Items</div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalSize.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <FileText className="text-gray-600" size={24} />
            <div>
              <div className="text-sm text-gray-600">Avg Confidence</div>
              <div className="text-2xl font-bold text-gray-900">{stats.avgConfidence}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by supplier or organisation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Trades</option>
              <option value="passive_fire">PassiveFire</option>
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
              <option value="mechanical">Mechanical</option>
            </select>

            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Organisations</option>
              {organisations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Organisation</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Items</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Uploaded</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredQuotes.map((quote) => (
                <tr key={quote.quote_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">{quote.supplier_name}</div>
                      {quote.quote_reference && (
                        <div className="text-sm text-gray-500">{quote.quote_reference}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{quote.organisation_name}</div>
                    <div className="text-xs text-gray-500">
                      {quote.trade_type === 'passive_fire' && 'PassiveFire'}
                      {quote.trade_type === 'electrical' && 'Electrical'}
                      {quote.trade_type === 'plumbing' && 'Plumbing'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-700">{quote.project_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{quote.items_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">
                      ${quote.total_amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {quote.avg_confidence ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 w-16">
                          <div
                            className={`h-2 rounded-full ${
                              quote.avg_confidence < 0.5 ? 'bg-red-600' :
                              quote.avg_confidence < 0.75 ? 'bg-yellow-600' :
                              'bg-green-600'
                            }`}
                            style={{ width: `${(quote.avg_confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">
                          {(quote.avg_confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-sm text-gray-900">
                        {new Date(quote.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {quote.uploaded_by_email || 'Unknown'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(quote)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Download PDF"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredQuotes.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              No PDFs found matching your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
