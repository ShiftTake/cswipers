import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import logo from './IMG_6089.png';

const INITIAL_DECK = [
  {
    id: 1,
    title: 'Elly De La Cruz Chrome Rookie Auto',
    brand: 'Bowman',
    category: 'Sports Cards',
    imageEmoji: '⚾',
    condition: 'PSA 10',
    owner: 'CollectorTexas99',
    lookingFor: 'High-end Pokemon TCG or $450 Trade Value',
    cardColor: 'from-amber-500/20 to-red-600/20',
    borderColor: 'border-amber-500/40',
    collection: [
      { id: 101, title: 'Shohei Ohtani Refractor', emoji: '⚾' },
      { id: 102, title: 'Mike Trout Rookie', emoji: '⚾' },
      { id: 103, title: 'Charizard Base Set Shadowless', emoji: '🔥' }
    ]
  },
  {
    id: 2,
    title: 'Charizard ex Special Illustration Rare',
    brand: 'Pokemon TCG',
    category: 'TCG',
    condition: 'Raw / Mint',
    imageEmoji: '🔥',
    owner: 'PaldeaMaster',
    lookingFor: 'Yu-Gi-Oh Retro formats or Vintage Topps Baseball',
    cardColor: 'from-red-600/20 to-orange-500/20',
    borderColor: 'border-red-500/40',
    collection: [
      { id: 201, title: 'Mew ex SIR', emoji: '🔮' },
      { id: 202, title: 'Pikachu Van Gogh', emoji: '⚡' }
    ]
  },
  {
    id: 3,
    title: 'Blue-Eyes White Dragon (First Edition)',
    brand: 'Yu-Gi-Oh!',
    category: 'TCG',
    condition: 'PSA 8',
    imageEmoji: '🐉',
    owner: 'KaibaCorpTrue',
    lookingFor: '1-for-1 sports grails or high-end soccer cards',
    cardColor: 'from-blue-600/20 to-neutral-700/20',
    borderColor: 'border-blue-400/40',
    collection: [{ id: 301, title: 'Dark Magician Girl', emoji: '🧙‍♀️' }]
  }
];

export default function CardSwipersLanding() {
  const [currentTab, setCurrentTab] = useState('landing');
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [deck, setDeck] = useState(INITIAL_DECK);
  const [cardIndex, setCardIndex] = useState(0);
  const [viewingCollection, setViewingCollection] = useState(null);
  const [swipeFeedback, setSwipeFeedback] = useState(null);
  const [myCollection, setMyCollection] = useState([
    { id: 101, name: '1st Edition Blue-Eyes White Dragon', brand: 'Yu-Gi-Oh!', condition: 'PSA 9' },
    { id: 102, name: '2024 Shohei Ohtani Topps Chrome', brand: 'Topps', condition: 'Raw' }
  ]);
  const [messages, setMessages] = useState([
    { id: 1, user: 'PalletTownTrades', lastMsg: 'Hey! Down to trade Charizard for your Blue-Eyes?', unread: true },
    { id: 2, user: 'VintageVault', lastMsg: 'Is that price firm on the Ohtani?', unread: false }
  ]);
  const [activeChat, setActiveChat] = useState(null);

  const [newCard, setNewCard] = useState({ title: '', brand: 'Topps', condition: 'Raw', lookingFor: '' });
  const [chatDraft, setChatDraft] = useState('');
  const currentCard = deck[cardIndex] || null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(Boolean(user));
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const cardsQuery = query(collection(db, 'cards'), orderBy('createdAt', 'desc'), limit(50));
        const messagesQuery = query(collection(db, 'messages'), orderBy('updatedAt', 'desc'), limit(50));

        const [cardsSnapshot, messagesSnapshot] = await Promise.all([
          getDocs(cardsQuery),
          getDocs(messagesQuery)
        ]);

        if (!cardsSnapshot.empty) {
          const loadedCards = cardsSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data.name,
              brand: data.brand,
              condition: data.condition
            };
          });
          setMyCollection(loadedCards);
        }

        if (!messagesSnapshot.empty) {
          const loadedMessages = messagesSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              user: data.user,
              lastMsg: data.lastMsg,
              unread: Boolean(data.unread)
            };
          });
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Failed to load Firestore data:', error);
      }
    };

    loadPersistedData();
  }, []);

  const handleSwipe = async (direction) => {
    if (!currentCard) return;

    setSwipeFeedback(direction);

    try {
      await addDoc(collection(db, 'swipes'), {
        cardId: currentCard.id,
        title: currentCard.title,
        direction,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to persist swipe:', error);
    }

    window.setTimeout(() => {
      setSwipeFeedback(null);
      setCardIndex((prevIndex) => (prevIndex < deck.length - 1 ? prevIndex + 1 : 0));
    }, 400);
  };

  const handlePostCard = async (e) => {
    e.preventDefault();
    if (!newCard.title) return;

    let createdId = Date.now();

    try {
      const docRef = await addDoc(collection(db, 'cards'), {
        name: newCard.title,
        brand: newCard.brand,
        condition: newCard.condition,
        lookingFor: newCard.lookingFor,
        createdAt: serverTimestamp()
      });
      createdId = docRef.id;
    } catch (error) {
      console.error('Failed to persist posted card:', error);
    }

    setMyCollection((prevCollection) => [
      { id: createdId, name: newCard.title, brand: newCard.brand, condition: newCard.condition },
      ...prevCollection
    ]);

    setNewCard({ title: '', brand: 'Topps', condition: 'Raw', lookingFor: '' });
    setCurrentTab('swipe');
  };

  const handleSendMessage = async () => {
    const trimmedMessage = chatDraft.trim();
    if (!activeChat || !trimmedMessage) return;

    let messageId = Date.now();

    try {
      const docRef = await addDoc(collection(db, 'messages'), {
        user: activeChat.user,
        lastMsg: trimmedMessage,
        unread: false,
        updatedAt: serverTimestamp()
      });
      messageId = docRef.id;
    } catch (error) {
      console.error('Failed to persist message:', error);
    }

    setMessages((prevMessages) => [
      { id: messageId, user: activeChat.user, lastMsg: trimmedMessage, unread: false },
      ...prevMessages.filter((msg) => msg.user !== activeChat.user)
    ]);
    setActiveChat((prevChat) => (prevChat ? { ...prevChat, lastMsg: trimmedMessage, unread: false } : prevChat));
    setChatDraft('');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (!authEmail || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }

    try {
      if (authMode === 'create') {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setCurrentTab('swipe');
    } catch (error) {
      setAuthError(error?.message || 'Authentication failed.');
    }
  };

  const navigateToTab = (nextTab) => {
    if (!isAuthenticated) {
      setCurrentTab('landing');
      return;
    }
    setCurrentTab(nextTab);
  };

  const handleHowItWorksClick = () => {
    const scroll = () => {
      const section = document.getElementById('how-it-works');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    if (currentTab !== 'landing') {
      setCurrentTab('landing');
      window.setTimeout(scroll, 50);
      return;
    }

    scroll();
  };

  const isLandingScreen = currentTab === 'landing';
  const isAuthScreen = currentTab === 'auth';

  return (
    <div className={`min-h-screen text-white font-sans flex flex-col justify-between relative overflow-hidden ${isLandingScreen ? 'bg-gradient-to-b from-[#101010] via-[#151515] to-[#1b1b1b]' : 'bg-gradient-to-b from-red-700 via-red-800 to-red-950'}`}>
      {isLandingScreen && (
        <>
          <div className="absolute -top-36 -left-20 w-[28rem] h-[28rem] rounded-full bg-[#D72638]/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[24rem] h-[24rem] rounded-full bg-[#F5C542]/10 blur-3xl pointer-events-none" />
        </>
      )}

      <header className={`${isLandingScreen ? 'bg-black/75 border-white/10' : 'bg-red-700/95 border-red-300/40'} backdrop-blur-md border-b sticky top-0 z-50`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src={logo} alt="CardSwipers logo" className="w-9 h-9 rounded-lg shadow-md shadow-red-600/30 object-cover" />
            <span
              className="text-[1.72rem] font-extrabold tracking-[0.005em] italic text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.35)]"
              style={{ transform: 'skewX(-7deg)', fontFamily: '"Montserrat", sans-serif' }}
            >
              CardSwipers
            </span>
          </div>

          <div className="flex items-center">
            {isLandingScreen && (
              <>
                <nav className="hidden md:flex items-center gap-8 mr-8 text-sm text-neutral-300">
                  <button type="button" onClick={handleHowItWorksClick} className="hover:text-white transition-colors">How It Works</button>
                </nav>
                {!isAuthenticated ? (
                  <div className="flex items-center gap-5">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError('');
                        setCurrentTab('auth');
                      }}
                      className="text-sm text-neutral-300 hover:text-white transition-colors"
                    >
                      Log In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('create');
                        setAuthError('');
                        setCurrentTab('auth');
                      }}
                      className="h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3040] to-[#D72638] hover:from-[#ff3f4d] hover:to-[#c92031] text-white text-sm font-semibold shadow-[0_10px_30px_rgba(215,38,56,0.35)] transition-all"
                    >
                      Start Trading
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('swipe')}
                    className="h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3040] to-[#D72638] text-white text-sm font-semibold shadow-[0_10px_30px_rgba(215,38,56,0.35)]"
                  >
                    Enter App
                  </button>
                )}
              </>
            )}

            {!isLandingScreen && isAuthScreen && (
              <button
                type="button"
                onClick={() => {
                  setAuthError('');
                  setCurrentTab('landing');
                }}
                className="text-xs px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 mr-2"
              >
                Back
              </button>
            )}
            {!isLandingScreen && isAuthenticated && (
              <button
                type="button"
                onClick={async () => {
                  await signOut(auth);
                  setCurrentTab('landing');
                }}
                className="text-xs px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25"
              >
                Log Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow w-full px-4 sm:px-6 lg:px-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto w-full">
        {currentTab === 'landing' && (
          <div className="w-full px-4 py-16 sm:py-24">
            <section className="min-h-[calc(100vh-130px)] flex flex-col justify-center items-center text-center">
              <div className="w-full max-w-5xl">
                <p className="text-[#F5C542] text-[13px] tracking-[0.18em] uppercase font-semibold">
                  Trusted By Serious Collectors
                </p>
                <h1 className="text-4xl sm:text-6xl font-bold tracking-[-0.04em] leading-[1.05] mt-8 text-[#F8F8F8] max-w-4xl mx-auto">
                  Trade cards with people you can trust.
                </h1>
                <p className="text-base sm:text-lg text-neutral-300 mt-8 max-w-2xl mx-auto leading-relaxed font-normal">
                  Match with verified collectors, chat instantly, and close trades with confidence.
                </p>

                <div className="mt-10 flex items-center justify-center">
                  {authLoading ? (
                    <button
                      type="button"
                      className="h-11 px-6 rounded-xl bg-neutral-700 text-neutral-200 text-sm font-semibold cursor-default"
                    >
                      Checking session...
                    </button>
                  ) : isAuthenticated ? (
                    <button
                      type="button"
                      onClick={() => setCurrentTab('swipe')}
                      className="h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3040] to-[#D72638] hover:from-[#ff3f4d] hover:to-[#c92031] text-white text-sm font-semibold shadow-[0_10px_30px_rgba(215,38,56,0.35)] transition-all"
                    >
                      Enter App
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('create');
                        setAuthError('');
                        setCurrentTab('auth');
                      }}
                      className="h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3040] to-[#D72638] hover:from-[#ff3f4d] hover:to-[#c92031] text-white text-sm font-semibold shadow-[0_10px_30px_rgba(215,38,56,0.35)] transition-all"
                    >
                      Start Trading
                    </button>
                  )}
                </div>

                <p className="text-sm text-neutral-400 mt-8">
                  Trusted by collectors trading: Pokemon • Sports Cards • TCG • Graded Slabs
                </p>

                <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-[#F8F8F8]">10,000+</p>
                    <p className="text-sm text-neutral-400 mt-1">Collectors</p>
                  </div>
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-[#F8F8F8]">250,000+</p>
                    <p className="text-sm text-neutral-400 mt-1">Cards Traded</p>
                  </div>
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-[#F8F8F8]">98%</p>
                    <p className="text-sm text-neutral-400 mt-1">Match Satisfaction</p>
                  </div>
                </div>
              </div>
            </section>

            <section id="how-it-works" className="max-w-5xl mx-auto pt-20 pb-10 scroll-mt-28">
              <div className="text-center">
                <p className="text-[#F5C542] text-[12px] tracking-[0.18em] uppercase font-semibold">How It Works</p>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#F8F8F8] mt-4">
                  Three steps to your next great trade.
                </h2>
                <p className="text-neutral-300 mt-4 max-w-2xl mx-auto">
                  CardSwipers helps collectors discover each other quickly, verify intent, and close higher-quality deals.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 text-left">
                  <p className="text-[#F5C542] text-xs font-semibold tracking-widest">01</p>
                  <h3 className="text-lg font-semibold mt-3">Swipe Verified Listings</h3>
                  <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                    Browse collector cards in your categories and swipe based on condition, value, and trade fit.
                  </p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 text-left">
                  <p className="text-[#F5C542] text-xs font-semibold tracking-widest">02</p>
                  <h3 className="text-lg font-semibold mt-3">Chat Instantly</h3>
                  <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                    Start direct trade conversations with matched collectors and align on details in minutes.
                  </p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 text-left">
                  <p className="text-[#F5C542] text-xs font-semibold tracking-widest">03</p>
                  <h3 className="text-lg font-semibold mt-3">Close Better Deals</h3>
                  <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                    Compare offers, review binders, and execute trades confidently with transparent collector context.
                  </p>
                </div>
              </div>

              <div className="text-center pt-10">
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="text-[11px] text-neutral-300 hover:text-white underline underline-offset-2 mr-3"
                >
                  Help
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrivacyPolicy(true)}
                  className="text-[11px] text-neutral-300 hover:text-white underline underline-offset-2"
                >
                  Privacy Policy
                </button>
                <p className="text-[10px] text-neutral-400 mt-2">© 2026 CardSwipers. All rights reserved.</p>
              </div>
            </section>
          </div>
        )}

        {currentTab === 'auth' && (
          <div className="h-full flex flex-col justify-center items-center text-center px-4 space-y-6 py-8">
            <div className="w-full max-w-md bg-gradient-to-b from-red-500 to-red-700 text-white rounded-3xl p-6 shadow-2xl shadow-red-900/40 border border-red-200/40">
              <img src={logo} alt="CardSwipers logo" className="w-24 h-24 rounded-2xl shadow-xl shadow-red-900/40 mx-auto object-cover" />
              <div className="space-y-3 mt-4">
                <h1 className="text-4xl font-black tracking-tight text-white">Access CardSwipers</h1>
                <p className="text-sm text-red-100 max-w-xs mx-auto">Log in or create your account to start trading.</p>
              </div>

              <form onSubmit={handleAuthSubmit} className="mt-6 space-y-3 text-left">
                <div className="flex rounded-xl bg-white/20 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg ${authMode === 'login' ? 'bg-white text-red-700' : 'text-white'}`}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('create');
                      setAuthError('');
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg ${authMode === 'create' ? 'bg-white text-red-700' : 'text-white'}`}
                  >
                    Create Account
                  </button>
                </div>

                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-4 py-3 rounded-xl bg-white text-neutral-900 placeholder-neutral-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-3 rounded-xl bg-white text-neutral-900 placeholder-neutral-500 focus:outline-none"
                />

                {authError && <p className="text-xs text-red-100">{authError}</p>}

                <button
                  type="submit"
                  className="w-full py-3 bg-white text-red-700 hover:bg-red-100 font-bold rounded-2xl shadow-lg transition-colors"
                >
                  {authMode === 'create' ? 'Create Account' : 'Log In'}
                </button>
              </form>

              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentTab('landing')}
                  className="text-[11px] text-red-100 hover:text-white underline underline-offset-2 mr-3"
                >
                  Back to Landing
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrivacyPolicy(true)}
                  className="text-[11px] text-red-100 hover:text-white underline underline-offset-2"
                >
                  Privacy Policy
                </button>
                <p className="text-[10px] text-red-200 mt-2">© 2026 CardSwipers. All rights reserved.</p>
              </div>
            </div>
          </div>
        )}

        {currentTab === 'swipe' && (
          <div className="h-full max-w-2xl mx-auto flex flex-col justify-between items-center py-4">
            {currentCard ? (
              <div className="w-full space-y-6">
                <div className="w-full h-[440px] bg-red-950/80 border border-red-300/30 rounded-[32px] p-4 flex flex-col justify-between relative overflow-hidden shadow-xl">
                  <div className={`absolute inset-0 bg-gradient-to-b ${currentCard.cardColor} opacity-40 pointer-events-none`} />

                  {swipeFeedback === 'like' && (
                    <div className="absolute top-8 left-6 -rotate-12 border-4 border-emerald-400 text-emerald-400 font-black text-2xl px-3 py-1 rounded-xl uppercase tracking-wider z-20 pointer-events-none">
                      Match Trading
                    </div>
                  )}
                  {swipeFeedback === 'pass' && (
                    <div className="absolute top-8 right-6 rotate-12 border-4 border-[#E50914] text-[#E50914] font-black text-2xl px-3 py-1 rounded-xl uppercase tracking-wider z-20 pointer-events-none">
                      Pass
                    </div>
                  )}

                  <div className="flex justify-between items-center z-10">
                    <span className="bg-white/20 backdrop-blur-md text-[11px] font-bold px-3 py-1 rounded-full border border-white/30 uppercase tracking-wider text-white">
                      {currentCard.brand}
                    </span>
                    <span className="bg-[#E50914] text-white text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                      {currentCard.condition}
                    </span>
                  </div>

                  <div className={`w-44 h-60 mx-auto bg-red-900/80 border ${currentCard.borderColor} rounded-2xl flex flex-col items-center justify-center shadow-2xl relative z-10`}>
                    <span className="text-6xl animate-pulse">{currentCard.imageEmoji}</span>
                    <div className="absolute bottom-3 text-[10px] uppercase tracking-widest text-red-200 font-bold">
                      Verified Asset
                    </div>
                  </div>

                  <div className="z-10 space-y-1 bg-gradient-to-t from-red-950 via-red-950/80 to-transparent p-2 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setViewingCollection(currentCard)}
                      className="text-xs text-red-200 font-semibold hover:text-white underline underline-offset-2"
                    >
                      @{currentCard.owner} • View Binder ({(currentCard.collection || []).length})
                    </button>
                    <h2 className="text-xl font-black truncate">{currentCard.title}</h2>
                    <p className="text-xs text-red-100 font-medium leading-relaxed truncate">
                      <span className="text-white font-bold">ISO:</span> {currentCard.lookingFor}
                    </p>
                  </div>
                </div>

                <div className="flex justify-center items-center space-x-6">
                  <button
                    onClick={() => handleSwipe('pass')}
                    className="w-14 h-14 rounded-full bg-red-950 border border-red-400/40 text-red-200 font-bold text-xl shadow-lg hover:scale-105 active:scale-95 transition-transform"
                    type="button"
                  >
                    ✕
                  </button>
                  <button
                    onClick={() => setViewingCollection(currentCard)}
                    className="w-12 h-12 rounded-full bg-red-950 border border-red-400/40 text-amber-300 font-bold text-lg shadow-lg hover:scale-105 active:scale-95 transition-transform"
                    type="button"
                  >
                    📖
                  </button>
                  <button
                    onClick={() => handleSwipe('like')}
                    className="w-14 h-14 rounded-full bg-[#E50914] text-white font-bold text-xl shadow-lg shadow-red-600/20 hover:scale-105 active:scale-95 transition-transform"
                    type="button"
                  >
                    ❤️
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20 space-y-4">
                <span className="text-5xl">🃏</span>
                <h3 className="text-xl font-bold">End of the Deck!</h3>
                <p className="text-sm text-red-100 max-w-xs">
                  No more collectors matching your filters in your radius. Try expanding your search options.
                </p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'post' && (
          <div className="space-y-6 py-2 max-w-3xl mx-auto">
            <div>
              <h2 className="text-2xl font-black">List a Card</h2>
              <p className="text-xs text-red-100">Add an asset to your binder to start matching trades.</p>
            </div>

            <form onSubmit={handlePostCard} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-red-100 uppercase">Card Identity</label>
                <input
                  type="text"
                  placeholder="e.g., 2018 Shohei Ohtani Rookie Card"
                  value={newCard.title}
                  onChange={(e) => setNewCard({ ...newCard, title: e.target.value })}
                  className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-100 uppercase">Brand/Publisher</label>
                  <select
                    value={newCard.brand}
                    onChange={(e) => setNewCard({ ...newCard, brand: e.target.value })}
                    className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                  >
                    <option>Topps</option>
                    <option>Bowman</option>
                    <option>Panini</option>
                    <option>Pokemon</option>
                    <option>Yu-Gi-Oh!</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-100 uppercase">Card Condition</label>
                  <select
                    value={newCard.condition}
                    onChange={(e) => setNewCard({ ...newCard, condition: e.target.value })}
                    className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                  >
                    <option>Raw / Mint</option>
                    <option>PSA 10 Gem Mint</option>
                    <option>PSA 9 Mint</option>
                    <option>BGS 9.5 Pristine</option>
                    <option>SGC 10</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-red-100 uppercase">In Search Of (ISO)</label>
                <textarea
                  placeholder="What collectibles do you want in exchange?"
                  value={newCard.lookingFor}
                  onChange={(e) => setNewCard({ ...newCard, lookingFor: e.target.value })}
                  className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm resize-none"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-[#E50914] hover:bg-red-700 font-bold rounded-2xl shadow-lg shadow-red-600/10 transition-colors text-sm mt-4"
              >
                Publish Asset to Feed
              </button>
            </form>
          </div>
        )}

        {currentTab === 'collection' && (
          <div className="space-y-6 py-2 max-w-4xl mx-auto">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">My Trading Binder</h2>
                <p className="text-xs text-red-100">Your public inventory up for trade.</p>
              </div>
              <button onClick={() => setCurrentTab('post')} className="bg-[#E50914] text-white text-xs font-bold px-3 py-2 rounded-xl" type="button">
                + Add
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {myCollection.map((card) => (
                <div
                  key={card.id}
                  className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4 flex flex-col justify-between h-40 relative group"
                >
                  <div className="absolute top-2 right-2 text-xs bg-white/20 px-2 py-0.5 rounded-md text-red-100 font-mono scale-90">
                    {card.condition}
                  </div>
                  <div className="text-3xl mt-2">🃏</div>
                  <div>
                    <h4 className="font-bold text-sm leading-tight truncate">{card.name}</h4>
                    <p className="text-[11px] text-[#E50914] font-medium mt-0.5">{card.brand}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'messages' && (
          <div className="space-y-4 py-2 h-full flex flex-col max-w-3xl mx-auto">
            {!activeChat ? (
              <>
                <div>
                  <h2 className="text-2xl font-black">Trade Proposals</h2>
                  <p className="text-xs text-red-100">Mutual swiped matches waiting for offers.</p>
                </div>

                  <div className="divide-y divide-red-700/40">
                  {messages.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => {
                        setActiveChat(chat);
                        setMessages((prevMessages) =>
                          prevMessages.map((msg) => (msg.id === chat.id ? { ...msg, unread: false } : msg))
                        );
                      }}
                      className="py-4 flex items-center justify-between cursor-pointer group hover:bg-red-900/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-red-950 border border-red-400/30 flex items-center justify-center font-bold text-sm text-red-200">
                          {chat.user[0]}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm flex items-center">
                            {chat.user}
                            {chat.unread && <span className="w-1.5 h-1.5 bg-[#E50914] rounded-full ml-2"></span>}
                          </h4>
                          <p className="text-xs text-red-100 truncate max-w-[220px] mt-0.5">{chat.lastMsg}</p>
                        </div>
                      </div>
                      <span className="text-xs text-red-200">➔</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-red-600/40">
                  <button onClick={() => setActiveChat(null)} className="text-red-200 text-sm hover:text-white" type="button">
                    ◀ Back
                  </button>
                  <h3 className="font-bold text-base">Chatting with @{activeChat.user}</h3>
                </div>

                <div className="flex-grow bg-red-900/20 rounded-2xl p-4 flex flex-col justify-end space-y-3 min-h-[300px]">
                  <div className="bg-red-950 border border-red-400/30 p-3 rounded-2xl rounded-bl-none max-w-[80%] text-xs self-start">
                    {activeChat.lastMsg}
                  </div>
                  <div className="bg-[#E50914] text-white p-3 rounded-2xl rounded-br-none max-w-[80%] text-xs self-end font-medium">
                    Hey! Checked out your binder. Definitely down to figure out a deal.
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a trade offer..."
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    className="flex-grow p-3 bg-red-950 border border-red-400/30 rounded-xl text-xs focus:outline-none"
                  />
                  <button className="bg-[#E50914] px-4 rounded-xl text-xs font-bold" type="button" onClick={handleSendMessage}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {viewingCollection && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[55] p-4 flex flex-col justify-between">
          <div className="max-w-4xl w-full mx-auto">
            <div className="flex justify-between items-center border-b border-neutral-700 pb-4 mb-4">
              <div>
                <span className="text-xs uppercase tracking-widest text-[#E50914] font-bold">Collector Showcase</span>
                <h3 className="text-xl font-black">@{viewingCollection.owner}'s Binder</h3>
              </div>
              <button
                onClick={() => setViewingCollection(null)}
                className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white"
                type="button"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-300 mb-4">
              Swiping right in this view proposes an all-inclusive trade match to this collector.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto pr-1">
              <div className="bg-neutral-900 border-2 border-amber-500/40 rounded-xl p-3 flex flex-col justify-between space-y-4">
                <span className="text-3xl pt-2">{viewingCollection.imageEmoji}</span>
                <div>
                  <h4 className="text-xs font-bold text-white line-clamp-1">{viewingCollection.title}</h4>
                  <p className="text-[10px] text-neutral-400">{viewingCollection.brand}</p>
                </div>
              </div>

              {(viewingCollection.collection || []).map((item) => (
                <div key={item.id} className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 flex flex-col justify-between space-y-4">
                  <span className="text-3xl pt-2">{item.emoji}</span>
                  <div>
                    <h4 className="text-xs font-bold text-white line-clamp-1">{item.title}</h4>
                    <p className="text-[10px] text-neutral-400">Inventory item</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="max-w-4xl w-full mx-auto pt-4">
            <button
              onClick={() => {
                setViewingCollection(null);
                handleSwipe('like');
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs tracking-wider uppercase"
              type="button"
            >
              Propose Bulk Swap Deal Match
            </button>
          </div>
        </div>
      )}

      {currentTab !== 'landing' && currentTab !== 'auth' && (
      <footer className="bg-red-950/90 backdrop-blur-md border-t border-red-500/30 py-2 px-4 sticky bottom-0 z-50">
        <div className="max-w-6xl mx-auto">
        <nav className="flex justify-around items-center">
          <button
            onClick={() => {
              navigateToTab('swipe');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'swipe' ? 'text-white' : 'text-red-200'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">🎴</span>
            <span>Swipe</span>
          </button>

          <button
            onClick={() => {
              navigateToTab('post');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'post' ? 'text-white' : 'text-red-200'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">📤</span>
            <span>Post Card</span>
          </button>

          <button
            onClick={() => {
              navigateToTab('collection');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'collection' ? 'text-white' : 'text-red-200'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">🗂️</span>
            <span>Binder</span>
          </button>

          <button
            onClick={() => navigateToTab('messages')}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'messages' ? 'text-white' : 'text-red-200'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">💬</span>
            <span>Inbox</span>
          </button>
        </nav>
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="text-[11px] text-red-200 hover:text-white underline underline-offset-2 mr-3"
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacyPolicy(true)}
            className="text-[11px] text-red-200 hover:text-white underline underline-offset-2"
          >
            Privacy Policy
          </button>
          <p className="text-[10px] text-red-300 mt-2">© 2026 CardSwipers. All rights reserved.</p>
        </div>
        </div>
      </footer>
      )}

      {showPrivacyPolicy && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white text-neutral-900 rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-700">Privacy Policy</h2>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(false)}
                className="text-sm font-semibold text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <p className="text-sm leading-relaxed">
              CardSwipers collects account details, trade listings, and in-app messages to operate the platform.
              We do not sell your personal information. Data is used only for authentication, matching, and product
              improvement.
            </p>
            <p className="text-sm leading-relaxed">
              By continuing, you agree to data processing required for account security and trade functionality.
            </p>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white text-neutral-900 rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-700">Help Center</h2>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-sm font-semibold text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <p className="text-sm leading-relaxed">
              Need help with your account, listings, or matches? Start by checking your profile details and making sure
              your card posts include clear condition notes.
            </p>
            <p className="text-sm leading-relaxed">
              For direct support, email help@cardswipers.com and include your account email plus a short issue
              summary.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
