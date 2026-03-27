import { useState, useEffect } from 'react';
import {
  Shield, Layers, Flag, GitBranch, ScrollText,
  Zap, FlaskConical, ChevronLeft, Menu, X,
  Activity, ShieldAlert, FileSearch, PlaySquare,
  BookOpen, Lightbulb, Fingerprint, LayoutTemplate
} from 'lucide-react';
import { getAdminRole } from '../../lib/shadow/shadowAccess';
import type { AdminRole } from '../../types/shadow';

const NAV_CORE = [
  { label: 'Shadow Home', href: '/shadow', icon: Shield, exact: true },
  { label: 'Modules', href: '/shadow/modules', icon: Layers },
  { label: 'Feature Flags', href: '/shadow/admin/flags', icon: Flag },
  { label: 'Versions', href: '/shadow/admin/versions', icon: GitBranch },
  { label: 'Audit Log', href: '/shadow/admin/audit-log', icon: ScrollText },
  { label: 'Rollout Manager', href: '/shadow/admin/rollout', icon: Zap },
  { label: 'Kill Switch', href: '/shadow/admin/kill-switch', icon: FlaskConical },
];

const NAV_INTELLIGENCE = [
  { label: 'Failure Taxonomy', href: '/shadow/intelligence/failures', icon: ShieldAlert },
  { label: 'Benchmarks', href: '/shadow/intelligence/benchmarks', icon: PlaySquare },
  { label: 'Review Queue', href: '/shadow/intelligence/queue', icon: BookOpen },
  { label: 'Recommendations', href: '/shadow/intelligence/recommendations', icon: Lightbulb },
  { label: 'Supplier Intelligence', href: '/shadow/intelligence/suppliers', icon: Fingerprint },
  { label: 'Template Families', href: '/shadow/intelligence/template-families', icon: LayoutTemplate },
];

interface Props {
  children: React.ReactNode;
}

export default function ShadowLayout({ children }: Props) {
  const location = { pathname: window.location.pathname };
  const [role, setRole] = useState<AdminRole | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    getAdminRole().then(setRole);
  }, []);

  function isActive(href: string, exact?: boolean) {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col
        transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Header */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Shadow Admin</div>
            <div className="text-xs text-amber-400 font-medium">
              {role === 'god_mode' ? 'God Mode' : 'Internal Admin'}
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_CORE.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${active
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }
                `}
              >
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-amber-400' : ''}`} />
                {item.label}
              </a>
            );
          })}

          <div className="pt-3 pb-1">
            <div className="flex items-center gap-2 px-3 mb-1">
              <Activity className="w-3 h-3 text-gray-600" />
              <span className="text-[10px] font-semibold tracking-widest text-gray-600 uppercase">Intelligence</span>
            </div>
            {NAV_INTELLIGENCE.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                    ${active
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }
                  `}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-amber-400' : ''}`} />
                  {item.label}
                </a>
              );
            })}
          </div>
        </nav>

        {/* Back to app */}
        <div className="p-3 border-t border-gray-800">
          <a
            href="/app/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to App
          </a>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="lg:hidden h-14 flex items-center gap-3 px-4 border-b border-gray-800 bg-gray-900">
          <button onClick={() => setMobileOpen(true)} className="text-gray-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Shadow Admin</span>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
