import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, FlaskConical } from 'lucide-react';

export default function Header() {
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/dev/quote-intelligence', label: 'Quote Intelligence', dev: true },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-700/60 px-6 py-0 flex items-center justify-between h-16 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-orange-500" />
          <span className="text-white font-bold text-lg tracking-tight">
            VerifyTrade
          </span>
          <span className="text-slate-400 font-light text-lg">Next</span>
        </div>

        <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold px-2 py-0.5 rounded-full tracking-widest uppercase">
          <FlaskConical className="w-3 h-3" />
          NEXT
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              className={[
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800',
              ].join(' ')}
            >
              {link.dev && (
                <span className="inline-block bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider">
                  DEV
                </span>
              )}
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
