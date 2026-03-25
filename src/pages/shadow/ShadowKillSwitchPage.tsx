import ShadowLayout from '../../components/shadow/ShadowLayout';
import KillSwitchPanel from '../../components/shadow/KillSwitchPanel';
import { AlertTriangle } from 'lucide-react';

export default function ShadowKillSwitchPage() {
  return (
    <ShadowLayout>
      <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white">Kill Switch Panel</h1>
            <p className="text-gray-400 text-sm mt-0.5">Emergency module override — forces all traffic to live version instantly</p>
          </div>

          <div className="bg-amber-950/40 border border-amber-800 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-300 mb-1">Use with care</div>
              <p className="text-xs text-amber-400/80">
                Activating a kill switch immediately disables all shadow and beta routing for that module.
                All traffic is forced to the stable live version. This takes effect instantly with no deploy required.
              </p>
            </div>
          </div>

          <KillSwitchPanel />
      </div>
    </ShadowLayout>
  );
}
