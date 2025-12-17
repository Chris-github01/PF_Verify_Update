import React, { useState } from 'react';
import { Menu, X, Flame } from 'lucide-react';

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f1419] text-white">
      {/* Header */}
      <header className="fixed top-0 w-full bg-[#0f1419]/95 backdrop-blur-sm border-b border-slate-800 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2 text-xl font-bold">
              <Flame className="text-[#fd7e14]" size={28} />
              <span>PassiveFire <span className="text-[#fd7e14]">Verify+</span></span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="/" className="text-slate-300 hover:text-white transition">Home</a>
              <a href="/how-it-works" className="text-slate-300 hover:text-white transition">How It Works</a>
              <a href="/pricing" className="text-slate-300 hover:text-white transition">Pricing</a>
              <a href="/customers" className="text-slate-300 hover:text-white transition">Customers</a>
              <a href="/resources" className="text-slate-300 hover:text-white transition">Resources</a>
              <a href="/support" className="text-slate-300 hover:text-white transition">Support</a>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <a
                href="/login"
                className="px-4 py-2 text-sm font-medium text-white bg-[#007bff] rounded-lg hover:bg-[#0056b3] transition"
              >
                Sign In
              </a>
              <a
                href="/trial-signup"
                className="px-4 py-2 text-sm font-medium text-white bg-[#fd7e14] rounded-lg hover:bg-[#e86e0d] transition"
              >
                Book Demo
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-slate-800">
              <div className="flex flex-col gap-4">
                <a href="/" className="text-slate-300 hover:text-white transition py-2">Home</a>
                <a href="/how-it-works" className="text-slate-300 hover:text-white transition py-2">How It Works</a>
                <a href="/pricing" className="text-slate-300 hover:text-white transition py-2">Pricing</a>
                <a href="/customers" className="text-slate-300 hover:text-white transition py-2">Customers</a>
                <a href="/resources" className="text-slate-300 hover:text-white transition py-2">Resources</a>
                <a href="/support" className="text-slate-300 hover:text-white transition py-2">Support</a>
                <div className="flex flex-col gap-2 pt-4 border-t border-slate-800">
                  <a
                    href="/login"
                    className="px-4 py-2 text-sm font-medium text-center text-white bg-[#007bff] rounded-lg hover:bg-[#0056b3] transition"
                  >
                    Sign In
                  </a>
                  <a
                    href="/trial-signup"
                    className="px-4 py-2 text-sm font-medium text-center text-white bg-[#fd7e14] rounded-lg hover:bg-[#e86e0d] transition"
                  >
                    Book Demo
                  </a>
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Main Content */}
      <main className="pt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-[#0a0e13] border-t border-slate-800 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 text-xl font-bold mb-4">
                <Flame className="text-[#fd7e14]" size={28} />
                <span>PassiveFire <span className="text-[#fd7e14]">Verify+</span></span>
              </div>
              <p className="text-slate-400 text-sm max-w-md">
                The AI-powered platform that instantly audits passive fire quotes, finding scope gaps, missing systems, and hidden risks in seconds.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <div className="flex flex-col gap-2 text-sm text-slate-400">
                <a href="/how-it-works" className="hover:text-white transition">How It Works</a>
                <a href="/pricing" className="hover:text-white transition">Pricing</a>
                <a href="/customers" className="hover:text-white transition">Customers</a>
                <a href="/resources" className="hover:text-white transition">Resources</a>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <div className="flex flex-col gap-2 text-sm text-slate-400">
                <a href="/support" className="hover:text-white transition">Help Center</a>
                <a href="mailto:support@verifytrade.co.nz" className="hover:text-white transition">Contact Us</a>
                <a href="/privacy-policy" className="hover:text-white transition">Privacy Policy</a>
                <a href="/terms-of-service" className="hover:text-white transition">Terms of Service</a>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 text-center text-sm text-slate-500">
            <p>© 2025 PassiveFire Verify+. All rights reserved. Contact: support@verifytrade.co.nz</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
