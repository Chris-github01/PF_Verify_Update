import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  title?: string;
  message?: string;
  onGoToDashboard?: () => void;
}

export default function AccessDenied({
  title = "You don't have access to this area",
  message = "This page is only available to organisation owners and admins. You can still manage your own projects and quotes.",
  onGoToDashboard,
}: AccessDeniedProps) {
  const handleGoToDashboard = () => {
    if (onGoToDashboard) {
      onGoToDashboard();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-amber-600" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-3">{title}</h1>
        <p className="text-slate-600 mb-8 leading-relaxed">{message}</p>

        <button
          onClick={handleGoToDashboard}
          className="inline-flex items-center justify-center rounded-lg bg-[#0A66C2] px-6 py-3 text-sm font-semibold text-white shadow hover:bg-[#0952A0] transition"
        >
          Go to project dashboard
        </button>
      </div>
    </div>
  );
}
