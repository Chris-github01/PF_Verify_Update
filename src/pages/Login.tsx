import { useState, useEffect } from 'react';
import { Shield, Mail, Lock, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    const adminMode = localStorage.getItem('verifytrade_admin_login');
    if (adminMode === 'true') {
      setIsAdminMode(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setError('Check your email for the confirmation link');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        localStorage.removeItem('verifytrade_admin_login');

        if (isAdminMode) {
          window.location.href = '/admin';
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const redirectPath = isAdminMode ? '/admin' : '/';

      // Get the redirect URL - ensure it works in all environments
      const redirectUrl = window.location.origin + redirectPath;

      console.log('🔵 [Google OAuth] Starting login flow', {
        redirectUrl,
        isAdminMode,
        origin: window.location.origin
      });

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        },
      });

      if (error) {
        console.error('❌ [Google OAuth] Error:', error);
        throw error;
      }

      console.log('✅ [Google OAuth] Redirect initiated');
      localStorage.removeItem('verifytrade_admin_login');
    } catch (err: any) {
      console.error('❌ [Google OAuth] Failed:', err);
      setError(err.message || 'Google login failed. Please ensure Google OAuth is configured in Supabase.');
      setLoading(false);
    }
  };

  const handleAdminLoginClick = () => {
    localStorage.setItem('verifytrade_admin_login', 'true');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <img
              src="/verifytrade-new-logo.png"
              alt="VerifyTrade"
              className="h-10 w-auto object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-slate-50 mb-2">
            {isSignUp ? 'Create your account' : isAdminMode ? 'Admin Center Login' : 'Sign in to VerifyTrade'}
          </h1>
          <p className="text-slate-400">
            {isSignUp ? 'Get started with your free trial' : isAdminMode ? 'Access the Enterprise Admin Console' : 'Welcome back! Please enter your details'}
          </p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700/50 p-8">
          {/* Google login temporarily hidden */}
          {false && !isSignUp && (
            <>
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 border border-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mb-6"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-sm font-medium text-slate-700">Continue with Google</span>
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-900/50 text-slate-500">or</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-100 placeholder-slate-500"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-100 placeholder-slate-500"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            {!isSignUp && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500" />
                  <span className="text-slate-400">Remember me</span>
                </label>
                <a href="#forgot" className="text-blue-400 hover:text-blue-300 font-medium">
                  Forgot password?
                </a>
              </div>
            )}

            {error && (
              <div className={`text-sm p-3 rounded-lg ${
                error.includes('email')
                  ? 'text-green-800 bg-green-50 border border-green-200'
                  : 'text-red-800 bg-red-50 border border-red-200'
              }`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 shadow-lg"
            >
              {loading ? (
                'Please wait...'
              ) : (
                <>
                  {isSignUp ? 'Create account' : 'Continue'}
                  <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            {!isAdminMode && (
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                }}
                className="text-sm text-slate-400 hover:text-slate-100 font-medium"
              >
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <span className="text-blue-400 hover:text-blue-300">
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </span>
              </button>
            )}

            {!isSignUp && !isAdminMode && (
              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={handleAdminLoginClick}
                  className="text-sm text-slate-500 hover:text-slate-300"
                >
                  Enterprise / Admin login →
                </button>
              </div>
            )}

            {isAdminMode && (
              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={() => {
                    localStorage.removeItem('verifytrade_admin_login');
                    window.location.reload();
                  }}
                  className="text-sm text-slate-500 hover:text-slate-300"
                >
                  ← Back to regular login
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          By continuing, you agree to our{' '}
          <a href="#terms" className="text-slate-400 hover:text-slate-300 underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#privacy" className="text-slate-400 hover:text-slate-300 underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
