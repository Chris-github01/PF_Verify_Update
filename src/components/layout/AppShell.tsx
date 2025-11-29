import React from 'react';

interface AppShellProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
}

export function AppShell({ children, sidebar, topBar }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      {sidebar}

      <div className="flex-1 flex flex-col bg-slate-950">
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
