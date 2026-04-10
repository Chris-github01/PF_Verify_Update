import { AlertTriangle } from 'lucide-react';

export default function DevBanner() {
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-semibold tracking-wide">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>Development Environment – Not Production</span>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
    </div>
  );
}
