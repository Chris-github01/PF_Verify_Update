import { useState } from 'react';
import { Shield, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ShadowLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.session) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      const userId = data.session.user.id;

      const { data: adminCheck, error: adminError } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', userId)
        .in('role', ['god_mode', 'internal_admin'])
        .limit(1)
        .maybeSingle();

      if (adminError || !adminCheck) {
        await supabase.auth.signOut();
        setError('Your account does not have shadow admin access.');
        setLoading(false);
        return;
      }

      localStorage.setItem('shadow_admin_verified', userId);
      window.location.replace('/shadow');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
            <Shield className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Shadow Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Internal access only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-colors"
              placeholder="admin@verifytrade.co.nz"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800/60 rounded-lg px-3.5 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/30 disabled:cursor-not-allowed text-gray-900 font-semibold text-sm rounded-lg px-4 py-2.5 transition-colors mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-900/40 border-t-gray-900 rounded-full animate-spin" />
                Verifying access...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Sign in to Shadow
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-700 mt-6">
          Restricted area. Unauthorised access is prohibited.
        </p>
      </div>
    </div>
  );
}
