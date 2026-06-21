import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from './firebase';
import logo from './IMG_6089.png';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (ADMIN_EMAILS.length === 0 && import.meta.env.DEV) {
  ADMIN_EMAILS.push('adminbootstrap+cardswipers@example.com');
}

function NavIcon({ children }) {
  return <span className="w-5 h-5 inline-flex items-center justify-center">{children}</span>;
}

function SwipeDeckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function PostIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M12 5v14M5 12h14" />
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

function BinderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7z" />
      <path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h10" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="m6 8 6 5 6-5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M12 3 5.5 5.5v5.8c0 4.2 2.7 8 6.5 9.7 3.8-1.7 6.5-5.5 6.5-9.7V5.5z" />
      <path d="M9.5 12.5 11 14l3.5-4" />
    </svg>
  );
}

function PassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function InterestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 21c-.3 0-.5-.1-.7-.3l-6.2-6c-3.1-3-3.1-7.8-.1-10.8A7.2 7.2 0 0 1 12 5.2a7.2 7.2 0 0 1 6.9-1.3c3 3 3 7.8-.1 10.8l-6.1 6c-.2.2-.5.3-.7.3Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="m12 3.6 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.7-5 2.7.9-5.5-4-3.9 5.6-.8z" />
    </svg>
  );
}

const INITIAL_DECK = [
  {
    id: 1,
    title: 'Elly De La Cruz Chrome Rookie Auto',
    brand: 'Bowman',
    category: 'Sports Cards',
    imageEmoji: '⚾',
    detailLine: 'PSA 10 • Bowman Chrome • On-card auto',
    condition: 'PSA 10',
    owner: 'CollectorTexas99',
    lookingFor: 'High-end Pokemon TCG or $450 Trade Value',
    tradeValue: '$450',
    avgMarketValue: '$425',
    recentComps: '$410-$470',
    collectorRating: '4.9',
    completedTrades: 143,
    memberSince: '2024',
    location: 'Dallas, TX',
    trustLabel: 'Verified Collector',
    responseTime: 'Replies in under 1 hour',
    seekingTags: ['Pokemon TCG', 'Baseball autos', 'Slabs'],
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
    detailLine: 'Mint raw • Scarlet & Violet • Special Illustration Rare',
    owner: 'PaldeaMaster',
    lookingFor: 'Yu-Gi-Oh Retro formats or Vintage Topps Baseball',
    tradeValue: '$320',
    avgMarketValue: '$305',
    recentComps: '$290-$335',
    collectorRating: '4.8',
    completedTrades: 88,
    memberSince: '2023',
    location: 'Phoenix, AZ',
    trustLabel: 'Identity Verified',
    responseTime: 'Replies same day',
    seekingTags: ['Yu-Gi-Oh retro', 'Vintage Topps', 'Trade-up deals'],
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
    detailLine: 'PSA 8 • First Edition • Vintage grail',
    owner: 'KaibaCorpTrue',
    lookingFor: '1-for-1 sports grails or high-end soccer cards',
    tradeValue: '$1,150',
    avgMarketValue: '$1,090',
    recentComps: '$1,020-$1,180',
    collectorRating: '5.0',
    completedTrades: 212,
    memberSince: '2022',
    location: 'Miami, FL',
    trustLabel: 'Power Seller',
    responseTime: 'Usually replies in 30 min',
    seekingTags: ['Sports grails', 'High-end soccer', '1-for-1 swaps'],
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
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
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
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminActionUserId, setAdminActionUserId] = useState(null);
  const currentCard = deck[cardIndex] || null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthenticated(Boolean(user));
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let profileUnsubscribe = () => {};

    const ensureAndWatchUserProfile = async () => {
      if (!firebaseUser) {
        setCurrentUserProfile(null);
        setIsAdmin(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const configuredAdmin = ADMIN_EMAILS.includes((firebaseUser.email || '').toLowerCase());
      let bootstrapAdmin = false;

      if (!configuredAdmin && ADMIN_EMAILS.length === 0) {
        const adminCheckQuery = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
        const adminSnapshot = await getDocs(adminCheckQuery);
        bootstrapAdmin = adminSnapshot.empty;
      }

      const declaredAdmin = configuredAdmin || bootstrapAdmin;
      if (declaredAdmin) {
        setIsAdmin(true);
      }

      const existing = await getDoc(userRef);
      if (!existing.exists()) {
        await setDoc(userRef, {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          status: 'active',
          role: configuredAdmin || bootstrapAdmin ? 'admin' : 'user',
          settings: {},
          binderId: firebaseUser.uid,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        const payload = {
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (declaredAdmin && existing.data()?.role !== 'admin') {
          payload.role = 'admin';
        }
        await updateDoc(userRef, payload);
      }

      profileUnsubscribe = onSnapshot(userRef, (snapshot) => {
        const profile = snapshot.exists() ? snapshot.data() : null;
        if (!isMounted) return;
        setCurrentUserProfile(profile);
        setIsAdmin(Boolean(declaredAdmin || profile?.role === 'admin'));

        if (profile?.status === 'deactivated') {
          setAuthError('Your account has been deactivated. Contact support for assistance.');
          signOut(auth).catch(() => {});
        }
      });
    };

    ensureAndWatchUserProfile().catch((error) => {
      console.error('Failed to initialize user profile:', error);
      setAuthError('Unable to initialize account profile. Please refresh and try again.');
    });

    return () => {
      isMounted = false;
      profileUnsubscribe();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!isAdmin || currentTab !== 'admin') {
      setAdminUsers([]);
      setAdminUsersLoading(false);
      setAdminUsersError('');
      return;
    }

    setAdminUsersLoading(true);
    setAdminUsersError('');
    const usersQuery = query(collection(db, 'users'), limit(500));

    let unsubscribe = () => {};

    const loadUsers = async () => {
      try {
        const snapshot = await getDocs(usersQuery);
        const loadedUsers = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => {
            const aSec = a.createdAt?.seconds || 0;
            const bSec = b.createdAt?.seconds || 0;
            return bSec - aSec;
          });
        setAdminUsers(loadedUsers);
      } catch (error) {
        console.error('Failed loading users for admin:', error);
        setAdminUsersError('Unable to load users. Check Firestore rules and try again.');
      } finally {
        setAdminUsersLoading(false);
      }

      unsubscribe = onSnapshot(
        usersQuery,
        (snapshot) => {
          const loadedUsers = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => {
              const aSec = a.createdAt?.seconds || 0;
              const bSec = b.createdAt?.seconds || 0;
              return bSec - aSec;
            });
          setAdminUsers(loadedUsers);
        },
        (error) => {
          console.error('Failed loading users for admin snapshot:', error);
        }
      );
    };

    loadUsers();

    return () => unsubscribe();
  }, [isAdmin, currentTab]);

  useEffect(() => {
    if (currentTab === 'admin' && !(isAdmin || import.meta.env.DEV)) {
      setCurrentTab(isAuthenticated ? 'swipe' : 'landing');
    }
  }, [currentTab, isAdmin, isAuthenticated]);

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

    if (authMode === 'create' && authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match. Please enter the same password twice.');
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

  const handleGoogleAuth = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      setCurrentTab('swipe');
    } catch (error) {
      setAuthError(error?.message || 'Google sign-in failed.');
    }
  };

  const navigateToTab = (nextTab) => {
    if (!isAuthenticated) {
      setCurrentTab('landing');
      return;
    }
    if (nextTab === 'admin' && !(isAdmin || import.meta.env.DEV)) {
      setCurrentTab('swipe');
      return;
    }
    setCurrentTab(nextTab);
  };

  const handleToggleUserStatus = async (userRecord) => {
    if (!firebaseUser || userRecord.uid === firebaseUser.uid) return;

    const nextStatus = userRecord.status === 'deactivated' ? 'active' : 'deactivated';
    const confirmed = window.confirm(
      nextStatus === 'deactivated'
        ? `Deactivate ${userRecord.email || userRecord.uid}? They will be blocked from access.`
        : `Reactivate ${userRecord.email || userRecord.uid}?`
    );
    if (!confirmed) return;

    setAdminActionUserId(userRecord.uid);
    try {
      await updateDoc(doc(db, 'users', userRecord.uid), {
        status: nextStatus,
        deactivatedAt: nextStatus === 'deactivated' ? serverTimestamp() : null,
        deactivatedBy: nextStatus === 'deactivated' ? firebaseUser.uid : null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update user status:', error);
      setAdminUsersError('Failed to update account status. Please try again.');
    } finally {
      setAdminActionUserId(null);
    }
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
  const isCoreAppScreen = !isLandingScreen && !isAuthScreen;
  const canAccessAdmin = isAdmin || import.meta.env.DEV;
  const totalUsers = adminUsers.length;
  const activeUsers = adminUsers.filter((user) => user.status !== 'deactivated').length;
  const deactivatedUsers = adminUsers.filter((user) => user.status === 'deactivated').length;
  const filteredAdminUsers = adminUsers.filter((user) => {
    if (!adminSearch.trim()) return true;
    const queryText = adminSearch.toLowerCase();
    const haystack = `${user.email || ''} ${user.displayName || ''} ${user.uid || ''}`.toLowerCase();
    return haystack.includes(queryText);
  });

  return (
    <div className={`min-h-screen text-white font-sans flex flex-col justify-between relative overflow-hidden ${isLandingScreen || isAuthScreen ? 'bg-gradient-to-b from-[#0F1117] via-[#12151D] to-[#0F1117]' : 'bg-[#0B0F19]'}`}>
      {isLandingScreen && (
        <>
          <div className="absolute -top-36 -left-20 w-[28rem] h-[28rem] rounded-full bg-[#D72638]/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[24rem] h-[24rem] rounded-full bg-[#F5C542]/10 blur-3xl pointer-events-none" />
        </>
      )}
      {isAuthScreen && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(225,29,72,0.10), transparent 60%)' }} />
      )}

      <header className={`${isLandingScreen || isAuthScreen ? 'bg-black/75 border-white/10' : 'bg-[#111827]/95 border-white/10'} backdrop-blur-md border-b sticky top-0 z-50`}>
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

            {isAuthScreen && (
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="text-sm text-neutral-300 hover:text-white transition-colors"
                >
                  Support
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode((prev) => (prev === 'login' ? 'create' : 'login'));
                    setAuthError('');
                  }}
                  className="h-9 px-4 rounded-lg border border-white/15 hover:border-white/30 text-sm text-white/90 hover:text-white transition-colors"
                >
                  {authMode === 'login' ? 'Create Account' : 'Log In'}
                </button>
              </div>
            )}
            {isCoreAppScreen && isAuthenticated && (
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
                  onClick={() => setShowTermsOfService(true)}
                  className="text-[11px] text-neutral-300 hover:text-white underline underline-offset-2 mr-3"
                >
                  Terms of Service
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
          <div className="h-full flex flex-col justify-center items-center text-center px-4 py-10">
            <div className="w-full max-w-[520px] bg-[#171A22]/90 text-white rounded-2xl p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)] border border-white/[0.06] backdrop-blur-[20px]">
              <div className="space-y-2 text-left">
                <h1 className="text-[42px] leading-[1.04] font-bold tracking-[-0.04em] text-white">
                  {authMode === 'login' ? 'Welcome back' : 'Create your account'}
                </h1>
                <p className="text-sm text-[#9CA3AF]">
                  {authMode === 'login'
                    ? 'Trade confidently with verified collectors, real-time messaging, and secure transaction workflows.'
                    : 'Join thousands of collectors trading cards with confidence every day.'}
                </p>
              </div>

              <form onSubmit={handleAuthSubmit} className="mt-6 space-y-3 text-left">
                <div className="flex items-center gap-5 text-sm pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                      setAuthConfirmPassword('');
                    }}
                    className={`${authMode === 'login' ? 'text-white font-semibold' : 'text-[#9CA3AF] hover:text-white'} transition-colors`}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('create');
                      setAuthError('');
                      setAuthConfirmPassword('');
                    }}
                    className={`${authMode === 'create' ? 'text-white font-semibold' : 'text-[#9CA3AF] hover:text-white'} transition-colors`}
                  >
                    Create Account
                  </button>
                </div>

                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9CA3AF] focus:outline-none focus:border-white/20"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9CA3AF] focus:outline-none focus:border-white/20"
                />

                {authMode === 'create' && (
                  <input
                    type="password"
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9CA3AF] focus:outline-none focus:border-white/20"
                  />
                )}

                {authError && <p className="text-xs text-red-300">{authError}</p>}

                <button
                  type="submit"
                  className="w-full h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3B5C] to-[#DC2626] hover:from-[#ff4a68] hover:to-[#c71f1f] text-white text-sm font-semibold shadow-[0_12px_24px_rgba(255,45,85,0.18)] transition-all"
                >
                  {authMode === 'create' ? 'Create Account' : 'Log In'}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="w-full h-11 px-6 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/20 text-white text-sm font-semibold transition-colors"
                >
                  Continue with Google
                </button>
              </form>
            </div>

            <div className="text-center pt-5">
              <p className="text-xs text-[#9CA3AF] mb-2">Need help? Contact support@cardswipers.com</p>
              <button
                type="button"
                onClick={() => setCurrentTab('landing')}
                className="text-[11px] text-[#9CA3AF] hover:text-white underline underline-offset-2 mr-3"
              >
                Back to Landing
              </button>
              <button
                type="button"
                onClick={() => setShowTermsOfService(true)}
                className="text-[11px] text-[#9CA3AF] hover:text-white underline underline-offset-2 mr-3"
              >
                Terms of Service
              </button>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(true)}
                className="text-[11px] text-[#9CA3AF] hover:text-white underline underline-offset-2"
              >
                Privacy Policy
              </button>
              <p className="text-[10px] text-[#9CA3AF] mt-2">© 2026 CardSwipers. All rights reserved.</p>
            </div>
          </div>
        )}

        {currentTab === 'admin' && canAccessAdmin && (
          <div className="space-y-6 py-3 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Admin Management</h2>
                <p className="text-sm text-red-100">View user accounts, monitor totals, and manage account access.</p>
              </div>
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Search by email, name, or uid"
                className="w-full md:w-80 px-4 py-2.5 bg-red-950/70 border border-red-400/30 rounded-xl text-sm focus:outline-none focus:border-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-red-200">Users on Platform</p>
                <p className="text-3xl font-bold mt-2">{totalUsers}</p>
              </div>
              <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-red-200">Active Accounts</p>
                <p className="text-3xl font-bold mt-2">{activeUsers}</p>
              </div>
              <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-red-200">Deactivated Accounts</p>
                <p className="text-3xl font-bold mt-2">{deactivatedUsers}</p>
              </div>
            </div>

            {adminUsersError && (
              <div className="text-sm text-red-200 bg-red-900/40 border border-red-400/30 rounded-xl p-3">{adminUsersError}</div>
            )}

            <div className="bg-red-950/70 border border-red-400/30 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] uppercase tracking-wider text-red-200 border-b border-red-500/30 font-bold">
                <div className="col-span-4">User</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Created</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {adminUsersLoading ? (
                <div className="p-4 text-sm text-red-100">Loading users...</div>
              ) : filteredAdminUsers.length === 0 ? (
                <div className="p-4 text-sm text-red-100">No users found for the current filter.</div>
              ) : (
                filteredAdminUsers.map((userRecord) => {
                  const createdDate = userRecord.createdAt?.seconds
                    ? new Date(userRecord.createdAt.seconds * 1000).toLocaleDateString()
                    : 'N/A';
                  const status = userRecord.status || 'active';
                  const isSelf = userRecord.uid === firebaseUser?.uid;
                  const isProcessing = adminActionUserId === userRecord.uid;

                  return (
                    <div key={userRecord.uid || userRecord.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-red-500/20 items-center">
                      <div className="col-span-4 min-w-0">
                        <p className="font-semibold truncate">{userRecord.email || 'No email'}</p>
                        <p className="text-xs text-red-200 truncate">{userRecord.uid}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/20 uppercase">{userRecord.role || 'user'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className={`text-xs px-2 py-1 rounded-lg uppercase ${status === 'deactivated' ? 'bg-red-800/50 border border-red-300/30' : 'bg-emerald-800/40 border border-emerald-300/30'}`}>
                          {status}
                        </span>
                      </div>
                      <div className="col-span-2 text-xs text-red-100">{createdDate}</div>
                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(userRecord)}
                          disabled={isSelf || isProcessing}
                          className="text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSelf ? 'Current User' : isProcessing ? 'Saving...' : status === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {currentTab === 'swipe' && (
          <div className="h-full max-w-6xl mx-auto flex flex-col justify-between py-6">
            {currentCard ? (
              <div className="w-full grid xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] gap-6 items-start">
                <div className="space-y-5">
                  <div className="w-full min-h-[620px] bg-[#171923] border border-white/10 rounded-[32px] p-5 flex flex-col justify-between relative overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
                    <div className={`absolute inset-0 bg-gradient-to-br ${currentCard.cardColor} opacity-30 pointer-events-none`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.25))] pointer-events-none" />

                    {swipeFeedback === 'like' && (
                      <div className="absolute top-8 left-6 -rotate-12 border-4 border-emerald-400 text-emerald-400 font-black text-2xl px-3 py-1 rounded-xl uppercase tracking-wider z-20 pointer-events-none">
                        Interested
                      </div>
                    )}
                    {swipeFeedback === 'pass' && (
                      <div className="absolute top-8 right-6 rotate-12 border-4 border-[#E11D48] text-[#E11D48] font-black text-2xl px-3 py-1 rounded-xl uppercase tracking-wider z-20 pointer-events-none">
                        Pass
                      </div>
                    )}

                    <div className="flex justify-between items-center z-10 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-white/10 backdrop-blur-md text-[11px] font-bold px-3 py-1 rounded-full border border-white/15 uppercase tracking-wider text-white">
                          {currentCard.brand}
                        </span>
                        <span className="bg-emerald-500/12 text-emerald-300 text-[11px] font-bold px-3 py-1 rounded-full border border-emerald-400/20 uppercase tracking-wider">
                          {currentCard.trustLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="bg-[#E11D48] text-white text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                          {currentCard.condition}
                        </span>
                        <span className="bg-white/10 text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/15 tracking-wider">
                          {currentCard.tradeValue}
                        </span>
                      </div>
                    </div>

                    <div className="relative z-10 flex-1 flex items-center justify-center py-6">
                      <div className={`w-full max-w-[420px] min-h-[390px] bg-[#0F131C] border ${currentCard.borderColor} rounded-[28px] shadow-[0_18px_50px_rgba(0,0,0,0.45)] relative overflow-hidden`}>
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),transparent_25%,transparent_75%,rgba(255,255,255,0.05))]" />
                        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent" />
                        <div className="absolute top-4 right-4 text-[10px] uppercase tracking-[0.22em] text-white/60">
                          VERIFIED ASSET
                        </div>
                        <div className="h-full flex flex-col items-center justify-center px-8 pt-10 pb-8 text-center">
                          <div className="text-[8rem] leading-none drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]">{currentCard.imageEmoji}</div>
                          <div className="mt-5 space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">{currentCard.category}</p>
                            <h3 className="text-lg font-semibold text-white leading-tight max-w-[18rem] mx-auto">{currentCard.title}</h3>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="z-10 space-y-4 bg-gradient-to-t from-[#171923] via-[#171923]/92 to-transparent pt-4 rounded-xl">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-2 min-w-0">
                          <h2 className="text-[2rem] font-black tracking-[-0.04em] leading-tight">{currentCard.title}</h2>
                          <p className="text-sm text-white/70 font-medium">{currentCard.detailLine}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Trade Value</p>
                          <p className="text-2xl font-bold text-white">{currentCard.tradeValue}</p>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-3">
                        <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Average Market</p>
                          <p className="mt-1 text-base font-semibold">{currentCard.avgMarketValue}</p>
                        </div>
                        <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Recent Comps</p>
                          <p className="mt-1 text-base font-semibold">{currentCard.recentComps}</p>
                        </div>
                        <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Collector Rating</p>
                          <p className="mt-1 text-base font-semibold flex items-center gap-1.5"><StarIcon /> {currentCard.collectorRating}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 flex-wrap bg-[#0F131C] border border-white/10 rounded-2xl px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setViewingCollection(currentCard)}
                          className="text-sm text-white font-semibold hover:text-rose-300 transition-colors"
                        >
                          @{currentCard.owner} · View Binder ({(currentCard.collection || []).length})
                        </button>
                        <p className="text-sm text-white/65">Seeking: {currentCard.lookingFor}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => handleSwipe('pass')}
                      className="min-h-[68px] rounded-2xl bg-white/[0.04] border border-white/10 text-white shadow-lg hover:border-white/20 hover:bg-white/[0.06] transition-all px-4 py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 inline-flex items-center justify-center text-white/70"><PassIcon /></span>
                        <div>
                          <p className="font-semibold">Pass</p>
                          <p className="text-xs text-white/55">Skip this listing</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setViewingCollection(currentCard)}
                      className="min-h-[68px] rounded-2xl bg-white/[0.04] border border-white/10 text-white shadow-lg hover:border-white/20 hover:bg-white/[0.06] transition-all px-4 py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-400/20 inline-flex items-center justify-center text-amber-300"><BinderIcon /></span>
                        <div>
                          <p className="font-semibold">View Binder</p>
                          <p className="text-xs text-white/55">Inspect collector inventory</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleSwipe('like')}
                      className="min-h-[68px] rounded-2xl bg-gradient-to-b from-[#E11D48] to-[#BE123C] text-white shadow-[0_12px_24px_rgba(225,29,72,0.28)] hover:brightness-110 transition-all px-4 py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-white"><InterestIcon /></span>
                        <div>
                          <p className="font-semibold">Interested</p>
                          <p className="text-xs text-white/75">Record interest and keep moving</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
                    Pass skips the listing. View Binder opens the collector's inventory. Interested records that you'd trade for this card.
                  </div>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-24">
                  <div className="rounded-[28px] bg-[#111827] border border-white/10 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Collector Trust</p>
                        <h3 className="mt-2 text-2xl font-bold">{currentCard.owner}</h3>
                        <p className="text-sm text-white/55 mt-1">{currentCard.location}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/12 border border-emerald-400/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
                        {currentCard.trustLabel}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Rating</p>
                        <p className="mt-2 flex items-center gap-2 text-xl font-bold"><StarIcon /> {currentCard.collectorRating}</p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Completed Trades</p>
                        <p className="mt-2 text-xl font-bold">{currentCard.completedTrades}</p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Member Since</p>
                        <p className="mt-2 text-xl font-bold">{currentCard.memberSince}</p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Response Time</p>
                        <p className="mt-2 text-sm font-semibold leading-snug">{currentCard.responseTime}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] bg-[#111827] border border-white/10 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)] space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Marketplace View</p>
                      <h3 className="mt-2 text-xl font-bold">Why this card is worth reviewing</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3">
                        <span className="text-sm text-white/65">Trade Value</span>
                        <span className="font-semibold">{currentCard.tradeValue}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3">
                        <span className="text-sm text-white/65">Average Market Value</span>
                        <span className="font-semibold">{currentCard.avgMarketValue}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3">
                        <span className="text-sm text-white/65">Recent Comps</span>
                        <span className="font-semibold">{currentCard.recentComps}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-3">Seeking</p>
                      <div className="flex flex-wrap gap-2">
                        {(currentCard.seekingTags || []).map((tag) => (
                          <span key={tag} className="px-3 py-1.5 rounded-full bg-[#0F131C] border border-white/10 text-sm text-white/75">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#0F131C] border border-white/10 p-4">
                      <p className="text-sm font-semibold text-white">Expected next step</p>
                      <p className="mt-2 text-sm text-white/65">
                        Review trust signals, compare market value, open the binder if you need more context, then mark Interested if this collector looks like a fit.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20 space-y-4">
                <span className="text-5xl text-white/60"><SwipeDeckIcon /></span>
                <h3 className="text-xl font-bold">End of the Deck!</h3>
                <p className="text-sm text-white/65 max-w-xs">
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
      <footer className="bg-[#111827]/92 backdrop-blur-md border-t border-white/10 py-2 px-4 sticky bottom-0 z-50">
        <div className="max-w-6xl mx-auto">
        <nav className="flex justify-around items-center">
          <button
            onClick={() => {
              navigateToTab('swipe');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'swipe' ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
            type="button"
          >
            <NavIcon><SwipeDeckIcon /></NavIcon>
            <span>Swipe</span>
          </button>

          <button
            onClick={() => {
              navigateToTab('post');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'post' ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
            type="button"
          >
            <NavIcon><PostIcon /></NavIcon>
            <span>Post Card</span>
          </button>

          <button
            onClick={() => {
              navigateToTab('collection');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'collection' ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
            type="button"
          >
            <NavIcon><BinderIcon /></NavIcon>
            <span>Binder</span>
          </button>

          <button
            onClick={() => navigateToTab('messages')}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'messages' ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
            type="button"
          >
            <NavIcon><InboxIcon /></NavIcon>
            <span>Inbox</span>
          </button>

          {canAccessAdmin && (
            <button
              onClick={() => {
                navigateToTab('admin');
                setActiveChat(null);
              }}
              className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'admin' ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
              type="button"
            >
              <NavIcon><ShieldIcon /></NavIcon>
              <span>Admin</span>
            </button>
          )}
        </nav>
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="text-[11px] text-white/55 hover:text-white underline underline-offset-2 mr-3"
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setShowTermsOfService(true)}
            className="text-[11px] text-white/55 hover:text-white underline underline-offset-2 mr-3"
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacyPolicy(true)}
            className="text-[11px] text-white/55 hover:text-white underline underline-offset-2"
          >
            Privacy Policy
          </button>
          <p className="text-[10px] text-white/40 mt-2">© 2026 CardSwipers. All rights reserved.</p>
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

      {showTermsOfService && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white text-neutral-900 rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-700">Terms of Service</h2>
              <button
                type="button"
                onClick={() => setShowTermsOfService(false)}
                className="text-sm font-semibold text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <p className="text-sm leading-relaxed">
              CardSwipers and its affiliates are not responsible for losses, fraud, chargebacks, scams, or any damages
              arising from user-to-user trades, arrangements, or communications made through the platform.
            </p>
            <p className="text-sm leading-relaxed">
              By using CardSwipers, you acknowledge and accept all risks associated with every trade and interaction.
              Users are solely responsible for conducting their own due diligence before completing any trade.
            </p>
            <p className="text-sm leading-relaxed">
              CardSwipers does not facilitate payments, escrow, shipping, or transaction settlement between users.
              We strongly recommend caution and verification when engaging with other users from the platform.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
