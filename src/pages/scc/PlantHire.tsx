import { useState } from 'react';
import {
  LayoutDashboard, Package, ClipboardList, Activity,
  DollarSign, FileBarChart, Settings, ChevronLeft, Truck,
} from 'lucide-react';
import PlantDashboard from '../../components/plant/PlantDashboard';
import PlantRegister from '../../components/plant/PlantRegister';
import PlantBookings from '../../components/plant/PlantBookings';
import PlantMovements from '../../components/plant/PlantMovements';
import PlantRates from '../../components/plant/PlantRates';
import PlantClaimReports from '../../components/plant/PlantClaimReports';
import PlantSettings from '../../components/plant/PlantSettings';

type PlantView =
  | 'dashboard'
  | 'register'
  | 'bookings'
  | 'movements'
  | 'rates'
  | 'claims'
  | 'settings';

interface NavItem {
  id: PlantView;
  label: string;
  icon: React.ElementType;
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',      icon: LayoutDashboard },
  { id: 'register',  label: 'Plant Register', icon: Package         },
  { id: 'bookings',  label: 'Bookings',       icon: ClipboardList   },
  { id: 'movements', label: 'Movements',      icon: Activity        },
  { id: 'rates',     label: 'Rates',          icon: DollarSign      },
  { id: 'claims',    label: 'Claim Reports',  icon: FileBarChart    },
  { id: 'settings',  label: 'Settings',       icon: Settings        },
];

const PAGE_TITLE: Record<PlantView, string> = {
  dashboard: 'Plant Dashboard',
  register:  'Plant Register',
  bookings:  'Bookings',
  movements: 'Movements',
  rates:     'Plant Rates',
  claims:    'Claim Period Reports',
  settings:  'Plant Settings',
};

interface Props {
  onBack?: () => void;
}

export default function PlantHire({ onBack }: Props) {
  const [view, setView] = useState<PlantView>('dashboard');
  const [bookingAssetId, setBookingAssetId] = useState<string | undefined>();

  const handleBookAsset = (assetId: string) => {
    setBookingAssetId(assetId);
    setView('bookings');
  };

  const handleNavigate = (v: string) => {
    setView(v as PlantView);
  };

  const renderContent = () => {
    switch (view) {
      case 'dashboard': return <PlantDashboard onNavigate={handleNavigate} />;
      case 'register':  return <PlantRegister onBookAsset={handleBookAsset} />;
      case 'bookings':  return <PlantBookings initialAssetId={bookingAssetId} onNavigate={handleNavigate} />;
      case 'movements': return <PlantMovements />;
      case 'rates':     return <PlantRates />;
      case 'claims':    return <PlantClaimReports />;
      case 'settings':  return <PlantSettings />;
      default:          return <PlantDashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/80 bg-slate-900/60 sticky top-0 z-10">
        {onBack && (
          <button onClick={onBack} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors">
            <ChevronLeft size={16} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Plant Hire</span>
        </div>
        <span className="text-slate-600 mx-1">›</span>
        <span className="text-sm text-slate-400">{PAGE_TITLE[view]}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar nav */}
        <nav className="w-52 shrink-0 border-r border-slate-800/80 bg-slate-900/40 py-4 hidden sm:block">
          <ul className="space-y-0.5 px-2">
            {NAV.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  onClick={() => { setView(id); setBookingAssetId(undefined); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    view === id
                      ? 'bg-cyan-500/15 text-cyan-300 font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                  }`}
                >
                  <Icon size={14} className={view === id ? 'text-cyan-400' : 'text-slate-500'} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile nav strip */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-900 border-t border-slate-800 flex overflow-x-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setView(id); setBookingAssetId(undefined); }}
              className={`flex flex-col items-center gap-1 px-4 py-3 shrink-0 text-xs transition-colors ${
                view === id ? 'text-cyan-400' : 'text-slate-500'
              }`}
            >
              <Icon size={16} />
              <span className="truncate max-w-[56px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 pb-20 sm:pb-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
