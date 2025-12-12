import { Building2, Flame, ShieldAlert } from 'lucide-react';

interface ModeSelectorProps {
  onSelectMode: (mode: 'admin' | 'app') => void;
  isMasterAdmin: boolean;
}

export default function ModeSelector({ onSelectMode, isMasterAdmin }: ModeSelectorProps) {
  if (!isMasterAdmin) {
    onSelectMode('app');
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-orange-400 to-red-600 mb-6 shadow-lg shadow-orange-500/30">
            <Flame className="text-white" size={36} />
          </div>
          <h1 className="text-4xl font-bold text-slate-50 mb-3">Welcome Back</h1>
          <p className="text-lg text-slate-400">Choose how you'd like to access the platform</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => onSelectMode('admin')}
            className="bg-slate-900/60 border border-slate-700/60 rounded-2xl shadow-lg hover:shadow-2xl p-10 transition-all duration-200 hover:bg-slate-800/80 hover:scale-105 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
            <div className="relative flex flex-col items-center text-center h-full">
              <div className="w-20 h-20 bg-slate-800/60 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-red-500/20 transition-all duration-200 shadow-md">
                <ShieldAlert className="text-red-400 group-hover:text-red-300 transition-colors duration-200" size={36} />
              </div>
              <h2 className="text-2xl font-bold text-slate-50 mb-3">Admin Console</h2>
              <p className="text-slate-400 mb-6 flex-grow leading-relaxed">
                Platform administration, manage organizations, users, and system settings
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-300 bg-red-500/10 border border-red-500/30 rounded-full">
                <ShieldAlert size={16} />
                Master Admin Access
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('app')}
            className="bg-slate-900/60 border border-slate-700/60 rounded-2xl shadow-lg hover:shadow-2xl p-10 transition-all duration-200 hover:bg-slate-800/80 hover:scale-105 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
            <div className="relative flex flex-col items-center text-center h-full">
              <div className="w-20 h-20 bg-slate-800/60 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-sky-500/20 transition-all duration-200 shadow-md">
                <Building2 className="text-sky-400 group-hover:text-sky-300 transition-colors duration-200" size={36} />
              </div>
              <h2 className="text-2xl font-bold text-slate-50 mb-3">Main App</h2>
              <p className="text-slate-400 mb-6 flex-grow leading-relaxed">
                Access your projects, quotes, reports, and organization workspace
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-full">
                <Building2 size={16} />
                Organization Access
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
