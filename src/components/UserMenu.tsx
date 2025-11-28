import { useState, useEffect, useRef } from 'react';
import { CreditCard, Building2, ArrowLeftRight, LogOut, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAdmin } from '../lib/adminContext';

interface UserMenuProps {
  onLogout: () => void;
  onNavigateToBilling?: () => void;
  onNavigateToAccount?: () => void;
  onSwitchOrganisation?: () => void;
}

interface UserData {
  email: string;
  name?: string;
  initials: string;
  organisation: string;
  organisationCount: number;
}

export default function UserMenu({
  onLogout,
  onNavigateToBilling,
  onNavigateToAccount,
  onSwitchOrganisation,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userData, setUserData] = useState<UserData>({
    email: '',
    initials: 'U',
    organisation: 'PassiveFire',
    organisationCount: 1,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const { isMasterAdmin } = useAdmin();

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const email = user.email || '';
      const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
      const organisation = user.user_metadata?.organisation || 'PassiveFire';

      const initials = name
        ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : email.slice(0, 2).toUpperCase();

      setUserData({
        email,
        name,
        initials,
        organisation,
        organisationCount: 1,
      });
    }
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleMenuItemClick = (action?: () => void) => {
    setIsOpen(false);
    if (action) {
      action();
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleToggle}
        className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center font-semibold text-sm hover:bg-blue-600 transition-colors"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {userData.initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-3 z-50">
          <div className="px-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-primary text-white flex items-center justify-center font-semibold text-sm">
                {userData.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-0.5">{userData.organisation}</div>
                <div className="text-sm text-gray-900 truncate">{userData.email}</div>
              </div>
            </div>
          </div>

          <div className="py-2">
            {isMasterAdmin && (
              <button
                onClick={() => (window.location.href = '/admin')}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-purple-50 transition-colors text-left"
                tabIndex={0}
              >
                <Shield size={18} className="text-purple-600" />
                <span className="text-sm text-purple-600 font-medium">Admin Console</span>
              </button>
            )}

            {onNavigateToBilling && (
              <button
                onClick={() => handleMenuItemClick(onNavigateToBilling)}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMenuItemClick(onNavigateToBilling);
                  }
                }}
              >
                <CreditCard size={18} className="text-gray-600" />
                <span className="text-sm text-gray-900">Billing</span>
              </button>
            )}

            {onNavigateToAccount && (
              <button
                onClick={() => handleMenuItemClick(onNavigateToAccount)}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMenuItemClick(onNavigateToAccount);
                  }
                }}
              >
                <Building2 size={18} className="text-gray-600" />
                <span className="text-sm text-gray-900">Account</span>
              </button>
            )}

            {onSwitchOrganisation && (
              <button
                onClick={() => handleMenuItemClick(onSwitchOrganisation)}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMenuItemClick(onSwitchOrganisation);
                  }
                }}
              >
                <ArrowLeftRight size={18} className="text-gray-600" />
                <span className="text-sm text-gray-900 flex-1">Switch Organisation</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                  {userData.organisationCount}
                </span>
              </button>
            )}
          </div>

          <div className="border-t border-gray-100 pt-2">
            <button
              onClick={() => handleMenuItemClick(onLogout)}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 transition-colors text-left group"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleMenuItemClick(onLogout);
                }
              }}
            >
              <LogOut size={18} className="text-gray-600 group-hover:text-red-600 transition-colors" />
              <span className="text-sm text-gray-900 group-hover:text-red-600 transition-colors">Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
