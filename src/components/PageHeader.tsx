interface MetadataChip {
  label: string;
  value: string;
}

interface PageHeaderProps {
  title: string;
  subtitle: string;
  metadata?: MetadataChip[];
}

export default function PageHeader({ title, subtitle, metadata }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <h1 className="text-[30px] font-bold text-slate-100 mb-1">{title}</h1>
        <p className="text-[14px] text-slate-400">{subtitle}</p>
      </div>

      {metadata && metadata.length > 0 && (
        <div className="flex items-center gap-2">
          {metadata.map((chip, index) => (
            <div
              key={index}
              className="px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700 text-xs"
            >
              <span className="text-slate-400">{chip.label}:</span>{' '}
              <span className="font-medium text-slate-100">{chip.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
