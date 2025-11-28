import { Building2, Shield, ShieldAlert } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full mb-6 shadow-lg">
            <Shield className="text-white" size={36} />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Welcome Back</h1>
          <p className="text-lg text-gray-600">Choose how you'd like to access the platform</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <button
            onClick={() => onSelectMode('admin')}
            className="bg-white rounded-2xl shadow-md hover:shadow-2xl p-10 transition-all duration-300 border border-gray-200 hover:border-red-300 hover:scale-105 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex flex-col items-center text-center h-full">
              <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-red-50 rounded-full flex items-center justify-center mb-6 group-hover:from-red-500 group-hover:to-red-600 transition-all duration-300 shadow-md">
                <ShieldAlert className="text-red-600 group-hover:text-white transition-colors duration-300" size={36} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Admin Console</h2>
              <p className="text-gray-600 mb-6 flex-grow leading-relaxed">
                Platform administration, manage organizations, users, and system settings
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full">
                <Shield size={16} />
                Master Admin Access
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('app')}
            className="bg-white rounded-2xl shadow-md hover:shadow-2xl p-10 transition-all duration-300 border border-gray-200 hover:border-blue-300 hover:scale-105 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex flex-col items-center text-center h-full">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full flex items-center justify-center mb-6 group-hover:from-blue-500 group-hover:to-blue-600 transition-all duration-300 shadow-md">
                <Building2 className="text-blue-600 group-hover:text-white transition-colors duration-300" size={36} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Main App</h2>
              <p className="text-gray-600 mb-6 flex-grow leading-relaxed">
                Access your projects, quotes, reports, and organization workspace
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full">
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
