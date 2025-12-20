import React, { useState, useEffect } from 'react';

interface AppShellProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
}

export function AppShell({ children, sidebar, topBar }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('sidebarCollapsed');
      setSidebarCollapsed(saved === 'true');
    };

    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange);

    // Poll for changes (for same-tab updates)
    const interval = setInterval(handleStorageChange, 100);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {sidebar}

      <div className={`flex flex-col bg-slate-950 transition-all duration-200 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {topBar}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
