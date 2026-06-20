import React, { useState } from 'react';
import './firebase';

export default function CardSwipersLanding() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      // Integrate with your waitlist backend here
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-red-600 selection:text-white">
      
      {/* HEADER / NAV */}
      <header className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Logo container inspired by IMG_6089.jpg */}
          <div className="w-10 h-10 bg-[#E50914] rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
            <span className="text-white font-black italic text-lg tracking-tighter">CS</span>
          </div>
          <span className="text-xl font-bold tracking-tight">
            card<span className="text-[#E50914]">swipers</span>.com
          </span>
        </div>
        <div>
          <a 
            href="#waitlist" 
            className="bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-5 rounded-full transition-all text-sm backdrop-blur-sm"
          >
            Join Waitlist
          </a>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="max-w-7xl mx-auto px-6 pt-12 pb-24 grid lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Column: Copy & Form */}
        <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
          <div className="inline-flex items-center space-x-2 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-[#E50914] tracking-wide uppercase">
            🚀 The Future of Card Trading
          </div>
          
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-tight">
            Match. Chat. <br />
            <span className="bg-gradient-to-r from-[#E50914] to-red-500 bg-clip-text text-transparent">
              Swipe Your Next Grail.
            </span>
          </h1>
          
          <p className="text-lg text-neutral-400 max-w-xl mx-auto lg:mx-0 leading-relaxed">
            Whether you hunt for shiny **Pokémon**, chase **Topps** and **Bowman** baseball rookies, or stack **Yu-Gi-Oh!** stables—CardSwipers brings the thrill of matchmaking to your collection. 
          </p>

          {/* Waitlist Form */}
          <div id="waitlist" className="max-w-md mx-auto lg:mx-0 pt-4">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  required
                  placeholder="Enter your email for early access"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-grow px-5 py-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:border-[#E50914] transition-colors text-white placeholder-neutral-500"
                />
                <button
                  type="submit"
                  className="bg-[#E50914] hover:bg-red-700 active:scale-95 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-red-600/30 whitespace-nowrap"
                >
                  Get Early Access
                </button>
              </form>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl text-center font-medium">
                🎉 You're on the list! We'll ping you when we launch.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Mockup (Tinder Card Mechanic) */}
        <div className="lg:col-span-5 flex justify-center relative">
          {/* Subtle glow effect behind the card */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-amber-500 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>

          {/* Simulated App Screen Container */}
          <div className="w-[340px] h-[580px] bg-neutral-900 border-4 border-neutral-800 rounded-[40px] shadow-2xl relative p-4 flex flex-col justify-between overflow-hidden">
            
            {/* Top Bar inside App Mockup */}
            <div className="flex justify-between items-center px-2 pt-1">
              <span className="text-neutral-500 text-xs font-semibold">CardSwipers App</span>
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-neutral-700 rounded-full"></div>
                <div className="w-2 h-2 bg-neutral-700 rounded-full"></div>
              </div>
            </div>

            {/* The Swipeable Card Layer */}
            <div className="relative flex-grow my-4 rounded-2xl overflow-hidden border border-neutral-800 shadow-xl group">
              {/* Placeholder image for a trading card */}
              <div className="absolute inset-0 bg-neutral-800 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-700 via-neutral-900 to-neutral-950 flex flex-col justify-between p-4">
                
                {/* Brand tag inside card */}
                <div className="self-end bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10">
                  BOWMAN CHROME
                </div>

                {/* Simulated Card Graphic Centerpiece */}
                <div className="w-40 h-56 mx-auto bg-gradient-to-br from-amber-400/20 to-red-500/20 border border-amber-400/40 rounded-xl flex flex-col items-center justify-center relative shadow-inner">
                  <div className="absolute top-2 left-2 text-[8px] text-amber-400 font-mono">1st Edition</div>
                  <span className="text-5xl">⚾</span>
                  <div className="mt-4 text-xs font-bold tracking-widest text-amber-400">ROOKIE AUTO</div>
                </div>

                {/* Card Title Details */}
                <div className="space-y-1">
                  <h3 className="text-lg font-bold leading-tight">Elly De La Cruz</h3>
                  <p className="text-xs text-neutral-400">Looking for: High-end Pokémon TCG or cash</p>
                </div>
              </div>
            </div>

            {/* Swipe Actions Buttons Layout */}
            <div className="flex justify-center items-center space-x-4 pb-2">
              <button type="button" className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-red-500 hover:scale-105 transition-transform text-lg">
                ✕
              </button>
              <button type="button" className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-amber-400 hover:scale-105 transition-transform text-sm">
                ⭐
              </button>
              <button type="button" className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400 hover:scale-105 transition-transform text-lg">
                ❤️
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* BRAND MARQUEE / FOOTER */}
      <footer className="border-t border-neutral-900 bg-neutral-950/50 py-12">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-6">
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">
            Supported Categories & Collectibles
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-sm font-medium text-neutral-400">
            <span>Pokémon TCG</span>
            <span>Topps Baseball</span>
            <span>Bowman Prospects</span>
            <span>Panini Basketball</span>
            <span>Yu-Gi-Oh!</span>
            <span>Magic: The Gathering</span>
          </div>
          <p className="text-xs text-neutral-600 pt-4">
            &copy; {new Date().getFullYear()} CardSwipers. All rights reserved. Brand names are trademarks of their respective owners.
          </p>
        </div>
      </footer>

    </div>
  );
}
