import { useState, useEffect } from 'react';
import { Plus, FileText, Building2, CheckCircle, Clock, Grid3x3, List, HardHat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';

interface SCCContract {
  id: string;
  contract_name: string;
  contract_number: string | null;
  subcontractor_company: string | null;
  subcontractor_name: string | null;
  contract_value: number | null;
  status: string;
  created_at: string;
  trade: string | null;
}

interface SCCContractPickerProps {
  onContractSelect: (id: string, name: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  setup: { label: 'Setup', color: 'text-yellow-400' },
  active: { label: 'Active', color: 'text-emerald-400' },
  complete: { label: 'Complete', color: 'text-sky-400' },
  disputed: { label: 'Disputed', color: 'text-red-400' },
};

export default function SCCContractPicker({ onContractSelect }: SCCContractPickerProps) {
  const { currentOrganisation } = useOrganisation();
  const [contracts, setContracts] = useState<SCCContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadUserData();
    if (currentOrganisation?.id) {
      loadContracts();
    }
  }, [currentOrganisation?.id]);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name);
      } else if (user?.email) {
        const emailName = user.email.split('@')[0];
        setUserName(emailName.charAt(0).toUpperCase() + emailName.slice(1));
      }
    } catch {
      // ignore
    }
  };

  const loadContracts = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scc_contracts')
        .select('id, contract_name, contract_number, subcontractor_company, subcontractor_name, contract_value, status, created_at, trade')
        .eq('organisation_id', currentOrganisation.id)
        .in('status', ['setup', 'active'])
        .order('created_at', { ascending: false });

      if (!error && data) {
        setContracts(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return null;
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          {userName && (
            <p className="text-slate-400 text-sm mb-1">Welcome back, {userName}</p>
          )}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">All Contracts</h1>
              <p className="text-slate-400 mt-1">Select a contract to continue</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg border transition-colors ${viewMode === 'grid' ? 'border-cyan-500 text-cyan-400 bg-cyan-900/20' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
                title="Grid view"
              >
                <Grid3x3 size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg border transition-colors ${viewMode === 'list' ? 'border-cyan-500 text-cyan-400 bg-cyan-900/20' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'flex flex-col gap-3'
          }>

            {contracts.map((contract) => {
              const statusCfg = STATUS_CONFIG[contract.status] ?? { label: contract.status, color: 'text-slate-400' };
              const value = formatCurrency(contract.contract_value);

              if (viewMode === 'list') {
                return (
                  <button
                    key={contract.id}
                    onClick={() => onContractSelect(contract.id, contract.contract_name)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:border-cyan-500/50 hover:bg-slate-800/60 transition-all text-left group"
                  >
                    <div className="h-10 w-10 rounded-lg bg-cyan-900/30 border border-cyan-700/30 flex items-center justify-center flex-shrink-0">
                      <HardHat size={18} className="text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                        {contract.contract_name}
                      </div>
                      {contract.subcontractor_company && (
                        <div className="text-xs text-slate-400 truncate">{contract.subcontractor_company}</div>
                      )}
                    </div>
                    {value && <div className="text-sm font-medium text-slate-300 flex-shrink-0">{value}</div>}
                    <div className={`text-xs font-medium flex-shrink-0 ${statusCfg.color}`}>{statusCfg.label}</div>
                  </button>
                );
              }

              return (
                <button
                  key={contract.id}
                  onClick={() => onContractSelect(contract.id, contract.contract_name)}
                  className="p-5 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:border-cyan-500/50 hover:bg-slate-800/60 transition-all text-left group flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-cyan-900/30 border border-cyan-700/30 flex items-center justify-center flex-shrink-0">
                      <HardHat size={18} className="text-cyan-400" />
                    </div>
                    <span className={`text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors leading-snug">
                      {contract.contract_name}
                    </div>
                    {contract.contract_number && (
                      <div className="text-xs text-slate-500 mt-0.5">{contract.contract_number}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {contract.subcontractor_company && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Building2 size={11} />
                        <span className="truncate">{contract.subcontractor_company}</span>
                      </div>
                    )}
                    {value && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <FileText size={11} />
                        <span>{value}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {contracts.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <HardHat size={28} className="text-slate-500" />
                </div>
                <h3 className="text-lg font-medium text-slate-300 mb-2">No contracts found</h3>
                <p className="text-slate-500 text-sm max-w-xs">
                  No active contracts are available for this organisation. Contact your administrator to set up a contract.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
