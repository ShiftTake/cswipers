import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  updateProfile,
  signOut
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocFromCache,
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import logo from './IMG_6089.png';
import heroCards from './ChatGPT Image Jun 22, 2026, 07_46_56 AM.png';
import swipeDummyCard from './Screenshot 2026-06-21 123904.png';
import AdminPanel from './Admin';

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

const INITIAL_DECK = [
  {
    id: 1,
    title: 'Ungraded Dummy Card Listing',
    brand: 'Demo Card',
    category: 'Unrated / Ungraded',
    imageUrl: swipeDummyCard,
    imageEmoji: '🃏',
    detailLine: 'Ungraded sample listing used to preview the swipe experience',
    condition: 'Ungraded',
    owner: 'DemoCollector',
    lookingFor: 'Collectors who want to preview the feature',
    tradeValue: '$0',
    memberSince: '2026',
    location: 'Demo Mode',
    responseTime: 'Preview only',
    seekingTags: ['Dummy data', 'Preview only', 'Ungraded'],
    cardColor: 'from-neutral-600/20 to-slate-700/20',
    borderColor: 'border-white/20',
    collection: [
      { id: 101, title: 'Preview Item 1', emoji: '🃏' }
    ]
  }
];

const PUBLISHERS = [
  { label: 'Sports', options: ['Topps', 'Bowman', 'Panini', 'Upper Deck'] },
  {
    label: 'TCG / Gaming',
    options: [
      'Pokemon',
      'Yu-Gi-Oh!',
      'Magic: The Gathering (MTG)',
      'Disney Lorcana',
      'One Piece TCG',
      'Flesh and Blood',
      'Weiss Schwarz'
    ]
  },
  { label: 'Other', options: ['Other / Non-Sports'] }
];

const GRADING_COMPANIES = ['Raw (Ungraded)', 'PSA', 'BGS (Beckett)', 'SGC', 'CGC'];

const NUMERIC_GRADES = [
  '10 Gem Mint',
  '10 Pristine / Black Label',
  '9.5 Mint+',
  '9 Mint',
  '8 Near Mint-Mint',
  '7 Near Mint',
  '6 Excellent-Mint',
  '5 Excellent',
  '4 Very Good',
  '3 Good',
  '2 Fair',
  '1 Poor'
];

const RAW_CONDITIONS = [
  'Near Mint - Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played / Damaged'
];

const ONBOARDING_INTERESTS = [
  'sports cards',
  'pokemon',
  'magic',
  'yu-gi-oh',
  'one piece',
  'hockey',
  'basketball',
  'baseball',
  'football',
  'soccer',
  'vintage',
  'modern',
  'graded only',
  'raw cards',
  'autographs',
  'memorabilia'
];

const ONBOARDING_INTENTS = ['buying', 'selling', 'trading', 'all three'];

const ONBOARDING_PRICE_RANGES = [
  { label: 'Under $50', value: [0, 50] },
  { label: '$50-$250', value: [50, 250] },
  { label: '$250-$1,000', value: [250, 1000] },
  { label: '$1,000-$5,000', value: [1000, 5000] },
  { label: '$5,000+', value: [5000, 999999] }
];

const ONBOARDING_PRIORITIES = [
  'rookie cards',
  'psa 10',
  'autographs',
  'patches',
  'vintage',
  'investment potential',
  'pc additions',
  'low pop reports'
];

const INTEREST_TYPES = ['Interested', 'Want Trade', 'Want Purchase', 'Want More Info'];

const normalizeTag = (value) => String(value || '').toLowerCase().trim();

const parseDollarValue = (value) => {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const scoreCardForUser = (card, profile, likedCards = [], successfulMatches = []) => {
  let score = 0;
  const interests = (profile?.interests || []).map(normalizeTag);
  const priorities = (profile?.priorities || []).map(normalizeTag);
  const intent = normalizeTag(profile?.intent);
  const priceRange = Array.isArray(profile?.priceRange) && profile.priceRange.length === 2 ? profile.priceRange : null;

  const category = normalizeTag(card.category || card.brand);
  const cardTags = [
    normalizeTag(card.brand),
    normalizeTag(card.category),
    ...(card.seekingTags || []).map(normalizeTag),
    normalizeTag(card.condition),
    normalizeTag(card.title)
  ];

  if (interests.some((interest) => category.includes(interest) || cardTags.some((tag) => tag.includes(interest)))) {
    score += 50;
  }

  if (priceRange) {
    const cardValue = parseDollarValue(card.tradeValue || card.value || card.avgMarketValue);
    if (cardValue >= priceRange[0] && cardValue <= priceRange[1]) {
      score += 30;
    }
  }

  if (priorities.some((priority) => cardTags.some((tag) => tag.includes(priority)))) {
    score += 20;
  }

  if (likedCards.some((liked) => normalizeTag(liked.brand) === normalizeTag(card.brand))) {
    score += 40;
  }

  if (successfulMatches.some((matched) => normalizeTag(matched.brand) === normalizeTag(card.brand))) {
    score += 30;
  }

  if (intent === 'trading' || intent === 'all three') {
    score += 10;
  }

  return score;
};

export default function CardSwipersLanding() {
  const [currentTab, setCurrentTab] = useState('landing');
  const [authMode, setAuthMode] = useState('login');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deck, setDeck] = useState(INITIAL_DECK);
  const [personalizedDeck, setPersonalizedDeck] = useState(INITIAL_DECK);
  const [cardIndex, setCardIndex] = useState(0);
  const [viewingCollection, setViewingCollection] = useState(null);
  const [swipeFeedback, setSwipeFeedback] = useState(null);
  const [myCollection, setMyCollection] = useState([
    { id: 101, name: '1st Edition Blue-Eyes White Dragon', brand: 'Yu-Gi-Oh!', condition: 'PSA 9', imageUrl: swipeDummyCard },
    { id: 102, name: '2024 Shohei Ohtani Topps Chrome', brand: 'Topps', condition: 'Raw', imageUrl: swipeDummyCard }
  ]);
  const [messages, setMessages] = useState([
    { id: 1, user: 'PalletTownTrades', lastMsg: 'Hey! Down to trade Charizard for your Blue-Eyes?', unread: true },
    { id: 2, user: 'VintageVault', lastMsg: 'Is that price firm on the Ohtani?', unread: false }
  ]);
  const [activeChat, setActiveChat] = useState(null);

  const [newCard, setNewCard] = useState({
    title: '',
    brand: 'Topps',
    gradingCompany: 'Raw (Ungraded)',
    rawCondition: 'Near Mint - Mint',
    grade: '10 Gem Mint',
    estimatedValue: '',
    lookingFor: ''
  });
  const [postImageFile, setPostImageFile] = useState(null);
  const [postImagePreview, setPostImagePreview] = useState('');
  const [postImageError, setPostImageError] = useState('');
  const [isPostingCard, setIsPostingCard] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [incomingInterests, setIncomingInterests] = useState([]);
  const [outgoingInterests, setOutgoingInterests] = useState([]);
  const [matches, setMatches] = useState([]);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [pendingInterestType, setPendingInterestType] = useState(INTEREST_TYPES[0]);
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestError, setInterestError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingIntroVisible, setOnboardingIntroVisible] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');
  const [onboardingData, setOnboardingData] = useState({
    interests: [],
    intent: 'trading',
    priceRange: [250, 1000],
    priorities: []
  });
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminActionUserId, setAdminActionUserId] = useState(null);
  const [flaggedCards, setFlaggedCards] = useState([]);
  const [flaggedCardsLoading, setFlaggedCardsLoading] = useState(false);
  const [flaggedCardsError, setFlaggedCardsError] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagCardId, setFlagCardId] = useState(null);
  const currentCard = personalizedDeck[cardIndex] || null;
  const pendingInterestCount = incomingInterests.filter((interest) => interest.status === 'pending').length;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthenticated(Boolean(user));
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading) return;

    const timeoutId = setTimeout(() => {
      // Avoid keeping the landing CTA locked if auth state resolution hangs on poor networks.
      setAuthLoading(false);
    }, 6000);

    return () => clearTimeout(timeoutId);
  }, [authLoading]);

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

      let existing = null;
      try {
        existing = await getDoc(userRef);
      } catch (error) {
        if (error?.code?.includes('offline') || error?.code?.includes('unavailable')) {
          try {
            existing = await getDocFromCache(userRef);
          } catch {
            existing = null;
          }
        } else {
          throw error;
        }
      }

      if (!existing || !existing.exists()) {
        const bootstrapProfile = {
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
        };

        try {
          await setDoc(userRef, bootstrapProfile);
        } catch (error) {
          if (error?.code?.includes('offline') || error?.code?.includes('unavailable')) {
            setCurrentUserProfile({
              ...bootstrapProfile,
              onboardingComplete: false,
              interests: [],
              intent: 'trading',
              priceRange: [250, 1000],
              priorities: []
            });
          } else {
            throw error;
          }
        }
      } else {
        const profile = existing?.data?.() || {};
        setCurrentUserProfile({
          uid: profile.uid || firebaseUser.uid,
          email: profile.email || firebaseUser.email || '',
          displayName: profile.displayName || firebaseUser.displayName || '',
          status: profile.status || 'active',
          role: profile.role || 'user',
          settings: profile.settings || {},
          binderId: profile.binderId || firebaseUser.uid,
          createdAt: profile.createdAt,
          lastLoginAt: profile.lastLoginAt,
          updatedAt: profile.updatedAt,
          onboardingComplete: profile.onboardingComplete || false,
          interests: profile.interests || [],
          intent: profile.intent || 'trading',
          priceRange: profile.priceRange || [250, 1000],
          priorities: profile.priorities || []
        });

        const payload = {
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (declaredAdmin && (profile.role !== 'admin')) {
          payload.role = 'admin';
        }
        try {
          await updateDoc(userRef, payload);
        } catch (error) {
          if (!(error?.code?.includes('offline') || error?.code?.includes('unavailable'))) {
            throw error;
          }
        }
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
      const errorCode = error?.code || '';
      if (errorCode.includes('unavailable') || errorCode.includes('offline')) {
        setAuthError('Network issue detected. Some marketplace data may be delayed until your connection recovers.');
      } else {
        setAuthError('Unable to initialize account profile. Please refresh and try again.');
      }
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
    if (!isAdmin || currentTab !== 'admin') {
      setFlaggedCards([]);
      setFlaggedCardsLoading(false);
      setFlaggedCardsError('');
      return;
    }

    setFlaggedCardsLoading(true);
    setFlaggedCardsError('');
    const flagsQuery = query(collection(db, 'flaggedCards'), orderBy('flaggedAt', 'desc'), limit(500));

    let unsubscribe = () => {};

    const loadFlags = async () => {
      try {
        const snapshot = await getDocs(flagsQuery);
        const loadedFlags = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setFlaggedCards(loadedFlags);
      } catch (error) {
        console.error('Failed loading flagged cards for admin:', error);
        setFlaggedCardsError('Unable to load flagged cards. Check Firestore rules and try again.');
      } finally {
        setFlaggedCardsLoading(false);
      }

      unsubscribe = onSnapshot(
        flagsQuery,
        (snapshot) => {
          const loadedFlags = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setFlaggedCards(loadedFlags);
        },
        (error) => {
          console.error('Failed loading flagged cards snapshot:', error);
        }
      );
    };

    loadFlags();

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
        // Wrap card loading in a timeout to prevent hanging when Firestore is unreachable
        const cardsPromise = getDocs(query(collection(db, 'cards'), orderBy('createdAt', 'desc'), limit(150)));
        const cardsSnapshot = await withTimeout(cardsPromise, 8000, 'Cards load timed out');

        let hiddenCardIds = new Set();
        if (firebaseUser) {
          const swipeQuery = query(
            collection(db, 'swipes'),
            where('userId', '==', firebaseUser.uid),
            where('direction', '==', 'left'),
            limit(500)
          );
          const swipePromise = getDocs(swipeQuery);
          const swipeSnapshot = await withTimeout(swipePromise, 5000, 'Swipes load timed out');
          const now = Date.now();
          hiddenCardIds = new Set(
            swipeSnapshot.docs
              .map((docSnap) => docSnap.data())
              .filter((record) => {
                const hiddenUntil = record.hiddenUntil?.toDate?.() || null;
                return hiddenUntil && hiddenUntil.getTime() > now;
              })
              .map((record) => record.cardId)
          );
        }

        if (!cardsSnapshot.empty) {
          const loadedCards = cardsSnapshot.docs
            .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data.name,
              brand: data.brand,
              condition: data.condition,
              imageUrl: data.imageUrl || '',
              title: data.name,
              category: data.category || data.brand || 'Cards',
              tradeValue: data.tradeValue || data.value || '$0',
              avgMarketValue: data.avgMarketValue || data.value || '$0',
              recentComps: data.recentComps || data.value || '$0',
              owner: data.ownerName || 'Collector',
              ownerUid: data.ownerUid || null,
              seekingTags: data.seekingTags || [],
              detailLine: data.condition || 'Card listing',
              cardColor: 'from-red-600/20 to-orange-500/20',
              borderColor: 'border-red-500/40',
              location: data.location || 'Unknown',
              memberSince: data.memberSince || '2026',
              responseTime: data.responseTime || 'Replies same day',
              completedTrades: data.completedTrades || 0,
              collection: []
            };
            })
            .filter((card) => !hiddenCardIds.has(card.id));

          setDeck((prevDeck) => {
            const seededCards = prevDeck.filter((card) => card.id && typeof card.id === 'number');
            return [...seededCards, ...loadedCards];
          });
          setMyCollection((prevCollection) => {
            const localCards = prevCollection.filter((card) => typeof card.id === 'number');
            const uploaded = loadedCards.map((card) => ({
              id: card.id,
              name: card.name,
              brand: card.brand,
              condition: card.condition,
              imageUrl: card.imageUrl
            }));
            return [...uploaded, ...localCards];
          });
        }
      } catch (error) {
        console.error('Failed to load Firestore data:', error);
        // App continues with seeded deck if load times out or fails
      }
    };

    loadPersistedData();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !currentUserProfile) {
      setShowOnboarding(false);
      return;
    }

    const onboardingComplete = Boolean(currentUserProfile.onboardingComplete);
    if (!onboardingComplete) {
      setOnboardingData({
        interests: Array.isArray(currentUserProfile.interests) ? currentUserProfile.interests : [],
        intent: currentUserProfile.intent || 'trading',
        priceRange:
          Array.isArray(currentUserProfile.priceRange) && currentUserProfile.priceRange.length === 2
            ? currentUserProfile.priceRange
            : [250, 1000],
        priorities: Array.isArray(currentUserProfile.priorities) ? currentUserProfile.priorities : []
      });
      setOnboardingStep(1);
      setOnboardingIntroVisible(false);
      setOnboardingBusy(false);
      setOnboardingError('');
      setShowOnboarding(true);
      setCurrentTab('swipe');
    } else {
      setShowOnboarding(false);
    }
  }, [firebaseUser, currentUserProfile]);

  useEffect(() => {
    const likedCards = outgoingInterests
      .filter((item) => item.status === 'pending' || item.status === 'accepted')
      .map((item) => ({ brand: item.brand }));
    const successfulMatches = matches
      .filter((match) => match.status === 'active' || match.status === 'completed')
      .map((match) => ({ brand: match.brand || '' }));
    const rankedDeck = [...deck]
      .map((card) => ({ card, score: scoreCardForUser(card, currentUserProfile, likedCards, successfulMatches) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.card);

    setPersonalizedDeck(rankedDeck);
    setCardIndex((prev) => {
      if (rankedDeck.length === 0) return 0;
      return prev >= rankedDeck.length ? 0 : prev;
    });
  }, [deck, currentUserProfile, outgoingInterests, matches]);

  useEffect(() => {
    if (!firebaseUser) {
      setIncomingInterests([]);
      setOutgoingInterests([]);
      setMatches([]);
      return;
    }

    const incomingQuery = query(collection(db, 'interests'), where('toUserId', '==', firebaseUser.uid), orderBy('createdAt', 'desc'));
    const outgoingQuery = query(collection(db, 'interests'), where('fromUserId', '==', firebaseUser.uid), orderBy('createdAt', 'desc'));
    const matchesQuery = query(collection(db, 'matches'), where('participants', 'array-contains', firebaseUser.uid), orderBy('updatedAt', 'desc'));

    // Track listener state to prevent duplicate timeout firings
    let incomingFired = false;
    let outgoingFired = false;
    let matchesFired = false;

    const unsubIncoming = onSnapshot(
      incomingQuery,
      (snapshot) => {
        incomingFired = true;
        setIncomingInterests(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        if (!incomingFired) {
          incomingFired = true;
          console.error('Error listening to incoming interests:', error);
          setIncomingInterests([]);
        }
      }
    );

    const unsubOutgoing = onSnapshot(
      outgoingQuery,
      (snapshot) => {
        outgoingFired = true;
        setOutgoingInterests(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        if (!outgoingFired) {
          outgoingFired = true;
          console.error('Error listening to outgoing interests:', error);
          setOutgoingInterests([]);
        }
      }
    );

    const unsubMatches = onSnapshot(
      matchesQuery,
      (snapshot) => {
        matchesFired = true;
        const loadedMatches = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const counterpartyUserId =
            data.ownerUserId === firebaseUser.uid ? data.requesterUserId : data.ownerUserId;
          const counterpartyName = data.participantNames?.[counterpartyUserId] || data.counterpartyName || 'Trade Partner';
          return {
            id: docSnap.id,
            ...data,
            counterpartyUserId,
            counterpartyName
          };
        });
        setMatches(loadedMatches);
        setMessages(
          loadedMatches.map((match) => ({
            id: match.id,
            user: match.counterpartyName || 'Trade Partner',
            lastMsg: match.lastMessage || 'Match accepted. Start negotiating your trade.',
            unread: Boolean(match.unreadBy?.includes(firebaseUser.uid))
          }))
        );
      },
      (error) => {
        if (!matchesFired) {
          matchesFired = true;
          console.error('Error listening to matches:', error);
          setMatches([]);
          setMessages([]);
        }
      }
    );

    // Timeout safeguard: if listeners don't fire within 5 seconds, force empty state
    // This prevents UI freeze when Firestore backend is unreachable
    const timeoutId = window.setTimeout(() => {
      if (!incomingFired) {
        incomingFired = true;
        console.warn('Incoming interests listener timed out');
        setIncomingInterests([]);
      }
      if (!outgoingFired) {
        outgoingFired = true;
        console.warn('Outgoing interests listener timed out');
        setOutgoingInterests([]);
      }
      if (!matchesFired) {
        matchesFired = true;
        console.warn('Matches listener timed out');
        setMatches([]);
        setMessages([]);
      }
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
      unsubIncoming();
      unsubOutgoing();
      unsubMatches();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!activeChat?.id) {
      setChatMessages([]);
      return;
    }

    if (firebaseUser && activeChat.unreadBy?.includes(firebaseUser.uid)) {
      updateDoc(doc(db, 'matches', activeChat.id), {
        unreadBy: (activeChat.unreadBy || []).filter((uid) => uid !== firebaseUser.uid),
        updatedAt: serverTimestamp()
      }).catch(() => {});
    }

    const messagesQuery = query(collection(db, 'messages'), where('matchId', '==', activeChat.id), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setChatMessages(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return () => unsubscribe();
  }, [activeChat, firebaseUser]);

  const advanceDeck = () => {
    window.setTimeout(() => {
      setSwipeFeedback(null);
      setCardIndex((prevIndex) => (prevIndex < personalizedDeck.length - 1 ? prevIndex + 1 : 0));
    }, 400);
  };

  const withTimeout = async (promise, timeoutMs, errorMessage) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        const timeoutError = new Error(errorMessage);
        timeoutError.code = 'operation-timeout';
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const handleSwipe = async (direction) => {
    if (!currentCard || !firebaseUser) return;

    setSwipeFeedback(direction);

    if (direction === 'pass') {
      try {
        const hiddenUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await addDoc(collection(db, 'swipes'), {
          userId: firebaseUser.uid,
          cardId: currentCard.id,
          ownerUid: currentCard.ownerUid || null,
          direction: 'left',
          hiddenUntil,
          createdAt: serverTimestamp()
        });

        setDeck((prevDeck) => prevDeck.filter((card) => card.id !== currentCard.id));
      } catch (error) {
        console.error('Failed to persist left swipe:', error);
      }
      advanceDeck();
      return;
    }

    setPendingInterestType(INTEREST_TYPES[0]);
    setInterestError('');
    setShowInterestModal(true);
    setSwipeFeedback(null);
  };

  const handleSendInterest = async () => {
    if (!currentCard || !firebaseUser || interestBusy) return;
    setInterestError('');
    setInterestBusy(true);
    try {
      await withTimeout(
        addDoc(collection(db, 'interests'), {
        fromUserId: firebaseUser.uid,
        fromUserName: firebaseUser.displayName || firebaseUser.email || 'Collector',
        toUserId: currentCard.ownerUid || normalizeTag(currentCard.owner || 'unassigned-owner'),
        toUserName: currentCard.owner || 'Collector',
        cardId: currentCard.id,
        cardTitle: currentCard.title,
        brand: currentCard.brand || '',
        interestType: pendingInterestType,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        }),
        12000,
        'Sending interest timed out'
      );

      setDeck((prevDeck) => prevDeck.filter((card) => card.id !== currentCard.id));
      setShowInterestModal(false);
      setSwipeFeedback('like');
      advanceDeck();
    } catch (error) {
      console.error('Failed to send interest:', error);
      const errorMessage =
        error?.code === 'operation-timeout' || error?.code?.includes('offline') || error?.code?.includes('unavailable')
          ? 'Network issue while sending interest. Please try again.'
          : 'Unable to send interest right now. Please try again.';
      setInterestError(errorMessage);
      setAuthError(errorMessage);
    } finally {
      setInterestBusy(false);
    }
  };

  const handleInterestDecision = async (interestRecord, decision) => {
    if (!firebaseUser) return;

    try {
      await updateDoc(doc(db, 'interests', interestRecord.id), {
        status: decision,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (decision === 'accepted') {
        const currentName = firebaseUser.displayName || firebaseUser.email || 'Collector';
        const counterpartyName = interestRecord.fromUserName || 'Collector';
        const matchRef = await addDoc(collection(db, 'matches'), {
          interestId: interestRecord.id,
          cardId: interestRecord.cardId,
          cardTitle: interestRecord.cardTitle,
          brand: interestRecord.brand || '',
          ownerUserId: firebaseUser.uid,
          requesterUserId: interestRecord.fromUserId,
          participants: [firebaseUser.uid, interestRecord.fromUserId],
          participantNames: {
            [firebaseUser.uid]: currentName,
            [interestRecord.fromUserId]: counterpartyName
          },
          counterpartyName,
          status: 'active',
          lastMessage: `${currentName} accepted your interest.`,
          unreadBy: [interestRecord.fromUserId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'messages'), {
          matchId: matchRef.id,
          fromUserId: firebaseUser.uid,
          fromUserName: currentName,
          text: `Accepted your interest in ${interestRecord.cardTitle}. What do you want to offer?`,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Failed to process interest decision:', error);
    }
  };

  const handlePostCard = async (e) => {
    e.preventDefault();
    if (!newCard.title || isPostingCard) return;

    setPostImageError('');
    setIsPostingCard(true);

    let createdId = null;
    let imageUrl = '';
    let didPersist = false;
    const isRawCard = newCard.gradingCompany === 'Raw (Ungraded)';
    const conditionLabel = isRawCard
      ? `Raw - ${newCard.rawCondition}`
      : `${newCard.gradingCompany} ${newCard.grade}`;

    try {
      if (postImageFile) {
        const safeFileName = postImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const imageRef = ref(
          storage,
          `cards/${firebaseUser?.uid || 'anonymous'}/${Date.now()}-${safeFileName}`
        );
        await withTimeout(uploadBytes(imageRef, postImageFile), 12000, 'Image upload timed out');
        imageUrl = await withTimeout(getDownloadURL(imageRef), 12000, 'Image URL fetch timed out');
      }

      const docRef = await withTimeout(
        addDoc(collection(db, 'cards'), {
        name: newCard.title,
        brand: newCard.brand,
        category: newCard.brand,
        condition: conditionLabel,
        gradingCompany: newCard.gradingCompany,
        grade: isRawCard ? '' : newCard.grade,
        rawCondition: isRawCard ? newCard.rawCondition : '',
        lookingFor: newCard.lookingFor,
        ownerUid: firebaseUser?.uid || null,
        ownerName: firebaseUser?.displayName || firebaseUser?.email || 'Collector',
        tradeValue: newCard.estimatedValue || '$0',
        value: newCard.estimatedValue || '$0',
        seekingTags: (newCard.lookingFor || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        imageUrl,
        createdAt: serverTimestamp()
        }),
        12000,
        'Card publish timed out'
      );
      createdId = docRef.id;
      didPersist = true;
    } catch (error) {
      console.error('Failed to persist posted card:', error);
      setPostImageError(
        error?.code === 'operation-timeout' || error?.code?.includes('offline') || error?.code?.includes('unavailable')
          ? 'Network issue while publishing. Please try again.'
          : 'Photo upload failed. Please try again.'
      );
    } finally {
      setIsPostingCard(false);
    }

    if (!didPersist || !createdId) {
      return;
    }

    setMyCollection((prevCollection) => [
      {
        id: createdId,
        name: newCard.title,
        brand: newCard.brand,
        condition: conditionLabel,
        imageUrl
      },
      ...prevCollection
    ]);

    setNewCard({
      title: '',
      brand: 'Topps',
      gradingCompany: 'Raw (Ungraded)',
      rawCondition: 'Near Mint - Mint',
      grade: '10 Gem Mint',
      estimatedValue: '',
      lookingFor: ''
    });
    setPostImageFile(null);
    setPostImagePreview('');
    setCurrentTab('swipe');
  };

  const handlePostImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPostImageError('Please choose an image file.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setPostImageError('Image must be under 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPostImagePreview(String(reader.result || ''));
      setPostImageError('');
    };
    reader.readAsDataURL(file);
    setPostImageFile(file);
  };

  const handleSendMessage = async () => {
    const trimmedMessage = chatDraft.trim();
    if (!activeChat || !trimmedMessage || !firebaseUser) return;

    try {
      await addDoc(collection(db, 'messages'), {
        matchId: activeChat.id,
        fromUserId: firebaseUser.uid,
        fromUserName: firebaseUser.displayName || firebaseUser.email || 'Collector',
        text: trimmedMessage,
        createdAt: serverTimestamp()
      });

      const unreadTarget = [activeChat.counterpartyUserId].filter(Boolean);
      await updateDoc(doc(db, 'matches', activeChat.id), {
        lastMessage: trimmedMessage,
        unreadBy: unreadTarget,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to persist message:', error);
    }

    setChatDraft('');
  };

  const handleForgotPassword = async () => {
    setAuthError('');
    setAuthInfo('');
    if (!authEmail) {
      setAuthError('Enter your account email to receive a reset link.');
      return;
    }
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, authEmail);
      setAuthInfo('Reset link sent. Check your inbox.');
    } catch (error) {
      setAuthError(error?.message || 'Could not send reset link.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');

    if (!authEmail || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }

    if (authMode === 'create' && authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match. Please enter the same password twice.');
      return;
    }

    if (authMode === 'create' && !authDisplayName.trim()) {
      setAuthError('Please enter a display name.');
      return;
    }

    try {
      if (authMode === 'create') {
        const credential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        const displayName = authDisplayName.trim();
        await updateProfile(credential.user, { displayName });
        await setDoc(
          doc(db, 'users', credential.user.uid),
          {
            displayName,
            email: credential.user.email || authEmail,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
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
    setAuthInfo('');
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

  const toggleOnboardingValue = (field, value, maxItems = Infinity) => {
    setOnboardingData((prev) => {
      const currentValues = Array.isArray(prev[field]) ? prev[field] : [];
      const normalizedValue = normalizeTag(value);
      if (currentValues.includes(normalizedValue)) {
        return { ...prev, [field]: currentValues.filter((entry) => entry !== normalizedValue) };
      }
      if (currentValues.length >= maxItems) return prev;
      return { ...prev, [field]: [...currentValues, normalizedValue] };
    });
  };

  const handleCompleteOnboarding = async () => {
    if (!firebaseUser || onboardingBusy) return;
    setOnboardingError('');
    if (onboardingData.interests.length === 0) {
      setOnboardingError('Select at least one interest to build your feed.');
      return;
    }
    if (onboardingData.priorities.length === 0) {
      setOnboardingError('Pick at least one priority.');
      return;
    }

    setOnboardingBusy(true);
    const nextProfile = {
      interests: onboardingData.interests,
      intent: onboardingData.intent,
      priceRange: onboardingData.priceRange,
      priorities: onboardingData.priorities,
      onboardingComplete: true,
      updatedAt: serverTimestamp()
    };

    try {
      await withTimeout(
        setDoc(doc(db, 'users', firebaseUser.uid), nextProfile, { merge: true }),
        12000,
        'Saving onboarding timed out'
      );
      setCurrentUserProfile((prev) => ({
        ...(prev || {}),
        interests: onboardingData.interests,
        intent: onboardingData.intent,
        priceRange: onboardingData.priceRange,
        priorities: onboardingData.priorities,
        onboardingComplete: true
      }));
      setOnboardingIntroVisible(true);
      window.setTimeout(() => {
        setShowOnboarding(false);
        setOnboardingIntroVisible(false);
        setOnboardingBusy(false);
      }, 1300);
    } catch (error) {
      console.error('Failed to save onboarding:', error);
      const code = error?.code || '';
      const isNetworkIssue =
        code.includes('offline') ||
        code.includes('unavailable') ||
        code.includes('operation-timeout');

      if (isNetworkIssue) {
        // Keep onboarding flow usable when Firestore is blocked; local profile state still personalizes deck.
        setCurrentUserProfile((prev) => ({
          ...(prev || {}),
          interests: onboardingData.interests,
          intent: onboardingData.intent,
          priceRange: onboardingData.priceRange,
          priorities: onboardingData.priorities,
          onboardingComplete: true
        }));
        setOnboardingIntroVisible(true);
        window.setTimeout(() => {
          setShowOnboarding(false);
          setOnboardingIntroVisible(false);
          setOnboardingBusy(false);
        }, 1300);
        return;
      }

      setOnboardingBusy(false);
      setOnboardingError('Unable to save onboarding right now. Please try again.');
    }
  };

  const handleToggleUserStatus = async (userRecord) => {
    if (!firebaseUser || userRecord.uid === firebaseUser.uid) return;

    const nextStatus = userRecord.status === 'deactivated' ? 'active' : 'deactivated';
    const confirmed = window.confirm(
      nextStatus === 'deactivated'
        ? `Block ${userRecord.email || userRecord.uid}? They will be blocked from access.`
        : `Unblock ${userRecord.email || userRecord.uid}?`
    );
    if (!confirmed) return;

    setAdminActionUserId(userRecord.uid);
    try {
      await updateDoc(doc(db, 'users', userRecord.uid), {
        status: nextStatus,
        blockedAt: nextStatus === 'deactivated' ? serverTimestamp() : null,
        blockedBy: nextStatus === 'deactivated' ? firebaseUser.uid : null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update user status:', error);
      setAdminUsersError('Failed to update account status. Please try again.');
    } finally {
      setAdminActionUserId(null);
    }
  };

  const handleFlagCard = async () => {
    if (!currentCard || !firebaseUser || !flagReason.trim()) return;

    try {
      await addDoc(collection(db, 'flaggedCards'), {
        cardId: currentCard.id,
        cardTitle: currentCard.title,
        cardOwnerUid: currentCard.ownerUid || 'unknown',
        cardOwnerName: currentCard.owner || 'unknown',
        flaggedByUid: firebaseUser.uid,
        flaggedByEmail: firebaseUser.email,
        reason: flagReason,
        cardImageUrl: currentCard.imageUrl,
        flaggedAt: serverTimestamp(),
        status: 'pending'
      });
      setShowFlagModal(false);
      setFlagReason('');
      setFlagCardId(null);
      alert('Card flagged for review. Thank you for helping keep CardSwipers safe.');
    } catch (error) {
      console.error('Failed to flag card:', error);
      alert('Failed to flag card. Please try again.');
    }
  };

  const handleDeleteFlaggedCard = async (flagId, cardId) => {
    const confirmed = window.confirm('Delete this flagged card report?');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'flaggedCards', flagId));
      await deleteDoc(doc(db, 'cards', cardId));
      setFlaggedCards(flaggedCards.filter(f => f.id !== flagId));
    } catch (error) {
      console.error('Failed to delete flagged card:', error);
      setFlaggedCardsError('Failed to delete card. Please try again.');
    }
  };

  const handleDeleteFlagRecord = async (flagId) => {
    const confirmed = window.confirm('Clear this flag report (card will remain)?');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'flaggedCards', flagId));
      setFlaggedCards(flaggedCards.filter(f => f.id !== flagId));
    } catch (error) {
      console.error('Failed to delete flag record:', error);
      setFlaggedCardsError('Failed to clear flag. Please try again.');
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
                      Trade Now
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        await signOut(auth);
                        setCurrentTab('landing');
                      }}
                      className="h-11 px-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
                    >
                      Log Out
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentTab('swipe')}
                      className="h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3040] to-[#D72638] text-white text-sm font-semibold shadow-[0_10px_30px_rgba(215,38,56,0.35)]"
                    >
                      Enter App
                    </button>
                  </div>
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
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600 transition-all flex items-center justify-center text-white font-bold shadow-lg"
                  >
                    {firebaseUser?.email?.[0].toUpperCase() || 'U'}
                  </button>
                  {accountMenuOpen && (
                    <div className="absolute right-0 top-12 w-48 bg-[#111827] border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50">
                      <button
                        onClick={() => {
                          setCurrentTab('collection');
                          setAccountMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 text-white hover:bg-white/5 transition-colors text-sm"
                        type="button"
                      >
                        My Binder
                      </button>
                      <button
                        onClick={() => {
                          setCurrentTab('onboarding');
                          setAccountMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 text-white hover:bg-white/5 transition-colors text-sm"
                        type="button"
                      >
                        My Interests
                      </button>
                      <button
                        onClick={() => {
                          setCurrentTab('messages');
                          setAccountMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 text-white hover:bg-white/5 transition-colors text-sm"
                        type="button"
                      >
                        Notifications
                      </button>
                      <div className="border-t border-white/10"></div>
                      <button
                        onClick={async () => {
                          await signOut(auth);
                          setCurrentTab('landing');
                          setAccountMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm"
                        type="button"
                      >
                        Log Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
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
                  Built For Serious Collectors
                </p>
                <h1 className="text-4xl sm:text-6xl font-bold tracking-[-0.04em] leading-[1.05] mt-8 text-[#F8F8F8] max-w-4xl mx-auto">
                  Trade cards with people who match your goals.
                </h1>
                <div className="mt-10 max-w-5xl mx-auto">
                  <div className="relative rounded-3xl overflow-hidden border border-white/[0.07] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
                    <img
                      src={heroCards}
                      alt="Ungraded trading card listing mockup used as dummy data"
                      className="w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F1117]/60 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center px-4">
                      <p className="text-xs text-white/50 tracking-widest uppercase font-medium">
                        Ungraded Listing Preview - Dummy Data for CardSwipers
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-base sm:text-lg text-neutral-300 mt-8 max-w-2xl mx-auto leading-relaxed font-normal">
                  Match with active collectors, chat instantly, and close trades with clear listing details.
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
                      Trade Now
                    </button>
                  )}
                </div>

                <p className="text-sm text-neutral-400 mt-8">
                  Card trading fundamentals: Condition • Rarity • Demand • Liquidity
                </p>

                <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto text-left sm:text-center">
                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5">
                    <p className="text-sm font-semibold tracking-wide text-[#F8F8F8]">Condition Drives Value</p>
                    <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
                      Corners, surface, centering, and edges are the biggest pricing factors across most card categories.
                    </p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5">
                    <p className="text-sm font-semibold tracking-wide text-[#F8F8F8]">Comps Set Fair Pricing</p>
                    <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
                      Recent sold listings are the most reliable baseline when evaluating trade value or sale price.
                    </p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5">
                    <p className="text-sm font-semibold tracking-wide text-[#F8F8F8]">Grading Improves Clarity</p>
                    <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
                      Third-party grading helps standardize condition and can increase buyer confidence in higher-value deals.
                    </p>
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
                  <h3 className="text-lg font-semibold mt-3">Swipe Active Listings</h3>
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
                    ? 'Trade confidently with active collectors, real-time messaging, and secure transaction workflows.'
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

                {authMode === 'create' && (
                  <input
                    type="text"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    placeholder="Display name"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9CA3AF] focus:outline-none focus:border-white/20"
                  />
                )}

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

                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isSendingReset}
                    className="text-xs text-[#9CA3AF] hover:text-white underline underline-offset-2 disabled:opacity-60"
                  >
                    {isSendingReset ? 'Sending reset link...' : 'Forgot Password?'}
                  </button>
                )}

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
                {authInfo && <p className="text-xs text-emerald-300">{authInfo}</p>}

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
          <AdminPanel
            adminSearch={adminSearch}
            setAdminSearch={setAdminSearch}
            totalUsers={totalUsers}
            activeUsers={activeUsers}
            deactivatedUsers={deactivatedUsers}
            adminUsersError={adminUsersError}
            flaggedCards={flaggedCards}
            flaggedCardsError={flaggedCardsError}
            flaggedCardsLoading={flaggedCardsLoading}
            handleDeleteFlaggedCard={handleDeleteFlaggedCard}
            handleDeleteFlagRecord={handleDeleteFlagRecord}
            adminUsersLoading={adminUsersLoading}
            filteredAdminUsers={filteredAdminUsers}
            firebaseUser={firebaseUser}
            adminActionUserId={adminActionUserId}
            handleToggleUserStatus={handleToggleUserStatus}
          />
        )}

        {false && currentTab === 'admin' && canAccessAdmin && (
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

            <div className="border-t border-white/10 pt-8 mt-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                🚩 Flagged Cards
                {flaggedCards.length > 0 && <span className="px-2 py-1 rounded-full bg-red-600 text-xs font-semibold">{flaggedCards.length}</span>}
              </h3>

              {flaggedCardsError && (
                <div className="text-sm text-red-200 bg-red-900/40 border border-red-400/30 rounded-xl p-3 mb-4">{flaggedCardsError}</div>
              )}

              {flaggedCardsLoading ? (
                <div className="p-4 text-sm text-red-100">Loading flagged cards...</div>
              ) : flaggedCards.length === 0 ? (
                <div className="p-4 text-sm text-red-100 bg-red-950/30 border border-red-400/20 rounded-xl">No flagged cards to review.</div>
              ) : (
                <div className="space-y-3">
                  {flaggedCards.map((flag) => (
                    <div key={flag.id} className="bg-red-950/40 border border-red-400/30 rounded-xl p-4">
                      <div className="grid grid-cols-12 gap-4 items-start">
                        <div className="col-span-8 space-y-2">
                          <div>
                            <p className="text-xs uppercase tracking-widest text-red-200">Card</p>
                            <p className="font-semibold text-white">{flag.cardTitle || 'Unknown Card'}</p>
                            <p className="text-xs text-red-300">Owner: {flag.cardOwnerName}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-widest text-red-200 mt-2">Report Reason</p>
                            <p className="text-sm text-white/80">{flag.reason}</p>
                          </div>
                          <div className="text-xs text-red-300">
                            Flagged by: {flag.flaggedByEmail} • {flag.flaggedAt?.seconds ? new Date(flag.flaggedAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                        <div className="col-span-4 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteFlaggedCard(flag.id, flag.cardId)}
                            className="text-xs px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
                          >
                            Delete Card
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFlagRecord(flag.id)}
                            className="text-xs px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium"
                          >
                            Clear Flag
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 pt-8 mt-8">
              <h3 className="text-xl font-bold mb-4">👥 User Management</h3>
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
                        {userRecord.location && <p className="text-xs text-red-300 truncate">📍 {userRecord.location}</p>}
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
                          {isSelf ? 'Current User' : isProcessing ? 'Saving...' : status === 'deactivated' ? 'Unblock' : 'Block'}
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
                        <span className="bg-white/10 text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/15 uppercase tracking-wider">
                          Active Listing
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

                    <div className="relative z-10 flex-1 flex items-center justify-center py-8">
                      <div className={`w-full max-w-[520px] min-h-[520px] bg-[#0F131C] border ${currentCard.borderColor} rounded-[32px] shadow-[0_24px_64px_rgba(0,0,0,0.55)] relative overflow-hidden`}>
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),transparent_25%,transparent_75%,rgba(255,255,255,0.05))]" />
                        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent" />
                        <div className="absolute top-4 right-4 text-[10px] uppercase tracking-[0.22em] text-white/60 font-bold">Featured Listing</div>
                        <div className="h-full flex flex-col items-center justify-center px-6 pt-14 pb-8 text-center">
                          {currentCard.imageUrl ? (
                            <img
                              src={currentCard.imageUrl}
                              alt={currentCard.title}
                              className="max-h-[340px] w-full max-w-[340px] object-contain drop-shadow-[0_14px_32px_rgba(0,0,0,0.55)]"
                            />
                          ) : (
                            <div className="text-[11rem] leading-none drop-shadow-[0_14px_32px_rgba(0,0,0,0.55)]">{currentCard.imageEmoji}</div>
                          )}
                          <div className="mt-8 space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-white/45 font-semibold">{currentCard.category}</p>
                            <h3 className="text-xl font-bold text-white leading-snug max-w-[16rem] mx-auto">{currentCard.title}</h3>
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
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Listed at</p>
                          <p className="text-2xl font-bold text-white">{currentCard.tradeValue}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 flex-wrap bg-[#0F131C] border border-white/10 rounded-2xl px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setViewingCollection(currentCard)}
                          className="text-sm text-white font-semibold hover:text-rose-300 transition-colors"
                        >
                          @{currentCard.owner} · View Binder ({(currentCard.collection || []).length} items)
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
                      className="min-h-[68px] rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-400/40 text-white shadow-lg hover:border-amber-400/60 hover:from-amber-500/30 hover:to-amber-600/20 transition-all px-4 py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/30 inline-flex items-center justify-center text-amber-300 font-bold"><BinderIcon /></span>
                        <div>
                          <p className="font-bold text-base">View Binder</p>
                          <p className="text-xs text-amber-200/70">{(currentCard.collection || []).length} items available</p>
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
                          <p className="text-xs text-white/75">Send trade request</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
                    Pass hides this listing for 30 days. Interested sends a trade intent request to the owner. Match chat opens only after owner acceptance.
                  </div>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-24">
                  <div className="rounded-[28px] bg-[#111827] border border-white/10 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Collector Profile</p>
                      <h3 className="mt-2 text-2xl font-bold">{currentCard.owner}</h3>
                      <p className="text-sm text-white/55 mt-1">{currentCard.location}</p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
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
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-3">Seeking</p>
                      <div className="flex flex-wrap gap-2">
                        {(currentCard.seekingTags || []).map((tag) => (
                          <span key={tag} className="px-3 py-1.5 rounded-full bg-[#0F131C] border border-white/10 text-sm text-white/75">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setFlagCardId(currentCard.id);
                      setShowFlagModal(true);
                    }}
                    className="w-full rounded-2xl bg-red-950/40 border border-red-400/30 hover:bg-red-900/50 transition-colors px-4 py-3 text-sm text-red-200 font-semibold"
                  >
                    🚩 Report Inappropriate
                  </button>
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
                    {PUBLISHERS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-100 uppercase">Card Grading Company</label>
                  <select
                    value={newCard.gradingCompany}
                    onChange={(e) => setNewCard({ ...newCard, gradingCompany: e.target.value })}
                    className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                  >
                    {GRADING_COMPANIES.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {newCard.gradingCompany === 'Raw (Ungraded)' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-100 uppercase">Raw Condition</label>
                  <select
                    value={newCard.rawCondition}
                    onChange={(e) => setNewCard({ ...newCard, rawCondition: e.target.value })}
                    className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                  >
                    {RAW_CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-100 uppercase">Numeric Grade</label>
                  <select
                    value={newCard.grade}
                    onChange={(e) => setNewCard({ ...newCard, grade: e.target.value })}
                    className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                  >
                    {NUMERIC_GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-red-100 uppercase">Estimated Value (USD)</label>
                <input
                  type="text"
                  placeholder="e.g., 250"
                  value={newCard.estimatedValue}
                  onChange={(e) => setNewCard({ ...newCard, estimatedValue: e.target.value })}
                  className="w-full p-4 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                />
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

              <div className="space-y-2">
                <label className="text-xs font-bold text-red-100 uppercase">Card Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePostImageChange}
                  className="w-full p-3 bg-red-950/70 border border-red-400/30 rounded-2xl focus:outline-none focus:border-white text-sm"
                />
                <p className="text-[11px] text-red-100">Use your camera or upload an image from your device.</p>
                {postImagePreview && (
                  <img
                    src={postImagePreview}
                    alt="Card preview"
                    className="w-full max-h-64 object-cover rounded-2xl border border-red-400/30"
                  />
                )}
                {postImageError && <p className="text-xs text-red-300">{postImageError}</p>}
              </div>

              <button
                type="submit"
                disabled={isPostingCard}
                className="w-full py-4 bg-[#E50914] hover:bg-red-700 font-bold rounded-2xl shadow-lg shadow-red-600/10 transition-colors text-sm mt-4"
              >
                {isPostingCard ? 'Publishing...' : 'Publish Asset to Feed'}
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
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-20 object-cover rounded-lg border border-red-400/30"
                    />
                  ) : (
                    <div className="text-3xl mt-2">🃏</div>
                  )}
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
                  <h2 className="text-2xl font-black">Marketplace Inbox</h2>
                  <p className="text-xs text-red-100">Review interest requests, accept or decline, then negotiate in match chat.</p>
                </div>

                {pendingInterestCount > 0 && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    You have {pendingInterestCount} new interest request{pendingInterestCount === 1 ? '' : 's'} waiting.
                  </div>
                )}

                {incomingInterests.length > 0 && (
                  <div className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-red-100">Incoming Interests</h3>
                    {incomingInterests
                      .filter((interest) => interest.status === 'pending')
                      .map((interest) => (
                        <div key={interest.id} className="rounded-xl border border-red-400/20 bg-black/20 p-3 space-y-2">
                          <p className="text-sm font-semibold">{interest.fromUserName} is interested in {interest.cardTitle}</p>
                          <p className="text-xs text-red-100">Intent: {interest.interestType}</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleInterestDecision(interest, 'accepted')}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700"
                            >
                              Accept Interest
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInterestDecision(interest, 'declined')}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/20"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {outgoingInterests.length > 0 && (
                  <div className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-red-100">Interests You Sent</h3>
                    {outgoingInterests.slice(0, 6).map((interest) => (
                      <div key={interest.id} className="rounded-xl border border-red-400/20 bg-black/20 p-3">
                        <p className="text-sm">{interest.cardTitle} · <span className="text-red-200">{interest.status}</span></p>
                        <p className="text-xs text-red-100">Sent as: {interest.interestType}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="divide-y divide-red-700/40 rounded-2xl border border-red-400/30 bg-red-950/50">
                  {matches.length === 0 ? (
                    <div className="p-4 text-sm text-red-100">No active matches yet. Send interests from the swipe feed to start deals.</div>
                  ) : (
                    matches.map((match) => (
                      <div
                        key={match.id}
                        onClick={() => setActiveChat(match)}
                        className="py-4 flex items-center justify-between cursor-pointer group hover:bg-red-900/40 px-3 rounded-xl transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-red-950 border border-red-400/30 flex items-center justify-center font-bold text-sm text-red-200">
                            {(match.counterpartyName || 'T')[0]}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm flex items-center">
                              {match.counterpartyName}
                              {match.unreadBy?.includes(firebaseUser?.uid) && <span className="w-1.5 h-1.5 bg-[#E50914] rounded-full ml-2"></span>}
                            </h4>
                            <p className="text-xs text-red-100 truncate max-w-[220px] mt-0.5">{match.lastMessage || 'Open chat to negotiate this trade.'}</p>
                          </div>
                        </div>
                        <span className="text-xs text-red-200">➔</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-red-600/40">
                  <button onClick={() => setActiveChat(null)} className="text-red-200 text-sm hover:text-white" type="button">
                    ◀ Back
                  </button>
                  <h3 className="font-bold text-base">Chatting with @{activeChat.counterpartyName || activeChat.user}</h3>
                </div>

                <div className="flex-grow bg-red-900/20 rounded-2xl p-4 flex flex-col justify-end space-y-3 min-h-[300px]">
                  {chatMessages.length === 0 ? (
                    <div className="text-xs text-red-100">No messages yet. Send your opening proposal.</div>
                  ) : (
                    chatMessages.map((message) => {
                      const isSelf = message.fromUserId === firebaseUser?.uid;
                      return (
                        <div
                          key={message.id}
                          className={`${isSelf ? 'bg-[#E50914] text-white rounded-br-none self-end' : 'bg-red-950 border border-red-400/30 rounded-bl-none self-start'} p-3 rounded-2xl max-w-[80%] text-xs`}
                        >
                          {message.text}
                        </div>
                      );
                    })
                  )}
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

      {showInterestModal && currentCard && (
        <div className="fixed inset-0 bg-black/70 z-[65] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#171A22] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Send Trade Interest</h3>
              <button
                type="button"
                onClick={() => setShowInterestModal(false)}
                className="text-sm text-white/70 hover:text-white"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-white/75">Choose why you are swiping right on {currentCard.title}.</p>
            <div className="grid grid-cols-2 gap-2">
              {INTEREST_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPendingInterestType(type)}
                  className={`px-3 py-2 rounded-xl text-xs border ${pendingInterestType === type ? 'bg-[#E50914] border-[#E50914]' : 'bg-white/5 border-white/15 hover:border-white/30'}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={interestBusy}
              onClick={handleSendInterest}
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-red-700 font-semibold text-sm disabled:opacity-60"
            >
              {interestBusy ? 'Sending...' : 'Send Interest'}
            </button>
            {interestError && <p className="text-xs text-red-300">{interestError}</p>}
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#111827] border border-white/10 rounded-3xl p-7 space-y-6 my-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <h2 className="text-3xl font-black tracking-tight">Build Your Marketplace</h2>
                  <p className="text-sm text-white/60 mt-1">We'll personalize your feed in under 30 seconds.</p>
                </div>
              </div>

              <div className="flex gap-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 transition-all ${
                      i < onboardingStep
                        ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C]'
                        : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/50 mt-2">Step {onboardingStep} of 5</p>
            </div>

            {onboardingIntroVisible ? (
              <div className="rounded-2xl bg-gradient-to-r from-emerald-600/30 to-emerald-500/20 border border-emerald-400/40 p-6 text-center">
                <p className="text-2xl font-black">✓ Your feed is ready</p>
                <p className="text-sm text-white/80 mt-3">Based on your interests, we'll surface the best trade opportunities.</p>
              </div>
            ) : (
              <>
                {onboardingStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-white mb-3">What do you collect?</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-white/50 uppercase tracking-widest font-bold mb-2">Sports</p>
                          <div className="grid grid-cols-2 gap-2">
                            {['Baseball', 'Basketball', 'Football', 'Hockey'].map((option) => {
                              const selected = onboardingData.interests.includes(option);
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => toggleOnboardingValue('interests', option)}
                                  className={`text-xs px-3 py-2.5 rounded-xl border font-medium transition-all ${
                                    selected
                                      ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C] border-[#E50914] text-white shadow-lg shadow-red-500/20'
                                      : 'bg-white/5 border-white/15 hover:border-white/30 text-white/80'
                                  }`}
                                >
                                  {selected ? '✓ ' : ''}{option}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-white/50 uppercase tracking-widest font-bold mb-2">Trading Card Games</p>
                          <div className="grid grid-cols-2 gap-2">
                            {['Pokemon', 'Magic', 'Yu-Gi-Oh', 'One Piece'].map((option) => {
                              const selected = onboardingData.interests.includes(option);
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => toggleOnboardingValue('interests', option)}
                                  className={`text-xs px-3 py-2.5 rounded-xl border font-medium transition-all ${
                                    selected
                                      ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C] border-[#E50914] text-white shadow-lg shadow-red-500/20'
                                      : 'bg-white/5 border-white/15 hover:border-white/30 text-white/80'
                                  }`}
                                >
                                  {selected ? '✓ ' : ''}{option}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-white/50 uppercase tracking-widest font-bold mb-2">Preferences</p>
                          <div className="grid grid-cols-2 gap-2">
                            {['Graded', 'Raw', 'Autographs', 'Memorabilia'].map((option) => {
                              const selected = onboardingData.interests.includes(option);
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => toggleOnboardingValue('interests', option)}
                                  className={`text-xs px-3 py-2.5 rounded-xl border font-medium transition-all ${
                                    selected
                                      ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C] border-[#E50914] text-white shadow-lg shadow-red-500/20'
                                      : 'bg-white/5 border-white/15 hover:border-white/30 text-white/80'
                                  }`}
                                >
                                  {selected ? '✓ ' : ''}{option}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                    {onboardingData.interests.length > 0 && (
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 text-xs">
                        <p className="text-white/60 mb-2">Your feed will prioritize:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {onboardingData.interests.slice(0, 3).map((int) => (
                            <span key={int} className="px-2 py-1 rounded-lg bg-[#E50914]/20 text-[#FF6B7A] text-xs">
                              ✓ {int}
                            </span>
                          ))}
                          {onboardingData.interests.length > 3 && (
                            <span className="px-2 py-1 rounded-lg bg-white/10 text-white/60 text-xs">
                              +{onboardingData.interests.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {onboardingStep === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-white">What are you typically looking for?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ONBOARDING_INTENTS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setOnboardingData((prev) => ({ ...prev, intent: option }))}
                          className={`text-xs px-3 py-3 rounded-xl border font-medium transition-all ${
                            onboardingData.intent === option
                              ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C] border-[#E50914] text-white shadow-lg shadow-red-500/20'
                              : 'bg-white/5 border-white/15 hover:border-white/30 text-white/80'
                          }`}
                        >
                          {onboardingData.intent === option ? '✓ ' : ''}{option}
                        </button>
                      ))}
                    </div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-2">
                      <p className="text-xs font-semibold text-white">Why this matters:</p>
                      <ul className="text-xs text-white/70 space-y-1">
                        <li>✓ Better trade match recommendations</li>
                        <li>✓ Prioritize listings that fit your goals</li>
                        <li>✓ Surface active collectors in your niche</li>
                      </ul>
                    </div>
                  </div>
                )}

                {onboardingStep === 3 && (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-white">Typical trade value</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {ONBOARDING_PRICE_RANGES.map((option) => {
                        const selected =
                          onboardingData.priceRange[0] === option.value[0] &&
                          onboardingData.priceRange[1] === option.value[1];
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setOnboardingData((prev) => ({ ...prev, priceRange: option.value }))}
                            className={`text-xs px-3 py-3 rounded-xl border font-medium transition-all ${
                              selected
                                ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C] border-[#E50914] text-white shadow-lg shadow-red-500/20'
                                : 'bg-white/5 border-white/15 hover:border-white/30 text-white/80'
                            }`}
                          >
                            {selected ? '✓ ' : ''}{option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {onboardingStep === 4 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-white">What are your top priorities? (Up to 3)</p>
                      <p className="text-xs text-white/50 mt-1">This helps us rank which cards show first.</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {ONBOARDING_PRIORITIES.map((option) => {
                        const selected = onboardingData.priorities.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggleOnboardingValue('priorities', option, 3)}
                            className={`text-xs px-3 py-2.5 rounded-xl border font-medium transition-all ${
                              selected
                                ? 'bg-gradient-to-r from-[#E50914] to-[#FF3B5C] border-[#E50914] text-white shadow-lg shadow-red-500/20'
                                : 'bg-white/5 border-white/15 hover:border-white/30 text-white/80'
                            }`}
                          >
                            {selected ? '✓ ' : ''}{option}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-white/50 font-medium">{onboardingData.priorities.length} / 3 selected</p>
                  </div>
                )}

                {onboardingStep === 5 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-white mb-4">Review your marketplace setup</p>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 text-xs">
                        <div>
                          <p className="text-white/60 font-medium mb-1">Collections:</p>
                          <p className="text-white">{onboardingData.interests.join(', ') || 'Not selected'}</p>
                        </div>
                        <div className="border-t border-white/10 pt-3">
                          <p className="text-white/60 font-medium mb-1">Looking for:</p>
                          <p className="text-white capitalize">{onboardingData.intent}</p>
                        </div>
                        <div className="border-t border-white/10 pt-3">
                          <p className="text-white/60 font-medium mb-1">Price Range:</p>
                          <p className="text-white">${onboardingData.priceRange[0]} - ${onboardingData.priceRange[1]}</p>
                        </div>
                        <div className="border-t border-white/10 pt-3">
                          <p className="text-white/60 font-medium mb-1">Top Priorities:</p>
                          <p className="text-white">{onboardingData.priorities.join(', ') || 'Not selected'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-gradient-to-r from-emerald-600/20 to-emerald-500/10 border border-emerald-400/30 p-4 space-y-2">
                      <p className="text-xs font-semibold text-emerald-300 uppercase">Your personalized feed will:</p>
                      <ul className="text-xs text-white/80 space-y-1">
                        <li>✓ Show better trade matches</li>
                        <li>✓ Surface stronger collector connections</li>
                        <li>✓ Hide irrelevant listings</li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      disabled={onboardingBusy}
                      onClick={handleCompleteOnboarding}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-[#E50914] to-[#D72638] hover:from-[#FF3B5C] hover:to-[#E11D48] font-bold text-sm text-white shadow-lg shadow-red-500/25 transition-all disabled:opacity-60 uppercase tracking-wider"
                    >
                      {onboardingBusy ? 'Building Feed...' : 'Trade Now'}
                    </button>
                    {onboardingError && <p className="text-xs text-red-300 text-center">{onboardingError}</p>}
                  </div>
                )}

                {onboardingStep < 5 && (
                  <div className="flex justify-between pt-2 gap-3">
                    <button
                      type="button"
                      disabled={onboardingStep === 1}
                      onClick={() => setOnboardingStep((prev) => Math.max(1, prev - 1))}
                      className="px-5 py-2.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 font-medium transition-all"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={onboardingStep === 5}
                      onClick={() => setOnboardingStep((prev) => Math.min(5, prev + 1))}
                      className="flex-1 px-5 py-2.5 text-xs rounded-xl bg-white/15 hover:bg-white/25 font-medium transition-all"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showFlagModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] border border-white/10 rounded-3xl p-7 space-y-6">
            <div>
              <h2 className="text-2xl font-black">Report Inappropriate</h2>
              <p className="text-sm text-white/60 mt-1">Help us keep CardSwipers safe for collectors</p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-white/80 uppercase">What's the issue?</label>
              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Describe the problem (e.g., offensive imagery, fake card, suspicious activity)"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 resize-none h-24"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowFlagModal(false);
                  setFlagReason('');
                  setFlagCardId(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFlagCard}
                disabled={!flagReason.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                Submit Report
              </button>
            </div>
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
            <span>Discover</span>
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
            <div className="relative">
              <NavIcon><InboxIcon /></NavIcon>
              {pendingInterestCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#E50914] text-[10px] leading-4 text-white font-bold text-center">
                  {pendingInterestCount}
                </span>
              )}
            </div>
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
