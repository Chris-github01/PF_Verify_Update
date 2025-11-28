import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  isDataReady?: boolean;
}

export default function SplashScreen({ onComplete, isDataReady = true }: SplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    const duration = prefersReducedMotion ? 400 : 1800;

    const timer = setTimeout(() => {
      if (isDataReady) {
        onComplete();
      } else {
        setShowLoader(true);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [onComplete, isDataReady, prefersReducedMotion]);

  useEffect(() => {
    if (showLoader && isDataReady) {
      const delay = setTimeout(() => {
        onComplete();
      }, 300);
      return () => clearTimeout(delay);
    }
  }, [showLoader, isDataReady, onComplete]);

  const circuitVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 0.6,
      transition: { duration: 1.2, ease: [0.42, 0, 0.58, 1] as any }
    }
  };

  const bloomVariants = {
    hidden: { scale: 0.5, opacity: 0 },
    visible: {
      scale: 1.5,
      opacity: 0.3,
      transition: { duration: 1, ease: [0.16, 1, 0.3, 1] as any }
    }
  };

  const logoVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, delay: 0.2 }
    }
  };

  const taglineVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.8, delay: 0.8 }
    }
  };

  const containerVariants = {
    hidden: { opacity: 1 },
    exit: {
      opacity: 0,
      transition: { duration: 0.5, ease: [0.42, 0, 0.58, 1] as any }
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a1b3a 0%, #02040a 100%)'
      }}
      variants={containerVariants}
      initial="hidden"
      animate="hidden"
      exit="exit"
    >
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.4 }}
      >
        <defs>
          <linearGradient id="circuit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00eaff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0a1b3a" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {!prefersReducedMotion && (
          <>
            <motion.path
              d="M 100 100 L 300 100 L 300 200 L 500 200"
              stroke="url(#circuit-gradient)"
              strokeWidth="2"
              fill="none"
              variants={circuitVariants}
              initial="hidden"
              animate="visible"
            />
            <motion.path
              d="M 200 400 L 400 400 L 400 300 L 600 300"
              stroke="url(#circuit-gradient)"
              strokeWidth="2"
              fill="none"
              variants={circuitVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
            />
            <motion.path
              d="M 800 150 L 1000 150 L 1000 350 L 1200 350"
              stroke="url(#circuit-gradient)"
              strokeWidth="2"
              fill="none"
              variants={circuitVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.1 }}
            />
            <motion.path
              d="M 900 500 L 1100 500 L 1100 600"
              stroke="url(#circuit-gradient)"
              strokeWidth="2"
              fill="none"
              variants={circuitVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.3 }}
            />
          </>
        )}
      </svg>

      <div className="relative z-10 flex flex-col items-center">
        {!prefersReducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(0, 234, 255, 0.4) 0%, transparent 70%)',
              width: '400px',
              height: '400px',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
            variants={bloomVariants}
            initial="hidden"
            animate="visible"
          />
        )}

        <motion.div
          className="relative text-center"
          variants={logoVariants}
          initial="hidden"
          animate="visible"
        >
          <h1 className="text-6xl font-bold text-white mb-2" style={{ fontWeight: 600 }}>
            <span className="cyan-glow">BurnRatePro</span>
          </h1>
          <h2 className="text-2xl font-semibold text-gray-200 mb-8" style={{ fontWeight: 600 }}>
            PassiveFire Verify+
          </h2>

          <motion.p
            className="text-lg text-gray-300 italic"
            variants={taglineVariants}
            initial="hidden"
            animate="visible"
          >
            {!prefersReducedMotion ? (
              <TypeOnText text="Revolutionizing Project Validation" delay={0.8} />
            ) : (
              'Revolutionizing Project Validation'
            )}
          </motion.p>
        </motion.div>

        {showLoader && !isDataReady && (
          <motion.div
            className="mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
          </motion.div>
        )}
      </div>

      <motion.footer
        className="absolute bottom-8 text-center text-xs text-gray-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <p>© P & R Consulting Ltd • 2025</p>
      </motion.footer>
    </motion.div>
  );
}

function TypeOnText({ text, delay }: { text: string; delay: number }) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      if (currentIndex < text.length) {
        const timer = setTimeout(() => {
          setDisplayedText(prev => prev + text[currentIndex]);
          setCurrentIndex(prev => prev + 1);
        }, 50);
        return () => clearTimeout(timer);
      }
    }, delay * 1000);

    return () => clearTimeout(startTimer);
  }, [currentIndex, text, delay]);

  return <>{displayedText}</>;
}
