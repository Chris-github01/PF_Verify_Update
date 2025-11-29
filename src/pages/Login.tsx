import { useState } from 'react';
import { Shield, Mail, Lock, Chrome, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

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
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'azure') => {
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === 'google' ? 'google' : 'azure',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Social login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Shield className="text-white" size={24} />
            </div>
            <span className="text-2xl font-bold text-slate-50">PassiveFire Verify+</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-50 mb-2">
            {isSignUp ? 'Create your account' : 'Sign in to PassiveFire Verify+'}
          </h1>
          <p className="text-slate-400">
            {isSignUp ? 'Get started with your free trial' : 'Welcome back! Please enter your details'}
          </p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700/50 p-8">
          {!isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => handleSocialLogin('google')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Chrome size={20} className="text-slate-300" />
                  <span className="text-sm font-medium text-slate-300">Google</span>
                </button>
                <button
                  onClick={() => handleSocialLogin('azure')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                    <path d="M0 0h11v11H0z" fill="#f25022"/>
                    <path d="M12 0h11v11H12z" fill="#00a4ef"/>
                    <path d="M0 12h11v11H0z" fill="#ffb900"/>
                    <path d="M12 12h11v11H12z" fill="#7fba00"/>
                  </svg>
                  <span className="text-sm font-medium text-slate-300">Microsoft</span>
                </button>
              </div>

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

            {!isSignUp && (
              <div className="pt-3 border-t border-slate-800">
                <a href="/admin" className="text-sm text-slate-500 hover:text-slate-300">
                  Enterprise / Admin login →
                </a>
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
