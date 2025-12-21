import { Mail } from 'lucide-react';

interface HeroVideoProps {
  onBookDemo: () => void;
}

export default function HeroVideo({ onBookDemo }: HeroVideoProps) {
  return (
    <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
      {/* Cinematic SaaS Card */}
      <div className="relative">
        {/* Subtle Radial Glow */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-orange-500/10 via-red-500/10 to-orange-500/10 blur-3xl opacity-30" />

        {/* Card Container */}
        <div className="relative bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
          {/* Card Header */}
          <div className="px-6 sm:px-8 py-6 border-b border-slate-700/50">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              See Verify+ in Action
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Trade scope analysis, compliance checks, and handover documentation — reduced from days to minutes.
            </p>
          </div>

          {/* Video Player */}
          <div className="relative bg-black overflow-hidden">
            <video
              controls
              playsInline
              preload="auto"
              style={{
                width: '100%',
                borderRadius: '18px',
                background: '#000',
                boxShadow: '0 30px 80px rgba(0,0,0,0.45)'
              }}
            >
              <source
                src="https://pub-4a052394260a4d93950fdab2b1ce9caa.r2.dev/verifyplus-explained.mp4"
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
          </div>

          {/* CTA Buttons */}
          <div className="px-6 sm:px-8 py-6 sm:py-8 bg-gradient-to-br from-slate-900/50 to-slate-800/50">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
              <button
                onClick={onBookDemo}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transform hover:scale-[1.02]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Book a Demo
              </button>
              <a
                href="mailto:admin@verifytrade.co.nz"
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 bg-slate-700/50 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all border border-slate-600/50 hover:border-slate-500"
              >
                <Mail size={20} />
                Email Us
              </a>
            </div>

            {/* Trust Line */}
            <p className="text-center text-xs sm:text-sm text-slate-500">
              Built for main contractors, QS teams, and delivery managers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
