import { useState } from 'react';
import { Play, Mail } from 'lucide-react';

interface HeroVideoProps {
  onBookDemo: () => void;
}

export default function HeroVideo({ onBookDemo }: HeroVideoProps) {
  const [iframeError, setIframeError] = useState(false);

  const handleIframeError = () => {
    setIframeError(true);
  };

  const openVimeoVideo = () => {
    window.open('https://vimeo.com/1148392322', '_blank');
  };

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

          {/* Video Container */}
          <div className="relative bg-black">
            {!iframeError ? (
              <div className="relative pb-[56.25%] h-0">
                <iframe
                  src="https://player.vimeo.com/video/1148392322"
                  className="absolute top-0 left-0 w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  onError={handleIframeError}
                  title="Verify+ — Commercial & Compliance Platform Overview"
                  loading="lazy"
                />
              </div>
            ) : (
              // Fallback Poster with Play Button
              <div
                className="relative w-full cursor-pointer group"
                style={{ paddingTop: '56.25%' }}
                onClick={openVimeoVideo}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/30 transition-colors">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                      <Play size={32} className="text-white ml-1" fill="currentColor" />
                    </div>
                  </div>

                  {/* Placeholder Content */}
                  <div className="text-center z-10 px-4">
                    <Shield className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 text-orange-500" />
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Verify+ Platform Demo</h3>
                    <p className="text-sm sm:text-base text-slate-400">Click to watch the full demonstration</p>
                  </div>
                </div>
              </div>
            )}
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
              Built for contractors, QS teams, engineers, and delivery managers across NZ & Australia.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shield icon component for fallback
function Shield({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}
