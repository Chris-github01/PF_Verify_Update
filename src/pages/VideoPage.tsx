import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ExternalLink, Play } from 'lucide-react';

export default function VideoPage() {
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [showIframe, setShowIframe] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIframeBlocked(true);
      setShowIframe(false);
      fallbackButtonRef.current?.focus();
    }, 1200);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleIframeLoad = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIframeBlocked(false);
  };

  const openVimeoVideo = () => {
    window.open('https://vimeo.com/1148392322', '_blank', 'noopener,noreferrer');
  };

  const goBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-slate-900/50 to-slate-950"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 sm:mb-8 transition-colors group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium">Back to home</span>
        </button>

        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Verify+ Explained
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto">
            Commercial clarity before construction starts.
          </p>
          <p className="text-sm text-slate-500 mt-4">
            Built for main contractors, QS teams, and delivery managers.
          </p>
        </div>

        <div className="relative bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
          <div className="relative bg-black">
            {showIframe && !iframeBlocked ? (
              <div className="relative pb-[56.25%] h-0">
                <iframe
                  src="https://player.vimeo.com/video/1148392322?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1"
                  className="absolute top-0 left-0 w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                  allowFullScreen
                  onLoad={handleIframeLoad}
                  onError={() => {
                    setIframeBlocked(true);
                    setShowIframe(false);
                  }}
                  title="Verify+ Explained"
                />
              </div>
            ) : iframeBlocked ? (
              <div className="relative pb-[56.25%] h-0">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-40 h-40 bg-orange-500/20 rounded-full blur-3xl" />
                  </div>

                  <div className="relative text-center px-6 py-8 max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-orange-500/10 flex items-center justify-center border-2 border-orange-500/30">
                      <Play size={32} className="text-orange-500 ml-1" />
                    </div>

                    <h3 className="text-2xl font-bold text-white mb-3">
                      Video Player Blocked
                    </h3>
                    <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                      Your browser or environment is blocking embedded video. Click below to watch on Vimeo directly.
                    </p>

                    <button
                      ref={fallbackButtonRef}
                      onClick={openVimeoVideo}
                      className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transform hover:scale-105"
                    >
                      <ExternalLink size={20} />
                      Open on Vimeo
                    </button>

                    <p className="mt-4 text-xs text-slate-500">
                      Opens in a new tab
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative pb-[56.25%] h-0">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 sm:px-8 py-6 bg-gradient-to-br from-slate-900/50 to-slate-800/50 border-t border-slate-700/50">
            <button
              onClick={openVimeoVideo}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-white font-medium rounded-lg transition-all border border-slate-600/50 hover:border-slate-500"
            >
              <ExternalLink size={18} />
              Watch on Vimeo
            </button>

            <div className="mt-4 text-center">
              <p className="text-sm text-slate-500">
                Duration: 2:03 • Commercial clarity before construction starts
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-400 mb-4">
            Ready to transform your tender analysis?
          </p>
          <a
            href="mailto:admin@verifytrade.co.nz"
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors shadow-lg"
          >
            Book a Demo
          </a>
        </div>
      </div>
    </div>
  );
}
