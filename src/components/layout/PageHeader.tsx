import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/60 border border-slate-800/80">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-xs md:text-sm text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
