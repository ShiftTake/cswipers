import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithRedirect,
  signInWithPopup,
  signInWithEmailAndPassword,
  updateProfile,
  signOut
} from 'firebase/auth';
import {
  addDoc,
  collection,
  collectionGroup,
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
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { auth, db, storage } from './firebase';
import { fetchCardMetadata, parseCardText, summarizeOcrLines } from './cardScanner';
import authHeroImage from './image (3).png';
import authBackdropImage from './ChatGPT Image Jul 15, 2026, 06_36_52 PM.png';
import heroCards from './ChatGPT Image Jun 22, 2026, 07_46_56 AM.png';
import AdminPanel from './Admin';

const DEFAULT_ADMIN_EMAIL = 'nathanjohns309@gmail.com';
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const normalizeAuthEmail = (value) => value.trim().toLowerCase();
const ADMIN_PATHS = new Set(['/admin', '/admin.html', '/adminmanagement', '/adminmanagement.html']);
const ADMIN_CANONICAL_PATH = '/adminmanagement';
const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  (typeof window !== 'undefined' ? window.__CARDSWIPERS_STRIPE_PUBLISHABLE_KEY__ || '' : '');
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const getSignInMethodMessage = (methods, flow) => {
  if (methods.includes('google.com')) {
    return flow === 'create'
      ? 'That email is already connected to Google sign-in. Log in with Google instead.'
      : 'That account uses Google sign-in. Tap Continue with Google instead of using a password.';
  }

  if (methods.includes('password')) {
    return flow === 'create'
      ? 'An account already exists for that email. Log in instead.'
      : 'Email found, but the password is incorrect. Try again or reset your password.';
  }

  return flow === 'create'
    ? 'Could not create account. Please check your details and try again.'
    : 'No account was found for that email. Create a new account to continue.';
};

const getAuthErrorMessage = (error, flow = 'login') => {
  const code = String(error?.code || '').toLowerCase();

  if (code.includes('email-already-in-use')) {
    return 'That email is already registered. Try Log In, or use Forgot Password to reset access.';
  }
  if (code.includes('account-exists-with-different-credential')) {
    return 'An account already exists with a different sign-in method. Try Continue with Google.';
  }
  if (code.includes('invalid-email') || code.includes('missing-email')) {
    return 'Enter a valid email address.';
  }
  if (code.includes('weak-password')) {
    return 'Use a stronger password with at least 6 characters.';
  }
  if (code.includes('wrong-password') || code.includes('invalid-credential')) {
    return 'Email or password is incorrect. Please try again.';
  }
  if (code.includes('user-not-found')) {
    return flow === 'login'
      ? 'No account was found for that email. Switch to Create Account to get started.'
      : 'No account was found for that email.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (
    code.includes('network-request-failed') ||
    code.includes('offline') ||
    code.includes('unavailable') ||
    code.includes('operation-timeout')
  ) {
    return 'Network issue detected. Check your connection and try again.';
  }
  if (code.includes('popup-closed-by-user')) {
    return 'Sign-in was canceled before completion.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'This sign-in method is currently unavailable. Please contact support.';
  }

  if (flow === 'google') return 'Google sign-in failed. Please try again.';
  if (flow === 'reset') return 'Could not send reset link. Please try again.';
  if (flow === 'create') return 'Could not create account. Please check your details and try again.';
  return 'Could not log in. Please try again.';
};

function NavIcon({ children, className = '' }) {
  return <span className={`inline-flex items-center justify-center ${className}`}>{children}</span>;
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

function CardClubsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M6.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M2.5 20c0-2.5 2-4.5 4.5-4.5h0c2.5 0 4.5 2 4.5 4.5M10 20c0-2.8 2.2-5 5-5h0c2.8 0 5 2.2 5 5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.4h4.6L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.25" />
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

function StatusIcon({ status }) {
  const normalizedStatus = String(status || '').toLowerCase();
  if (['active', 'completed', 'accepted', 'paid', 'success', 'verified'].includes(normalizedStatus)) {
    return <span aria-hidden="true">✓</span>;
  }
  if (['deactivated', 'declined', 'rejected', 'failed', 'error'].includes(normalizedStatus)) {
    return <span aria-hidden="true">!</span>;
  }
  return <span aria-hidden="true">◷</span>;
}

function StatusPill({ label, status = 'pending', tone = 'neutral' }) {
  const toneClasses = {
    success: 'border-emerald-300/60 bg-emerald-400/15 text-emerald-100',
    warning: 'border-amber-300/60 bg-amber-400/15 text-amber-100',
    error: 'border-rose-300/60 bg-rose-400/15 text-rose-100',
    neutral: 'border-white/30 bg-white/10 text-white'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold leading-none ${toneClasses[tone] || toneClasses.neutral}`}>
      <StatusIcon status={status} />
      <span>{label}</span>
    </span>
  );
}

function CardFlipImage({ frontImageUrl, backImageUrl, title, fallback }) {
  const [side, setSide] = useState('front');
  const canFlip = Boolean(backImageUrl && backImageUrl !== frontImageUrl);
  const toggle = () => canFlip && setSide((previous) => (previous === 'front' ? 'back' : 'front'));
  return (
    <div
      className={`relative h-full w-full ${canFlip ? 'cursor-pointer' : ''}`}
      style={{ perspective: '1000px' }}
      onClick={toggle}
      role={canFlip ? 'button' : undefined}
      tabIndex={canFlip ? 0 : undefined}
      onKeyDown={(event) => {
        if (canFlip && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          toggle();
        }
      }}
      aria-label={canFlip ? `Flip ${title || 'card'} to show the ${side === 'front' ? 'back' : 'front'}` : undefined}
    >
      <div className="relative h-full w-full transition-transform duration-[600ms] [transform-style:preserve-3d]" style={{ transform: side === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
        <div className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden]">
          {frontImageUrl ? <img src={frontImageUrl} alt={`${title || 'Card'} front`} className="h-full w-full object-contain" /> : <div className="text-6xl">{fallback || '🃏'}</div>}
        </div>
        {canFlip && (
          <div className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }}>
            <img src={backImageUrl} alt={`${title || 'Card'} back`} className="h-full w-full object-contain" />
          </div>
        )}
      </div>
      {canFlip && <span className="absolute right-2 top-2 z-10 rounded-full border border-[#FFD700]/60 bg-black/65 px-2 py-1 text-[10px] font-semibold text-[#FFE66D]">↻ Tap to flip</span>}
    </div>
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

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M15 17H9m10-1c-1.2-1.1-2-2.7-2-4.4V10a5 5 0 1 0-10 0v1.6c0 1.7-.8 3.3-2 4.4" />
      <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function EscrowPaymentForm({ purchaseSummary, onCancel, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || isSubmitting) return;

    setIsSubmitting(true);
    onError('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required'
    });

    setIsSubmitting(false);

    if (error) {
      onError(error.message || 'Stripe payment confirmation failed.');
      return;
    }

    onSuccess(paymentIntent);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-white">
      <div>
        <h3 className="text-lg font-bold text-white">Complete escrow payment</h3>
        <p className="text-sm text-white/75 mt-1">
          {purchaseSummary.cardTitle} · You will be charged {formatMoney(purchaseSummary.totalCharge)}.
        </p>
        <p className="text-xs text-white/70 mt-1">
          {purchaseSummary.feeOnly
            ? `Trade Protection Fee ${formatMoney(purchaseSummary.baseItemPrice)}. No marketplace fee is added.`
            : `Item price ${formatMoney(purchaseSummary.baseItemPrice)} + 5% marketplace fee ${formatMoney(purchaseSummary.percentageFee || 0)} + flat fee ${formatMoney(purchaseSummary.flatFee || 0)}.`}
        </p>
      </div>

      <div className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
        <PaymentElement />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!stripe || !elements || isSubmitting}
          className="min-h-11 flex-1 rounded-2xl bg-[#FFD700] text-[#0B0E14] hover:bg-[#FFE66D] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70 font-semibold disabled:opacity-60"
        >
          {isSubmitting ? 'Processing...' : `Pay ${formatMoney(purchaseSummary.totalCharge)}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 px-4 rounded-2xl border border-[#30363D] bg-[#0B0E14] text-white font-semibold hover:bg-[#161B22] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const INITIAL_DECK = [];

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
const ENABLE_PAYMENT_PIPELINE = true;
const INSTANT_PURCHASE_ACTION = 'Instant Purchase';
const MARKETPLACE_ACTION_TYPES = ENABLE_PAYMENT_PIPELINE ? ['Negotiate Trade', INSTANT_PURCHASE_ACTION] : ['Negotiate Trade'];
const DEAL_TYPES = [
  { value: 'pure_trade', label: 'Trade Only' },
  { value: 'hybrid_trade', label: 'Card + Cash' },
  { value: 'cash_sale', label: 'Buy With Cash' }
];
const DEAL_TYPE_STYLES = {
  pure_trade: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  hybrid_trade: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  cash_sale: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
};
const GOOGLE_REDIRECT_PENDING_KEY = 'cardswipers_google_redirect_pending';
const MARKETPLACE_FEE_RATE = 0.05;
const MARKETPLACE_FLAT_FEE = 0.99;
const TRADE_PROTECTION_FEE = 2.99;
const VERIFIED_SELLER_SUBSCRIPTION_PRICE = 9.99;
const ESCROW_API_BASE = '/api';
const ESCROW_TERMS_LABEL = 'I agree to the Terms of Service and community marketplace rules.';

const buildClubCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const isClubModeratorRole = (role) => role === 'owner' || role === 'agent';
const CLUB_LOGO_PRESETS = [
  { id: 'club', symbol: '♣', className: 'from-emerald-800 via-green-700 to-emerald-950' },
  { id: 'diamond', symbol: '♦', className: 'from-blue-900 via-blue-700 to-slate-950' },
  { id: 'heart', symbol: '♥', className: 'from-red-950 via-red-700 to-orange-950' },
  { id: 'spade', symbol: '♠', className: 'from-slate-800 via-zinc-600 to-black' },
  { id: 'jack', symbol: 'J', className: 'from-fuchsia-950 via-purple-800 to-slate-950' },
  { id: 'queen', symbol: 'Q', className: 'from-cyan-950 via-slate-700 to-slate-950' },
  { id: 'king', symbol: 'K', className: 'from-amber-950 via-amber-700 to-stone-950' }
];
const normalizeClubRole = (role) => {
  const normalized = String(role || 'member').toLowerCase();
  if (normalized === 'owner' || normalized === 'agent') return normalized;
  return 'member';
};
const getClubAccessMode = (clubData = {}) => {
  const accessMode = String(clubData.accessMode || clubData.visibility || 'private').toLowerCase();
  return accessMode === 'public' || accessMode === 'auto-join' ? 'public' : 'private';
};

const normalizeStateCode = (value) => String(value || '').trim().toUpperCase().slice(0, 2);

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
};

const formatListingDate = (value) => {
  if (!value) return 'Listed today';
  const date = value?.toDate?.() || value;
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'Listed today';
  return `Listed ${parsedDate.toLocaleDateString()}`;
};

const toDateValue = (value) => {
  const date = value?.toDate?.() || value;
  const parsedDate = date instanceof Date ? date : new Date(date || 0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const calculateMarketplaceSplit = (grossAmount) => {
  const gross = Number(grossAmount || 0);
  const marketplaceFee = Number((gross * MARKETPLACE_FEE_RATE + MARKETPLACE_FLAT_FEE).toFixed(2));
  const sellerPayout = Number((gross - marketplaceFee).toFixed(2));
  return { gross, marketplaceFee, sellerPayout };
};

const calculateEscrowCharge = (baseItemPrice) => {
  const baseAmount = Number(baseItemPrice || 0);
  const percentageFee = Number((baseAmount * MARKETPLACE_FEE_RATE).toFixed(2));
  const flatFee = baseAmount > 0 ? MARKETPLACE_FLAT_FEE : 0;
  const platformFee = Number((percentageFee + flatFee).toFixed(2));
  const totalCharge = Number((baseAmount + platformFee).toFixed(2));
  return {
    baseAmount,
    percentageFee,
    flatFee,
    platformFee,
    totalCharge
  };
};

const buildEscrowOrderId = () =>
  `ORDER_ID_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const getConnectedAccountIdFromRecord = (record = {}, sellerProfile = {}, sellerVerificationRecord = {}) => (
  record.sellerConnectedAccountId ||
  record.connectedAccountId ||
  record.sellerStripeConnectedAccountId ||
  sellerProfile.stripeConnectedAccountId ||
  sellerProfile.connectedAccountId ||
  sellerVerificationRecord.stripeConnectedAccountId ||
  sellerVerificationRecord.connectedAccountId ||
  ''
);

const ISO_QUICK_OPTIONS = [
  'Baseball',
  'Basketball',
  'Football',
  'Soccer',
  'Pokemon',
  'Cash',
  'Trade Up'
];

const normalizeTag = (value) => String(value || '').toLowerCase().trim();

const parseDollarValue = (value) => {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const looksLikeLegacyDummyCard = (raw = {}) => {
  const fieldsToScan = [
    raw.name,
    raw.title,
    raw.brand,
    raw.ownerName,
    raw.location,
    raw.responseTime,
    raw.condition,
    ...(Array.isArray(raw.seekingTags) ? raw.seekingTags : [])
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  const tokens = ['dummy', 'democollector', 'demo mode', 'preview only', 'demo card', 'sample listing'];
  return tokens.some((token) => fieldsToScan.includes(token));
};

const compressImageFile = async (file) => {
  if (!file?.type?.startsWith('image/')) return file;

  const maxDimension = 1600;
  const targetSizeBytes = 900 * 1024;
  const minQuality = 0.62;

  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(imageBitmap.width, imageBitmap.height));
  const width = Math.max(1, Math.round(imageBitmap.width * scale));
  const height = Math.max(1, Math.round(imageBitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  let quality = 0.84;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return file;

  while (blob.size > targetSizeBytes && quality > minQuality) {
    quality -= 0.08;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
  }

  if (blob.size >= file.size) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
};

const extractTextLinesFromMlKitResult = (result) => {
  const collected = [];

  if (typeof result?.text === 'string') {
    collected.push(...result.text.split(/\r?\n/));
  }

  if (typeof result?.recognizedText === 'string') {
    collected.push(...result.recognizedText.split(/\r?\n/));
  }

  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  blocks.forEach((block) => {
    if (typeof block?.text === 'string') {
      collected.push(block.text);
    }
    const lines = Array.isArray(block?.lines) ? block.lines : [];
    lines.forEach((line) => {
      if (typeof line?.text === 'string') {
        collected.push(line.text);
      }
    });
  });

  return summarizeOcrLines(Array.from(new Set(collected)));
};

const runMlKitTextRecognition = async (imagePath) => {
  const mlkitModule = await import('@capacitor-mlkit/text-recognition');
  const plugin = mlkitModule?.TextRecognition || mlkitModule?.default || mlkitModule;
  const methods = [plugin?.recognize, plugin?.recognizeText, plugin?.processImage].filter(
    (candidate) => typeof candidate === 'function'
  );

  if (!methods.length) {
    throw new Error('Text recognition plugin is unavailable. Install and sync @capacitor-mlkit/text-recognition.');
  }

  const payloads = [{ path: imagePath }, { imagePath }, { filePath: imagePath }];
  let lastError = null;

  for (const method of methods) {
    for (const payload of payloads) {
      try {
        const result = await method.call(plugin, payload);
        if (result) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error('Text recognition failed to return a result.');
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
  const normalizedPath =
    typeof window !== 'undefined' ? window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/' : '/';
  const isNativeApp = Capacitor.isNativePlatform();
  const isAdminPath = ADMIN_PATHS.has(normalizedPath);
  const [currentTab, setCurrentTab] = useState(isNativeApp ? 'auth' : 'landing');
  const [authMode, setAuthMode] = useState('login');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [nativeViewportHeight, setNativeViewportHeight] = useState(null);
  const [showStartupSplash, setShowStartupSplash] = useState(isNativeApp);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [hasAcceptedEscrowTerms, setHasAcceptedEscrowTerms] = useState(false);
  const [hasAcceptedVerificationTerms, setHasAcceptedVerificationTerms] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deck, setDeck] = useState(INITIAL_DECK);
  const [personalizedDeck, setPersonalizedDeck] = useState(INITIAL_DECK);
  const [cardIndex, setCardIndex] = useState(0);
  const [viewingCollection, setViewingCollection] = useState(null);
  const [swipeFeedback, setSwipeFeedback] = useState(null);
  const [myCollection, setMyCollection] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [chatOffers, setChatOffers] = useState([]);
  const [offerDraftAmount, setOfferDraftAmount] = useState('');
  const [offerDealType, setOfferDealType] = useState('hybrid_trade');
  const [offerBusy, setOfferBusy] = useState(false);

  const [newCard, setNewCard] = useState({
    title: '',
    brand: 'Topps',
    cardNumber: '',
    setNumber: '',
    gradingCompany: 'Raw (Ungraded)',
    rawCondition: 'Near Mint - Mint',
    grade: '10 Gem Mint',
    estimatedValue: '',
    buyNowPrice: '',
    sellerState: '',
    saleMode: 'trade_and_sale',
    lookingFor: ''
  });
  const [postImageError, setPostImageError] = useState('');
  const [isPostingCard, setIsPostingCard] = useState(false);
  const [postComposerStep, setPostComposerStep] = useState(1);
  const [postFrontImageFile, setPostFrontImageFile] = useState(null);
  const [postBackImageFile, setPostBackImageFile] = useState(null);
  const [postFrontImagePreview, setPostFrontImagePreview] = useState('');
  const [postBackImagePreview, setPostBackImagePreview] = useState('');
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerInfo, setScannerInfo] = useState('');
  const [scannerDetectedLines, setScannerDetectedLines] = useState([]);
  const postFrontImageInputRef = useRef(null);
  const postBackImageInputRef = useRef(null);
  const [activeCardImageSide, setActiveCardImageSide] = useState('front');
  const cardImageTouchStartXRef = useRef(0);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [incomingInterests, setIncomingInterests] = useState([]);
  const [outgoingInterests, setOutgoingInterests] = useState([]);
  const [matches, setMatches] = useState([]);
  const [purchaseIntents, setPurchaseIntents] = useState([]);
  const [userPurchaseIntents, setUserPurchaseIntents] = useState([]);
  const [premiumSubscriptions, setPremiumSubscriptions] = useState([]);
  const [sellerVerifications, setSellerVerifications] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewBusyByPurchaseId, setReviewBusyByPurchaseId] = useState({});
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [pendingInterestType, setPendingInterestType] = useState(MARKETPLACE_ACTION_TYPES[0]);
  const [pendingDealType, setPendingDealType] = useState('pure_trade');
  const [pendingCashAmount, setPendingCashAmount] = useState('');
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestError, setInterestError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activePaymentSheet, setActivePaymentSheet] = useState(null);
  const [paymentSheetError, setPaymentSheetError] = useState('');
  const [trackingDrafts, setTrackingDrafts] = useState({});
  const [trackingBusyByPurchaseId, setTrackingBusyByPurchaseId] = useState({});
  const [releaseBusyByPurchaseId, setReleaseBusyByPurchaseId] = useState({});
  const [disputeDrafts, setDisputeDrafts] = useState({});
  const [disputeBusyByPurchaseId, setDisputeBusyByPurchaseId] = useState({});
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
  const [clubs, setClubs] = useState([]);
  const [clubSearchQuery, setClubSearchQuery] = useState('');
  const [clubJoinCode, setClubJoinCode] = useState('');
  const [clubDraftName, setClubDraftName] = useState('');
  const [clubDraftDescription, setClubDraftDescription] = useState('');
  const [clubDraftLogoId, setClubDraftLogoId] = useState('');
  const [clubDraftLogoFile, setClubDraftLogoFile] = useState(null);
  const [clubDraftLogoPreview, setClubDraftLogoPreview] = useState('');
  const [clubDraftError, setClubDraftError] = useState('');
  const clubLogoInputRef = useRef(null);
  const [clubCreateBusy, setClubCreateBusy] = useState(false);
  const [clubJoinBusy, setClubJoinBusy] = useState(false);
  const [clubActionBusyId, setClubActionBusyId] = useState('');
  const [clubInfo, setClubInfo] = useState('');
  const [clubError, setClubError] = useState('');
  const [moderatedClubIds, setModeratedClubIds] = useState([]);
  const [clubModerationBadgeCount, setClubModerationBadgeCount] = useState(0);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [selectedClubMembers, setSelectedClubMembers] = useState([]);
  const [selectedClubEvents, setSelectedClubEvents] = useState([]);
  const [selectedClubPosts, setSelectedClubPosts] = useState([]);
  const [selectedClubReports, setSelectedClubReports] = useState([]);
  const [selectedClubBanRecord, setSelectedClubBanRecord] = useState(null);
  const [clubPostDraft, setClubPostDraft] = useState({
    title: '',
    askingPrice: '',
    description: '',
    imageUrl: ''
  });
  const [clubPostBusy, setClubPostBusy] = useState(false);
  const [clubEventBusyId, setClubEventBusyId] = useState('');
  const [clubReportBusy, setClubReportBusy] = useState(false);
  const [chatReportBusy, setChatReportBusy] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminActionUserId, setAdminActionUserId] = useState(null);
  const [flaggedCards, setFlaggedCards] = useState([]);
  const [flaggedCardsLoading, setFlaggedCardsLoading] = useState(false);
  const [flaggedCardsError, setFlaggedCardsError] = useState('');
  const [chatReports, setChatReports] = useState([]);
  const [chatReportsLoading, setChatReportsLoading] = useState(false);
  const [chatReportsError, setChatReportsError] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const confirmResolverRef = useRef(null);
  const [flagCardId, setFlagCardId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [verificationForm, setVerificationForm] = useState({
    legalName: '',
    birthDate: '',
    phone: '',
    email: '',
    verificationTypes: ['seller'],
    notes: ''
  });
  const [verificationDocFile, setVerificationDocFile] = useState(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verificationInfo, setVerificationInfo] = useState('');
  const [verificationSessionBusy, setVerificationSessionBusy] = useState(false);
  const verificationDocInputRef = useRef(null);
  const splashStartTimeRef = useRef(Date.now());
  const hasHydratedPendingInterests = useRef(false);
  const hasHydratedMatches = useRef(false);
  const pendingInterestIdsRef = useRef(new Set());
  const matchIdsRef = useRef(new Set());
  const unreadMatchIdsRef = useRef(new Set());
  const clubReportIdsRef = useRef(new Set());
  const clubReportsHydratedRef = useRef(false);
  const currentCard = personalizedDeck[cardIndex] || null;
  const pendingInterestCount = incomingInterests.filter((interest) => interest.status === 'pending').length;
  const unreadMatchCount = matches.filter((match) => match.unreadBy?.includes(firebaseUser?.uid)).length;
  const inboxBadgeCount = pendingInterestCount + unreadMatchCount;
  const unreadNotificationCount = notifications.filter((item) => !item.read).length;
  const isConfiguredAdminUser = ADMIN_EMAILS.includes((firebaseUser?.email || '').toLowerCase());
  const hasAdminAccess = isAdmin || isConfiguredAdminUser || import.meta.env.DEV;
  const selectedClub = clubs.find((club) => club.id === selectedClubId) || null;
  const selectedClubMembership = selectedClubMembers.find((member) => member.uid === firebaseUser?.uid) || null;
  const selectedClubRole = selectedClubMembership?.role || '';
  const canManageClubMembers = selectedClubRole === 'owner';
  const canModerateClubPosts = isClubModeratorRole(selectedClubRole);
  const isSelectedClubBanned = Boolean(selectedClubBanRecord);
  const openSelectedClubReports = selectedClubReports.filter((report) => report.status === 'open');
  const filteredClubs = clubs.filter((club) => {
    const searchTerm = clubSearchQuery.trim().toLowerCase();
    if (!searchTerm) return true;
    const haystack = `${club.name || ''} ${club.description || ''} ${club.code || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
  const ratingStatsByUser = reviews.reduce((accumulator, review) => {
    const reviewedUid = review.reviewedUid;
    if (!reviewedUid) return accumulator;
    const reviewedRole = String(review.reviewedRole || '').toLowerCase();
    const ratingValue = Number(review.rating || 0);
    if (!Number.isFinite(ratingValue) || ratingValue <= 0) return accumulator;

    const existing = accumulator[reviewedUid] || {
      buyer: { total: 0, count: 0, average: 0 },
      seller: { total: 0, count: 0, average: 0 }
    };

    if (reviewedRole === 'buyer' || reviewedRole === 'seller') {
      const roleBucket = existing[reviewedRole];
      roleBucket.total += ratingValue;
      roleBucket.count += 1;
      roleBucket.average = Number((roleBucket.total / roleBucket.count).toFixed(2));
    }

    accumulator[reviewedUid] = existing;
    return accumulator;
  }, {});

  const currentSellerRating = currentCard?.ownerUid ? ratingStatsByUser[currentCard.ownerUid]?.seller : null;
  const currentUserBuyerRating = firebaseUser?.uid ? ratingStatsByUser[firebaseUser.uid]?.buyer : null;
  const currentUserSellerRating = firebaseUser?.uid ? ratingStatsByUser[firebaseUser.uid]?.seller : null;
  const sellerVerificationStatus = String(
    currentUserProfile?.sellerVerificationStatus || currentUserProfile?.verificationStatus || 'unverified'
  ).toLowerCase();
  const hasSellerPaymentAccess = sellerVerificationStatus === 'verified' || sellerVerificationStatus === 'pending';
  const existingReviewKeys = new Set(
    reviews.map((review) => `${review.purchaseId || ''}:${review.reviewerUid || ''}`)
  );
  const reviewableTransactions = userPurchaseIntents
    .filter((record) => {
      const saleClosed =
        ['released', 'completed', 'fulfilled'].includes(String(record.status || '').toLowerCase()) ||
        String(record.escrowStatus || '').toLowerCase() === 'released';
      if (!saleClosed || !firebaseUser?.uid) return false;
      const reviewKey = `${record.id}:${firebaseUser.uid}`;
      return !existingReviewKeys.has(reviewKey);
    })
    .map((record) => {
      const isBuyer = record.buyerUid === firebaseUser?.uid;
      return {
        ...record,
        reviewerRole: isBuyer ? 'buyer' : 'seller',
        reviewedRole: isBuyer ? 'seller' : 'buyer',
        counterpartyUid: isBuyer ? record.sellerUid : record.buyerUid,
        counterpartyName: isBuyer ? (record.sellerName || 'Seller') : (record.buyerName || 'Buyer')
      };
    })
    .filter((record) => Boolean(record.counterpartyUid));
  const escrowTransactions = userPurchaseIntents
    .filter((record) => String(record.paymentProvider || '').toLowerCase() === 'stripe')
    .map((record) => {
      const isBuyer = record.buyerUid === firebaseUser?.uid;
      const sellerVerificationRecord = sellerVerifications.find((entry) => entry.userId === record.sellerUid || entry.uid === record.sellerUid) || {};
      const connectedAccountId = getConnectedAccountIdFromRecord(record, {}, sellerVerificationRecord);
      return {
        ...record,
        orderId: record.orderId || record.id,
        isBuyer,
        isSeller: record.sellerUid === firebaseUser?.uid,
        connectedAccountId,
        counterpartyName: isBuyer ? (record.sellerName || 'Seller') : (record.buyerName || 'Buyer')
      };
    })
    .sort((left, right) => {
      const leftTime = toDateValue(left.updatedAt || left.createdAt)?.getTime?.() || 0;
      const rightTime = toDateValue(right.updatedAt || right.createdAt)?.getTime?.() || 0;
      return rightTime - leftTime;
    });
  const postProgressChecks = [
    Boolean(postFrontImagePreview),
    Boolean(postBackImagePreview),
    Boolean(newCard.title.trim()),
    Boolean(newCard.brand.trim()),
    Boolean((newCard.estimatedValue || '').trim()),
    Boolean((newCard.buyNowPrice || '').trim()),
    Boolean((newCard.sellerState || '').trim()),
    Boolean((newCard.lookingFor || '').trim())
  ];
  const postCompletionCount = postProgressChecks.filter(Boolean).length;
  const postCompletionPercent = Math.round((postCompletionCount / postProgressChecks.length) * 100);
  const previewConditionLabel =
    newCard.gradingCompany === 'Raw (Ungraded)'
      ? `Raw - ${newCard.rawCondition}`
      : `${newCard.gradingCompany} ${newCard.grade}`;

  const currentCardImages = [
    currentCard?.imageFrontUrl || currentCard?.imageUrl || '',
    currentCard?.imageBackUrl || currentCard?.imageUrl || ''
  ].filter(Boolean);
  const canToggleCurrentCardImage = currentCardImages.length > 1;

  const addNotification = useCallback((payload) => {
    const notification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      read: false,
      createdAt: Date.now(),
      ...payload
    };

    setNotifications((prev) => [notification, ...prev].slice(0, 40));

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(notification.title, { body: notification.message });
      } catch {
        // Ignore browser notification failures and rely on in-app panel.
      }
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp || currentTab !== 'post') {
      if (isNativeApp) CameraPreview.stop().catch(() => {});
      return undefined;
    }

    CameraPreview.start({
      parent: 'camera-container',
      position: 'rear',
      toBack: true
    }).catch((error) => {
      console.error('Failed to start camera preview:', error);
    });

    return () => {
      CameraPreview.stop().catch(() => {});
    };
  }, [currentTab, isNativeApp]);

  useEffect(() => {
    if (firebaseUser) return;
    setNotifications([]);
    setShowNotificationsPanel(false);
    setClubs([]);
    setClubSearchQuery('');
    setClubJoinCode('');
    setClubDraftName('');
    setClubDraftDescription('');
    setClubCreateBusy(false);
    setClubJoinBusy(false);
    setClubActionBusyId('');
    setClubInfo('');
    setClubError('');
    setModeratedClubIds([]);
    setClubModerationBadgeCount(0);
    setSelectedClubId('');
    setSelectedClubMembers([]);
    setSelectedClubPosts([]);
    setSelectedClubReports([]);
    setSelectedClubBanRecord(null);
    setClubPostDraft({
      title: '',
      askingPrice: '',
      description: '',
      imageUrl: ''
    });
    setClubPostBusy(false);
    setClubReportBusy(false);
    setChatReportBusy(false);
    setChatReports([]);
    setChatReportsLoading(false);
    setChatReportsError('');
    clubReportIdsRef.current = new Set();
    clubReportsHydratedRef.current = false;
    setChatOffers([]);
    setOfferDraftAmount('');
    setOfferBusy(false);
    setUserPurchaseIntents([]);
    setReviews([]);
    setReviewDrafts({});
    setReviewBusyByPurchaseId({});
    hasHydratedPendingInterests.current = false;
    hasHydratedMatches.current = false;
    pendingInterestIdsRef.current = new Set();
    matchIdsRef.current = new Set();
    unreadMatchIdsRef.current = new Set();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      setVerificationForm((prev) => ({
        ...prev,
        legalName: '',
        birthDate: '',
        phone: '',
        email: ''
      }));
      return;
    }

    setVerificationForm((prev) => ({
      ...prev,
      legalName: currentUserProfile?.legalName || firebaseUser.displayName || prev.legalName,
      birthDate: currentUserProfile?.birthDate || prev.birthDate,
      phone: currentUserProfile?.phone || prev.phone,
      email: currentUserProfile?.email || firebaseUser.email || prev.email
    }));
  }, [firebaseUser, currentUserProfile]);

  useEffect(() => {
    if (!firebaseUser) return;

    const pendingIncoming = incomingInterests.filter((interest) => interest.status === 'pending');
    const currentPendingIds = new Set(pendingIncoming.map((interest) => interest.id));

    if (!hasHydratedPendingInterests.current) {
      hasHydratedPendingInterests.current = true;
      pendingInterestIdsRef.current = currentPendingIds;
      return;
    }

    pendingIncoming.forEach((interest) => {
      if (!pendingInterestIdsRef.current.has(interest.id)) {
        addNotification({
          type: 'interest',
          title: 'New Interest Request',
          message: `${interest.fromUserName || 'A collector'} is interested in ${interest.cardTitle || 'your listing'}.`,
          actionTab: 'messages'
        });
      }
    });

    pendingInterestIdsRef.current = currentPendingIds;
  }, [incomingInterests, firebaseUser, addNotification]);

  useEffect(() => {
    if (!firebaseUser) return;

    const currentMatchIds = new Set(matches.map((match) => match.id));
    const currentUnreadMatchIds = new Set(
      matches
        .filter((match) => match.unreadBy?.includes(firebaseUser.uid))
        .map((match) => match.id)
    );

    if (!hasHydratedMatches.current) {
      hasHydratedMatches.current = true;
      matchIdsRef.current = currentMatchIds;
      unreadMatchIdsRef.current = currentUnreadMatchIds;
      return;
    }

    matches.forEach((match) => {
      if (!matchIdsRef.current.has(match.id)) {
        addNotification({
          type: 'match',
          title: 'New Match Created',
          message: `You matched with ${match.counterpartyName || 'a trade partner'}.`,
          actionTab: 'messages'
        });
      }
      if (currentUnreadMatchIds.has(match.id) && !unreadMatchIdsRef.current.has(match.id)) {
        addNotification({
          type: 'message',
          title: 'New Message',
          message: `${match.counterpartyName || 'A trade partner'} sent you a message.`,
          actionTab: 'messages'
        });
      }
    });

    matchIdsRef.current = currentMatchIds;
    unreadMatchIdsRef.current = currentUnreadMatchIds;
  }, [matches, firebaseUser, addNotification]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthenticated(Boolean(user));
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Safety valve: once auth state resolves, ensure the submit spinner is not stuck.
    if (firebaseUser || !authLoading) {
      setIsAuthSubmitting(false);
    }
  }, [firebaseUser, authLoading]);

  useEffect(() => {
    let isMounted = true;

    const handleRedirectResult = async () => {
      if (!isNativeApp) return;

      const hasPendingGoogleRedirect =
        typeof window !== 'undefined' && window.sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';

      if (!hasPendingGoogleRedirect) return;

      try {
        const result = await getRedirectResult(auth);
        if (!isMounted || !result?.user) return;
        setAuthInfo('Google sign-in completed.');
      } catch (error) {
        if (!isMounted) return;
        setAuthError(getAuthErrorMessage(error, 'google'));
      } finally {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
        }
        setIsGoogleRedirecting(false);
      }
    };

    handleRedirectResult();

    return () => {
      isMounted = false;
    };
  }, [isNativeApp]);

  useEffect(() => {
    if (!authLoading) return;

    const timeoutId = setTimeout(() => {
      // Avoid keeping the landing CTA locked if auth state resolution hangs on poor networks.
      setAuthLoading(false);
    }, 6000);

    return () => clearTimeout(timeoutId);
  }, [authLoading]);

  useEffect(() => {
    if (!isNativeApp) {
      setShowStartupSplash(false);
      return;
    }

    if (authLoading) {
      const maxWaitId = setTimeout(() => {
        setShowStartupSplash(false);
      }, 5000);
      return () => clearTimeout(maxWaitId);
    }

    const elapsed = Date.now() - splashStartTimeRef.current;
    const remaining = Math.max(0, 2200 - elapsed);
    const hideId = setTimeout(() => {
      setShowStartupSplash(false);
    }, remaining);

    return () => clearTimeout(hideId);
  }, [authLoading, isNativeApp]);

  useEffect(() => {
    if (!isNativeApp || typeof window === 'undefined') return;

    let rafId = 0;
    let timeoutId = 0;

    const applyViewportHeight = () => {
      const visualViewportHeight = Number(window.visualViewport?.height || 0);
      const innerHeight = Number(window.innerHeight || 0);
      const measuredHeight = Math.round(Math.max(visualViewportHeight, innerHeight));
      if (measuredHeight > 0) {
        setNativeViewportHeight(measuredHeight);
      }
    };

    const scheduleViewportSync = (delay = 0) => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(applyViewportHeight);
      }, delay);
    };

    applyViewportHeight();
    scheduleViewportSync(80);
    scheduleViewportSync(260);

    const resizeHandler = () => scheduleViewportSync(0);
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);
    window.visualViewport?.addEventListener('resize', resizeHandler);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('orientationchange', resizeHandler);
      window.visualViewport?.removeEventListener('resize', resizeHandler);
    };
  }, [isNativeApp, currentTab, isAuthenticated]);

  useEffect(() => {
    if (!isNativeApp || typeof window === 'undefined') return;
    if (currentTab === 'auth') return;

    let frameId = 0;
    const resyncViewport = () => {
      const visualViewportHeight = Number(window.visualViewport?.height || 0);
      const innerHeight = Number(window.innerHeight || 0);
      const measuredHeight = Math.round(Math.max(visualViewportHeight, innerHeight));
      if (measuredHeight > 0) {
        setNativeViewportHeight(measuredHeight);
      }
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resyncViewport();
    window.setTimeout(resyncViewport, 80);
    window.setTimeout(resyncViewport, 260);
    frameId = window.requestAnimationFrame(resyncViewport);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isNativeApp, currentTab, isAuthenticated]);

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
      const declaredAdmin = configuredAdmin;
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
          legalName: firebaseUser.displayName || '',
          birthDate: '',
          phone: '',
          verificationStatus: 'unverified',
          sellerVerificationStatus: 'unverified',
          status: 'active',
          role: declaredAdmin ? 'admin' : 'user',
          tos_accepted: false,
          tos_accepted_at: null,
          tos_version_accepted: null,
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
          legalName: profile.legalName || profile.displayName || firebaseUser.displayName || '',
          birthDate: profile.birthDate || '',
          phone: profile.phone || '',
          verificationStatus: profile.verificationStatus || 'unverified',
          sellerVerificationStatus: profile.sellerVerificationStatus || profile.verificationStatus || 'unverified',
          status: profile.status || 'active',
          role: profile.role || 'user',
          tos_accepted: Boolean(profile.tos_accepted),
          tos_accepted_at: profile.tos_accepted_at || null,
          tos_version_accepted: profile.tos_version_accepted || null,
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
        if (declaredAdmin && profile.role !== 'admin') {
          payload.role = 'admin';
        } else if (!declaredAdmin && profile.role === 'admin') {
          payload.role = 'user';
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
        setIsAdmin(Boolean(declaredAdmin));

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
    if (!isAdmin || currentTab !== 'admin') {
      setChatReports([]);
      setChatReportsLoading(false);
      setChatReportsError('');
      return;
    }

    setChatReportsLoading(true);
    setChatReportsError('');
    const reportsQuery = query(collection(db, 'chatReports'), orderBy('createdAt', 'desc'), limit(500));

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        setChatReports(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setChatReportsLoading(false);
      },
      (error) => {
        console.error('Failed loading chat reports for admin:', error);
        setChatReportsError('Unable to load chat reports. Check Firestore rules and try again.');
        setChatReportsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, currentTab]);

  useEffect(() => {
    if (!isAdmin || currentTab !== 'admin') {
      setPurchaseIntents([]);
      setPremiumSubscriptions([]);
      setSellerVerifications([]);
      return;
    }

    const purchaseQuery = query(collection(db, 'purchaseIntents'), limit(1000));
    const subscriptionQuery = query(collection(db, 'subscriptions'), limit(500));
    const verificationQuery = query(collection(db, 'sellerVerifications'), limit(500));

    let unsubPurchases = () => {};
    let unsubSubscriptions = () => {};
    let unsubVerifications = () => {};

    const loadMarketplaceLedger = async () => {
      try {
        const [purchaseSnapshot, subscriptionSnapshot, verificationSnapshot] = await Promise.all([
          getDocs(purchaseQuery),
          getDocs(subscriptionQuery),
          getDocs(verificationQuery)
        ]);

        setPurchaseIntents(purchaseSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setPremiumSubscriptions(subscriptionSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setSellerVerifications(verificationSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      } catch (error) {
        console.error('Failed loading marketplace ledger for admin:', error);
      }

      unsubPurchases = onSnapshot(purchaseQuery, (snapshot) => {
        setPurchaseIntents(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      });
      unsubSubscriptions = onSnapshot(subscriptionQuery, (snapshot) => {
        setPremiumSubscriptions(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      });
      unsubVerifications = onSnapshot(verificationQuery, (snapshot) => {
        setSellerVerifications(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      });
    };

    loadMarketplaceLedger();

    return () => {
      unsubPurchases();
      unsubSubscriptions();
      unsubVerifications();
    };
  }, [isAdmin, currentTab]);

  useEffect(() => {
    if (!firebaseUser) {
      setUserPurchaseIntents([]);
      return;
    }

    const buyerQuery = query(collection(db, 'purchaseIntents'), where('buyerUid', '==', firebaseUser.uid), limit(500));
    const sellerQuery = query(collection(db, 'purchaseIntents'), where('sellerUid', '==', firebaseUser.uid), limit(500));

    const purchaseMapRef = new Map();
    const applySnapshot = (snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        purchaseMapRef.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
      const merged = Array.from(purchaseMapRef.values()).sort((a, b) => {
        const aSec = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bSec = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return bSec - aSec;
      });
      setUserPurchaseIntents(merged);
    };

    const unsubBuyer = onSnapshot(buyerQuery, applySnapshot, (error) => {
      console.error('Failed loading buyer purchases:', error);
    });
    const unsubSeller = onSnapshot(sellerQuery, applySnapshot, (error) => {
      console.error('Failed loading seller purchases:', error);
    });

    return () => {
      unsubBuyer();
      unsubSeller();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      setClubs([]);
      return;
    }

    const clubsQuery = query(collection(db, 'clubs'), orderBy('createdAt', 'desc'), limit(150));
    const unsubscribe = onSnapshot(
      clubsQuery,
      (snapshot) => {
        const loadedClubs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setClubs(loadedClubs);
      },
      (error) => {
        console.error('Failed loading clubs:', error);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      setModeratedClubIds([]);
      return;
    }

    const membershipQuery = query(collectionGroup(db, 'members'), where('uid', '==', firebaseUser.uid));
    const unsubscribe = onSnapshot(
      membershipQuery,
      (snapshot) => {
        const moderated = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            const clubId = docSnap.ref.parent.parent?.id || '';
            return { clubId, role: data.role || '' };
          })
          .filter((entry) => entry.clubId && isClubModeratorRole(entry.role))
          .map((entry) => entry.clubId);

        setModeratedClubIds(Array.from(new Set(moderated)));
      },
      (error) => {
        console.error('Failed loading club moderation memberships:', error);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || moderatedClubIds.length === 0) {
      setClubModerationBadgeCount(0);
      return;
    }

    const reportCountsByClub = {};
    const unsubscribers = moderatedClubIds.map((clubId) => {
      const openReportsQuery = query(
        collection(db, 'clubs', clubId, 'reports'),
        where('status', '==', 'open'),
        limit(200)
      );

      return onSnapshot(
        openReportsQuery,
        (snapshot) => {
          reportCountsByClub[clubId] = snapshot.size;
          const nextCount = Object.values(reportCountsByClub).reduce((sum, value) => sum + Number(value || 0), 0);
          setClubModerationBadgeCount(nextCount);
        },
        (error) => {
          console.error(`Failed loading open reports for club ${clubId}:`, error);
        }
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [firebaseUser, moderatedClubIds]);

  useEffect(() => {
    if (!clubs.length) {
      setSelectedClubId('');
      return;
    }

    if (!selectedClubId || !clubs.some((club) => club.id === selectedClubId)) {
      setSelectedClubId(clubs[0].id);
    }
  }, [clubs, selectedClubId]);

  useEffect(() => {
    if (!selectedClubId) {
      setSelectedClubMembers([]);
      setSelectedClubEvents([]);
      setSelectedClubPosts([]);
      setSelectedClubReports([]);
      setSelectedClubBanRecord(null);
      clubReportIdsRef.current = new Set();
      clubReportsHydratedRef.current = false;
      return;
    }

    const membersRef = collection(doc(db, 'clubs', selectedClubId), 'members');
    const eventsRef = collection(doc(db, 'clubs', selectedClubId), 'events');
    const postsRef = collection(doc(db, 'clubs', selectedClubId), 'posts');
    const reportsRef = collection(doc(db, 'clubs', selectedClubId), 'reports');

    const unsubMembers = onSnapshot(
      membersRef,
      (snapshot) => {
        const loadedMembers = snapshot.docs
          .map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => {
            const rank = { owner: 0, agent: 1, member: 2 };
            return (rank[a.role] ?? 3) - (rank[b.role] ?? 3);
          });
        setSelectedClubMembers(loadedMembers);
      },
      (error) => {
        console.error('Failed loading club members:', error);
      }
    );

    const unsubPosts = onSnapshot(
      query(postsRef, orderBy('createdAt', 'desc'), limit(200)),
      (snapshot) => {
        setSelectedClubPosts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        console.error('Failed loading club posts:', error);
      }
    );

    const unsubEvents = onSnapshot(
      query(eventsRef, orderBy('scheduledFor', 'asc'), limit(20)),
      (snapshot) => {
        setSelectedClubEvents(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        console.error('Failed loading club events:', error);
      }
    );

    const unsubReports = onSnapshot(
      query(reportsRef, orderBy('createdAt', 'desc'), limit(200)),
      (snapshot) => {
        setSelectedClubReports(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        console.error('Failed loading club reports:', error);
      }
    );

    let unsubBan = () => {};
    if (firebaseUser?.uid) {
      unsubBan = onSnapshot(
        doc(db, 'clubs', selectedClubId, 'bans', firebaseUser.uid),
        (snapshot) => {
          setSelectedClubBanRecord(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        },
        (error) => {
          console.error('Failed loading club ban status:', error);
        }
      );
    }

    return () => {
      unsubMembers();
      unsubEvents();
      unsubPosts();
      unsubReports();
      unsubBan();
    };
  }, [selectedClubId, firebaseUser]);

  useEffect(() => {
    if (!selectedClubId || !canModerateClubPosts) {
      clubReportIdsRef.current = new Set();
      clubReportsHydratedRef.current = false;
      return;
    }

    const openReports = selectedClubReports.filter((report) => report.status === 'open');
    const currentIds = new Set(openReports.map((report) => report.id));

    if (!clubReportsHydratedRef.current) {
      clubReportsHydratedRef.current = true;
      clubReportIdsRef.current = currentIds;
      return;
    }

    openReports.forEach((report) => {
      if (!clubReportIdsRef.current.has(report.id)) {
        addNotification({
          type: 'club-report',
          title: 'New Club Report',
          message: `${selectedClub?.name || 'Club'} has a new moderation report.`,
          actionTab: 'onboarding'
        });
      }
    });

    clubReportIdsRef.current = currentIds;
  }, [selectedClubId, selectedClubReports, canModerateClubPosts, selectedClub, addNotification]);

  useEffect(() => {
    if (!firebaseUser) {
      setReviews([]);
      return;
    }

    const reviewsQuery = query(collection(db, 'reviews'), limit(1500));
    const unsubscribe = onSnapshot(
      reviewsQuery,
      (snapshot) => {
        setReviews(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        console.error('Failed loading reviews:', error);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser]);

  useEffect(() => {
    if (currentTab === 'admin' && !hasAdminAccess) {
      setCurrentTab(isAuthenticated ? 'swipe' : (isNativeApp ? 'auth' : 'landing'));
    }
  }, [currentTab, hasAdminAccess, isAuthenticated, isNativeApp]);

  useEffect(() => {
    if (!isAdminPath) return;
    if (!isAuthenticated) {
      setCurrentTab('auth');
      return;
    }
    setCurrentTab(hasAdminAccess ? 'admin' : 'onboarding');
  }, [isAdminPath, isAuthenticated, hasAdminAccess]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    if (currentTab === 'admin' && !ADMIN_PATHS.has(currentPath)) {
      window.history.replaceState({}, '', ADMIN_CANONICAL_PATH);
      return;
    }
    if (currentTab !== 'admin' && ADMIN_PATHS.has(currentPath)) {
      if (!isAuthenticated || hasAdminAccess) {
        return;
      }
      window.history.replaceState({}, '', '/discover');
    }
  }, [currentTab, isAuthenticated, hasAdminAccess]);

  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    if (currentTab !== 'auth' && currentTab !== 'landing') {
      setCurrentTab('auth');
    }
  }, [authLoading, isAuthenticated, currentTab]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (currentTab === 'auth' || currentTab === 'landing') {
      if (isAdminPath) {
        setCurrentTab(hasAdminAccess ? 'admin' : 'onboarding');
        return;
      }
      setCurrentTab('onboarding');
    }
  }, [authLoading, isAuthenticated, currentTab, isAdminPath, hasAdminAccess]);

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
            .filter((docSnap) => !looksLikeLegacyDummyCard(docSnap.data()))
            .map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                name: data.name,
                brand: data.brand,
                condition: data.condition,
                imageFrontUrl: data.imageFrontUrl || data.imageUrl || '',
                imageBackUrl: data.imageBackUrl || data.imageUrl || '',
                imageUrl: data.imageFrontUrl || data.imageUrl || '',
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
                  listedAt: data.listedAt || data.createdAt || null,
                  listedAtLabel: formatListingDate(data.listedAt || data.createdAt || null),
                  buyNowPrice: data.buyNowPrice || data.tradeValue || data.value || '$0',
                  saleMode: data.saleMode || 'trade_and_sale',
                  sellerState: normalizeStateCode(data.sellerState || ''),
                  sellerVerificationStatus: data.sellerVerificationStatus || 'unverified',
                  sellerVerified: Boolean(data.sellerVerified || data.sellerVerificationStatus === 'verified'),
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
      setCurrentTab('onboarding');
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
    const matchesQuery = query(collection(db, 'matches'), where('participants', 'array-contains', firebaseUser.uid), orderBy('updatedAt', 'desc'));

    // Track listener state to prevent duplicate timeout firings
    let incomingFired = false;
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
      unsubMatches();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || currentTab !== 'messages') {
      return;
    }

    const outgoingQuery = query(collection(db, 'interests'), where('fromUserId', '==', firebaseUser.uid), orderBy('createdAt', 'desc'));

    let outgoingFired = false;
    const unsubscribe = onSnapshot(
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

    const timeoutId = window.setTimeout(() => {
      if (!outgoingFired) {
        outgoingFired = true;
        console.warn('Outgoing interests listener timed out');
        setOutgoingInterests([]);
      }
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [firebaseUser, currentTab]);

  useEffect(() => {
    if (!activeChat?.id) {
      setChatMessages([]);
      setChatOffers([]);
      return;
    }

    if (firebaseUser && activeChat.unreadBy?.includes(firebaseUser.uid)) {
      updateDoc(doc(db, 'matches', activeChat.id), {
        unreadBy: (activeChat.unreadBy || []).filter((uid) => uid !== firebaseUser.uid),
        updatedAt: serverTimestamp()
      }).catch(() => {});
    }

    const messagesQuery = query(
      collection(db, 'messages'),
      where('matchId', '==', activeChat.id),
      orderBy('createdAt', 'asc'),
      limit(120)
    );
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setChatMessages(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      // Auto-scroll to bottom when new messages arrive
      window.setTimeout(() => {
        const chatContainer = document.querySelector('[data-chat-messages]');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 0);
    });

    return () => unsubscribe();
  }, [activeChat, firebaseUser]);

  useEffect(() => {
    if (!activeChat?.id) {
      setChatOffers([]);
      return;
    }

    const offersQuery = query(
      collection(db, 'offers'),
      where('matchId', '==', activeChat.id),
      limit(120)
    );

    const unsubscribe = onSnapshot(offersQuery, (snapshot) => {
      const offers = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => {
          const aSec = a.createdAt?.seconds || 0;
          const bSec = b.createdAt?.seconds || 0;
          return aSec - bSec;
        });
      setChatOffers(offers);
    });

    return () => unsubscribe();
  }, [activeChat]);

  useEffect(() => {
    setActiveCardImageSide('front');
  }, [currentCard?.id]);

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
      // Optimistically filter deck immediately
      const nextDeck = deck.filter((card) => card.id !== currentCard.id);
      setDeck(nextDeck);
      
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
      } catch (error) {
        console.error('Failed to persist left swipe:', error);
        // Restore card to deck if Firestore write failed
        setDeck((prevDeck) => [...prevDeck, currentCard]);
      }
      advanceDeck();
      return;
    }

    setPendingInterestType(MARKETPLACE_ACTION_TYPES[0]);
    setPendingDealType('pure_trade');
    setPendingCashAmount('');
    setInterestError('');
    setShowInterestModal(true);
    setSwipeFeedback(null);
  };

  const handleInstantPurchase = async (card = currentCard, options = {}) => {
    if (!card || !firebaseUser) return false;
    const shouldAdvanceDeck = Boolean(options?.advanceAfterPurchase);
    const cashAmount = Number(options?.cashAmount || 0);
    const feeOnly = Boolean(options?.feeOnly);

    if (!STRIPE_PUBLISHABLE_KEY || !stripePromise) {
      setAuthInfo('Payment processing is in sandbox mode or configuration is pending. Your offer was not charged.');
      return false;
    }

    const grossAmount = feeOnly ? 0 : (cashAmount > 0 ? cashAmount : parseDollarValue(card.buyNowPrice || card.tradeValue || card.value));
    const { baseAmount, platformFee, totalCharge } = calculateEscrowCharge(grossAmount);
    const chargeAmount = feeOnly ? TRADE_PROTECTION_FEE : totalCharge;
    const taxState = normalizeStateCode(currentUserProfile?.state || currentUserProfile?.shippingState || card.sellerState || '');
    const orderId = buildEscrowOrderId();
    const purchaseRef = doc(db, 'purchaseIntents', orderId);

    await setDoc(purchaseRef, {
      orderId,
      buyerUid: firebaseUser.uid,
      buyerName: firebaseUser.displayName || firebaseUser.email || 'Buyer',
      sellerUid: card.ownerUid || null,
      sellerName: card.owner || 'Collector',
      sellerConnectedAccountId: card.sellerConnectedAccountId || card.connectedAccountId || null,
      cardId: card.id,
      cardTitle: card.title,
      cardBrand: card.brand || '',
      listingPrice: baseAmount,
      marketplaceFeeRate: MARKETPLACE_FEE_RATE,
      marketplaceFeeAmount: feeOnly ? TRADE_PROTECTION_FEE : platformFee,
      chargedTotalAmount: chargeAmount,
      sellerPayoutAmount: baseAmount,
      taxState,
      taxStatus: 'needs-stripe-tax',
      taxAmount: 0,
      escrowAmount: feeOnly ? TRADE_PROTECTION_FEE : baseAmount,
      escrowStatus: 'payment_pending',
      status: 'requires_payment',
      paymentProvider: 'stripe',
      saleMode: options?.dealType || 'cash_sale',
      dealType: options?.dealType || 'cash_sale',
      feeOnly,
      offerId: options?.offerId || null,
      listedAt: card.listedAt || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    try {
      const response = await fetch(`${ESCROW_API_BASE}/orders/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({
          itemPrice: baseAmount,
          feeOnly,
          protectionFee: feeOnly ? TRADE_PROTECTION_FEE : null,
          currency: 'usd',
          orderId,
          buyerId: firebaseUser.uid,
          sellerConnectedAccountId: card.sellerConnectedAccountId || card.connectedAccountId || '',
          sellerUserId: card.ownerUid || null,
          sellerName: card.owner || 'Collector',
          cardId: card.id,
          cardTitle: card.title,
          cardBrand: card.brand || '',
          buyerShippingAddress: {
            postal_code: currentUserProfile?.shippingZip || currentUserProfile?.postalCode || '',
            state: currentUserProfile?.state || currentUserProfile?.shippingState || ''
          }
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to initialize Stripe payment.');
      }

      await updateDoc(purchaseRef, {
        paymentIntentId: payload.paymentIntentId,
        paymentIntentClientSecret: payload.clientSecret,
        transferGroup: payload.transferGroup,
        chargedTotalAmount: Number(payload.totalCharge || chargeAmount),
        marketplaceFeeAmount: Number(payload.platformFee || (feeOnly ? 0 : platformFee)),
        sellerPayoutAmount: Number(payload.baseItemPrice || baseAmount),
        escrowAmount: Number(payload.baseItemPrice || (feeOnly ? TRADE_PROTECTION_FEE : baseAmount)),
        status: 'payment_intent_created',
        escrowStatus: 'payment_intent_created',
        updatedAt: serverTimestamp()
      });

      setPaymentSheetError('');
      setActivePaymentSheet({
        orderId,
        purchaseId: orderId,
        clientSecret: payload.clientSecret,
        cardId: card.id,
        cardTitle: card.title,
        baseItemPrice: Number(payload.baseItemPrice || baseAmount),
        totalCharge: Number(payload.totalCharge || chargeAmount),
        platformFee: Number(payload.platformFee || (feeOnly ? 0 : platformFee)),
        percentageFee: feeOnly ? 0 : Number(payload.percentageFee || calculateEscrowCharge(grossAmount).percentageFee),
        flatFee: feeOnly ? 0 : Number(payload.flatFee || calculateEscrowCharge(grossAmount).flatFee),
        feeOnly,
        advanceAfterPurchase: shouldAdvanceDeck,
        offerId: options?.offerId || null,
        dealType: options?.dealType || 'cash_sale',
        protectionRole: options?.protectionRole || null,
        buyerProtectionPaymentStatus: options?.buyerProtectionPaymentStatus || null,
        sellerProtectionPaymentStatus: options?.sellerProtectionPaymentStatus || null
      });
      return true;
    } catch (error) {
      console.error('Failed to initialize escrow payment:', error);
      await updateDoc(purchaseRef, {
        status: 'payment_intent_failed',
        escrowStatus: 'payment_intent_failed',
        paymentError: error.message || 'Unable to initialize Stripe payment.',
        updatedAt: serverTimestamp()
      });
      setAuthError(error.message || 'Unable to initialize Stripe payment.');
      return false;
    }
  };

  const handleEscrowPaymentSuccess = async (paymentIntent) => {
    if (!activePaymentSheet?.purchaseId) return;

    try {
      await updateDoc(doc(db, 'purchaseIntents', activePaymentSheet.purchaseId), {
        paymentIntentId: paymentIntent?.id || null,
        paymentIntentStatus: paymentIntent?.status || 'succeeded',
        status: 'payment_held',
        escrowStatus: 'payment_held',
        tosAcceptedAt: serverTimestamp(),
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (activePaymentSheet.offerId) {
        const protectionField = activePaymentSheet.feeOnly
          ? activePaymentSheet.protectionRole === 'seller' ? 'sellerProtectionPaymentStatus' : 'buyerProtectionPaymentStatus'
          : 'paymentStatus';
        const otherProtectionHeld = activePaymentSheet.feeOnly && (
          activePaymentSheet.protectionRole === 'seller'
            ? activePaymentSheet.buyerProtectionPaymentStatus === 'payment_held'
            : activePaymentSheet.sellerProtectionPaymentStatus === 'payment_held'
        );
        await updateDoc(doc(db, 'offers', activePaymentSheet.offerId), {
          [protectionField]: 'payment_held',
          paymentStatus: activePaymentSheet.feeOnly && !otherProtectionHeld ? 'payment_pending' : 'payment_held',
          paymentIntentId: paymentIntent?.id || null,
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        if (activeChat?.id) {
          const sellerUid = activeChat.ownerUserId || null;
          await updateDoc(doc(db, 'matches', activeChat.id), {
            lastMessage: activePaymentSheet.feeOnly && !otherProtectionHeld
              ? 'Trade Protection payment received from one party. The other party must pay $2.99 to unlock protection.'
              : activePaymentSheet.feeOnly
                ? 'Both Trade Protection fees are paid. Tracked shipping and dispute protection are unlocked.'
                : 'Cash payment is held in escrow. Seller may now ship the card.',
            unreadBy: sellerUid ? [sellerUid] : [],
            updatedAt: serverTimestamp()
          });
        }
      }

      if (activePaymentSheet.advanceAfterPurchase) {
        const nextDeck = deck.filter((listing) => listing.id !== activePaymentSheet.cardId);
        setDeck(nextDeck);
        setSwipeFeedback('like');
        advanceDeck();
      }

      setAuthInfo(`Escrow payment captured for ${activePaymentSheet.cardTitle}. Funds will remain held until shipment and release.`);
      setActivePaymentSheet(null);
    } catch (error) {
      console.error('Failed to finalize escrow payment:', error);
      setPaymentSheetError('Payment succeeded, but we could not finish recording the order. Refresh your account history and verify the order status.');
    }
  };

  const handleRetryOfferPayment = async (offer) => {
    if (!firebaseUser || !activeChat?.id || !offer?.id) return;
    if (offer.buyerUid !== firebaseUser.uid) return;

    const cashAmount = Number(offer.cashAmount || offer.amount || 0);
    const dealType = offer.dealType || 'hybrid_trade';
    const feeOnly = dealType === 'pure_trade';
    const checkoutCard = {
      id: offer.cardId || activeChat.cardId || null,
      title: offer.cardTitle || activeChat.cardTitle || 'Card trade',
      brand: offer.brand || activeChat.brand || '',
      ownerUid: offer.sellerUid || activeChat.ownerUserId || null,
      owner: offer.sellerName || activeChat.counterpartyName || 'Seller',
      sellerConnectedAccountId: offer.sellerConnectedAccountId || activeChat.sellerConnectedAccountId || null,
      connectedAccountId: offer.connectedAccountId || activeChat.connectedAccountId || null,
      sellerState: offer.sellerState || activeChat.sellerState || '',
      buyNowPrice: feeOnly ? 0 : cashAmount,
      tradeValue: feeOnly ? 0 : cashAmount,
      value: feeOnly ? 0 : cashAmount
    };

    const checkoutStarted = await handleInstantPurchase(checkoutCard, {
      cashAmount,
      offerId: offer.id,
      dealType,
      feeOnly,
      protectionRole: offer.buyerUid === firebaseUser.uid ? 'buyer' : 'seller',
      buyerProtectionPaymentStatus: offer.buyerProtectionPaymentStatus || null,
      sellerProtectionPaymentStatus: offer.sellerProtectionPaymentStatus || null,
      advanceAfterPurchase: false
    });
    await updateDoc(doc(db, 'offers', offer.id), {
      paymentStatus: checkoutStarted ? 'checkout_open' : 'payment_configuration_pending',
      updatedAt: serverTimestamp()
    });
  };

  const handleSubmitTrackingForOrder = async (transaction) => {
    if (!transaction?.orderId || !transaction?.isSeller) return;

    const draft = trackingDrafts[transaction.orderId] || {};
    const carrier = String(draft.carrier || '').trim();
    const trackingNumber = String(draft.trackingNumber || '').trim();
    const trackingUrl = String(draft.trackingUrl || '').trim();

    if (!carrier || !trackingNumber) {
      setVerificationError('Carrier and tracking number are required before submitting tracking.');
      return;
    }

    setTrackingBusyByPurchaseId((prev) => ({ ...prev, [transaction.orderId]: true }));
    setVerificationError('');
    setVerificationInfo('');

    try {
      const response = await fetch(`${ESCROW_API_BASE}/orders/submit-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({
          orderId: transaction.orderId,
          carrier,
          trackingNumber,
          trackingUrl
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to submit tracking details.');
      }

      await updateDoc(doc(db, 'purchaseIntents', transaction.orderId), {
        shippingCarrier: carrier,
        trackingNumber,
        trackingUrl: trackingUrl || null,
        shipmentStatus: 'tracking_submitted',
        escrowStatus: 'shipped',
        updatedAt: serverTimestamp()
      });

      setVerificationInfo(`Tracking submitted for ${transaction.cardTitle || 'this order'}. The buyer can now release the held funds.`);
    } catch (error) {
      console.error('Failed to submit tracking:', error);
      setVerificationError(error.message || 'Unable to submit tracking details.');
    } finally {
      setTrackingBusyByPurchaseId((prev) => ({ ...prev, [transaction.orderId]: false }));
    }
  };

  const handleReleaseSellerFundsEarly = async (transaction) => {
    if (!transaction?.orderId || !transaction?.isBuyer) return;

    const sellerVerificationRecord = sellerVerifications.find((entry) => entry.userId === transaction.sellerUid || entry.uid === transaction.sellerUid) || {};
    const connectedAccountId = getConnectedAccountIdFromRecord(transaction, {}, sellerVerificationRecord);

    if (!connectedAccountId) {
      setAuthError('Seller has not linked a Stripe connected account yet, so funds cannot be released.');
      return;
    }

    setReleaseBusyByPurchaseId((prev) => ({ ...prev, [transaction.orderId]: true }));
    setAuthError('');

    try {
      const response = await fetch(`${ESCROW_API_BASE}/orders/accept-delivery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({
          orderId: transaction.orderId
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to release seller funds.');
      }

      await updateDoc(doc(db, 'purchaseIntents', transaction.orderId), {
        sellerConnectedAccountId: connectedAccountId,
        sellerTransferId: payload.transferId || null,
        status: 'released',
        escrowStatus: 'released',
        fundsReleasedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setAuthInfo(`Released ${formatMoney(transaction.escrowAmount || transaction.listingPrice || 0)} to ${transaction.sellerName || 'the seller'}.`);
    } catch (error) {
      console.error('Failed to release seller funds:', error);
      setAuthError(error.message || 'Unable to release seller funds.');
    } finally {
      setReleaseBusyByPurchaseId((prev) => ({ ...prev, [transaction.orderId]: false }));
    }
  };

  const handleOpenOrderDispute = async (transaction) => {
    if (!transaction?.orderId || !transaction?.isBuyer) return;

    const disputeReason = String(disputeDrafts[transaction.orderId] || '').trim();
    if (!disputeReason) {
      setAuthError('Enter a dispute reason before opening a dispute.');
      return;
    }

    setDisputeBusyByPurchaseId((prev) => ({ ...prev, [transaction.orderId]: true }));
    setAuthError('');

    try {
      const response = await fetch(`${ESCROW_API_BASE}/orders/open-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({
          orderId: transaction.orderId,
          disputeReason
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to open dispute.');
      }

      await updateDoc(doc(db, 'purchaseIntents', transaction.orderId), {
        status: 'disputed',
        escrowStatus: 'disputed',
        disputeReason,
        updatedAt: serverTimestamp()
      });

      setAuthInfo(`Dispute opened for ${transaction.cardTitle || 'this order'}. CardSwipers admin will review the shipment and transaction history.`);
    } catch (error) {
      console.error('Failed to open dispute:', error);
      setAuthError(error.message || 'Unable to open dispute.');
    } finally {
      setDisputeBusyByPurchaseId((prev) => ({ ...prev, [transaction.orderId]: false }));
    }
  };

  const handleSendInterest = async () => {
    if (!currentCard || !firebaseUser || interestBusy) return;
    setInterestError('');
    setInterestBusy(true);

    const cashAmount = parseDollarValue(pendingCashAmount);
    if (pendingDealType === 'hybrid_trade' && (!cashAmount || cashAmount <= 0)) {
      setInterestError('Enter the cash difference for a hybrid trade.');
      setInterestBusy(false);
      return;
    }

    // Optimistically filter deck and close modal immediately
    const nextDeck = deck.filter((card) => card.id !== currentCard.id);
    setDeck(nextDeck);
    setShowInterestModal(false);
    setSwipeFeedback('like');

    try {
      if (pendingDealType === 'cash_sale' || pendingInterestType === INSTANT_PURCHASE_ACTION) {
        await withTimeout(handleInstantPurchase(currentCard), 12000, 'Instant purchase timed out');
        advanceDeck();
        return;
      }

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
        dealType: pendingDealType,
        cashAmount: pendingDealType === 'hybrid_trade' ? cashAmount : 0,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        }),
        12000,
        'Sending interest timed out'
      );

      advanceDeck();
    } catch (error) {
      console.error('Failed to send interest:', error);
      // Restore card to deck if Firestore write failed
      setDeck((prevDeck) => [...prevDeck, currentCard]);
      setShowInterestModal(true);
      setSwipeFeedback(null);
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
    if (newCard.saleMode !== 'trade_only' && !hasSellerPaymentAccess) {
      setPostImageError('Seller verification is required before posting Buy Now listings. Submit verification below and continue trading while pending.');
      return;
    }
    if (!postFrontImageFile || !postBackImageFile) {
      setPostImageError('Please add both front and back photos before publishing.');
      return;
    }

    setPostImageError('');
    setIsPostingCard(true);

    let createdId = null;
    let frontImageUrl = '';
    let backImageUrl = '';
    let didPersist = false;
    const isRawCard = newCard.gradingCompany === 'Raw (Ungraded)';
    const conditionLabel = isRawCard
      ? `Raw - ${newCard.rawCondition}`
      : `${newCard.gradingCompany} ${newCard.grade}`;

    const sellerVerificationProfileStatus =
      String(currentUserProfile?.sellerVerificationStatus || currentUserProfile?.verificationStatus || 'unverified').toLowerCase();

    const uploadCardImage = async (file, label) => {
      const optimizedFile = await compressImageFile(file);
      const safeFileName = optimizedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const imageRef = ref(storage, `cards/${firebaseUser?.uid || 'anonymous'}/${Date.now()}-${label}-${safeFileName}`);
      await withTimeout(uploadBytes(imageRef, optimizedFile), 12000, `${label} image upload timed out`);
      return withTimeout(getDownloadURL(imageRef), 12000, `${label} image URL fetch timed out`);
    };

    try {
      frontImageUrl = await uploadCardImage(postFrontImageFile, 'front');
      backImageUrl = await uploadCardImage(postBackImageFile, 'back');

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
        buyNowPrice: newCard.buyNowPrice || newCard.estimatedValue || '$0',
        saleMode: newCard.saleMode || 'trade_and_sale',
        sellerState: normalizeStateCode(newCard.sellerState || currentUserProfile?.state || currentUserProfile?.shippingState || ''),
        sellerVerified: sellerVerificationProfileStatus === 'verified',
        sellerVerificationStatus: sellerVerificationProfileStatus,
        verifiedSellerBadge: sellerVerificationProfileStatus === 'verified',
        listedAt: serverTimestamp(),
        imageFrontUrl: frontImageUrl,
        imageBackUrl: backImageUrl,
        imageUrl: frontImageUrl,
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

    const newPostedCard = {
      id: createdId,
      title: newCard.title,
      name: newCard.title,
      brand: newCard.brand,
      category: newCard.brand,
      condition: conditionLabel,
      imageFrontUrl: frontImageUrl,
      imageBackUrl: backImageUrl,
      imageUrl: frontImageUrl,
      owner: firebaseUser?.displayName || firebaseUser?.email || 'Collector',
      ownerUid: firebaseUser?.uid || null,
      tradeValue: newCard.estimatedValue || '$0',
      avgMarketValue: newCard.estimatedValue || '$0',
      recentComps: newCard.estimatedValue || '$0',
      buyNowPrice: newCard.buyNowPrice || newCard.estimatedValue || '$0',
      saleMode: newCard.saleMode || 'trade_and_sale',
      sellerState: normalizeStateCode(newCard.sellerState || currentUserProfile?.state || currentUserProfile?.shippingState || ''),
      sellerVerified: sellerVerificationProfileStatus === 'verified',
      sellerVerificationStatus: sellerVerificationProfileStatus,
      verifiedSellerBadge: sellerVerificationProfileStatus === 'verified',
      listedAt: new Date(),
      listedAtLabel: `Listed ${new Date().toLocaleDateString()}`,
      detailLine: conditionLabel,
      cardColor: 'from-blue-600/20 to-blue-500/20',
      borderColor: 'border-blue-500/40',
      lookingFor: newCard.lookingFor || 'Good trades',
      seekingTags: (newCard.lookingFor || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      location: 'Your Collection',
      memberSince: new Date().getFullYear().toString(),
      responseTime: 'Replies same day',
      completedTrades: 0,
      collection: []
    };

    // Add to deck immediately so it appears in swipe feed right away
    setDeck((prevDeck) => [newPostedCard, ...prevDeck]);

    // Also add to collection
    setMyCollection((prevCollection) => [
      {
        id: createdId,
        name: newCard.title,
        brand: newCard.brand,
        condition: conditionLabel,
        imageUrl: frontImageUrl
      },
      ...prevCollection
    ]);

    setNewCard({
      title: '',
      brand: 'Topps',
      cardNumber: '',
      setNumber: '',
      gradingCompany: 'Raw (Ungraded)',
      rawCondition: 'Near Mint - Mint',
      grade: '10 Gem Mint',
      estimatedValue: '',
      buyNowPrice: '',
      sellerState: '',
      saleMode: 'trade_and_sale',
      lookingFor: ''
    });
    setPostComposerStep(1);
    setPostFrontImageFile(null);
    setPostBackImageFile(null);
    setPostFrontImagePreview('');
    setPostBackImagePreview('');
    setCurrentTab('swipe');
  };

  const handlePostImageChange = (side, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPostImageError('Please choose an image file.');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setPostImageError('Image must be under 12MB. The app will optimize it before upload.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const preview = String(reader.result || '');
      if (side === 'front') {
        setPostFrontImagePreview(preview);
        setPostFrontImageFile(file);
      } else {
        setPostBackImagePreview(preview);
        setPostBackImageFile(file);
        setPostComposerStep(2);
      }
      setPostImageError('');
    };
    reader.readAsDataURL(file);

    e.target.value = '';
  };

  const handleScanCardWithOcr = async () => {
    if (scannerBusy) return;

    setScannerBusy(true);
    setScannerInfo('Opening camera...');
    setPostImageError('');

    try {
      const photo = await Camera.getPhoto({
        quality: 95,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: 2200
      });

      const recognitionPath = photo?.path || photo?.webPath;
      if (!recognitionPath) {
        throw new Error('No image was captured for OCR.');
      }

      if (photo?.webPath) {
        setPostFrontImagePreview(photo.webPath);
        const blob = await fetch(photo.webPath).then((response) => response.blob());
        const imageFile = new File([blob], `scan-front-${Date.now()}.jpg`, {
          type: blob.type || 'image/jpeg'
        });
        setPostFrontImageFile(imageFile);
      }

      setScannerInfo('Running on-device OCR...');
      const ocrResult = await runMlKitTextRecognition(recognitionPath);
      const lines = extractTextLinesFromMlKitResult(ocrResult);
      const parsed = parseCardText(lines);
      setScannerDetectedLines(lines.slice(0, 8));

      if (!parsed.cardName && !parsed.cardNumber) {
        setScannerInfo('OCR completed, but no confident card title/number was detected. Try better lighting.');
        return;
      }

      setScannerInfo('Looking up card metadata...');
      let metadata = null;
      try {
        metadata = await fetchCardMetadata(parsed, lines);
      } catch {
        metadata = null;
      }

      setNewCard((prev) => ({
        ...prev,
        title: metadata?.title || parsed.cardName || prev.title,
        brand: metadata?.brand || prev.brand,
        estimatedValue: metadata?.estimatedValue || prev.estimatedValue,
        cardNumber: metadata?.cardNumber || parsed.cardNumber || prev.cardNumber,
        setNumber: metadata?.setNumber || parsed.setNumber || prev.setNumber
      }));

      setPostComposerStep(2);
      setScannerInfo(
        metadata
          ? 'Scan complete. Fields were auto-filled from OCR + card database.'
          : 'Scan complete. Fields were auto-filled from OCR.'
      );
    } catch (error) {
      console.error('Card scan failed:', error);
      setPostImageError(error?.message || 'Card scan failed. Please try again.');
      setScannerInfo('Scanner failed. Check camera permissions and try again.');
    } finally {
      setScannerBusy(false);
    }
  };

  const toggleLookingForOption = (option) => {
    const normalized = option.trim();
    const existing = (newCard.lookingFor || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const nextValues = existing.includes(normalized)
      ? existing.filter((value) => value !== normalized)
      : [...existing, normalized];

    setNewCard({
      ...newCard,
      lookingFor: nextValues.join(', ')
    });
  };

  const handleQuickCaptureFromDock = () => {
    setActiveChat(null);
    setPostComposerStep(1);
    navigateToTab('post');
    window.setTimeout(() => {
      postFrontImageInputRef.current?.click();
    }, 80);
  };

  const handleVerificationDocumentChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setVerificationError('Please upload a JPG, PNG, or WEBP image for your ID.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setVerificationError('Verification image must be under 12MB.');
      return;
    }
    setVerificationDocFile(file);
    setVerificationError('');
  };

  const handleReviewDraftChange = (purchaseId, field, value) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [purchaseId]: {
        rating: Number(prev[purchaseId]?.rating || 5),
        comment: String(prev[purchaseId]?.comment || ''),
        [field]: value
      }
    }));
  };

  const handleSubmitTransactionReview = async (transaction) => {
    if (!firebaseUser || !transaction?.id || !transaction?.counterpartyUid) return;

    const draft = reviewDrafts[transaction.id] || {};
    const rating = Math.max(1, Math.min(5, Number(draft.rating || 5)));
    const comment = String(draft.comment || '').trim();

    if (!comment) {
      setAuthError('Please add a short review comment before submitting.');
      return;
    }

    const reviewId = `${transaction.id}_${firebaseUser.uid}`;

    setReviewBusyByPurchaseId((prev) => ({ ...prev, [transaction.id]: true }));
    setAuthError('');

    try {
      await setDoc(doc(db, 'reviews', reviewId), {
        purchaseId: transaction.id,
        cardId: transaction.cardId || null,
        cardTitle: transaction.cardTitle || '',
        reviewerUid: firebaseUser.uid,
        reviewerName: firebaseUser.displayName || firebaseUser.email || 'Collector',
        reviewerRole: transaction.reviewerRole,
        reviewedUid: transaction.counterpartyUid,
        reviewedName: transaction.counterpartyName,
        reviewedRole: transaction.reviewedRole,
        rating,
        comment,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'purchaseIntents', transaction.id), {
        ...(transaction.reviewerRole === 'buyer'
          ? { buyerReviewed: true, buyerReviewedAt: serverTimestamp() }
          : { sellerReviewed: true, sellerReviewedAt: serverTimestamp() }),
        updatedAt: serverTimestamp()
      });

      setReviewDrafts((prev) => {
        const next = { ...prev };
        delete next[transaction.id];
        return next;
      });
    } catch (error) {
      console.error('Failed to submit transaction review:', error);
      setAuthError('Unable to submit review right now. Please try again.');
    } finally {
      setReviewBusyByPurchaseId((prev) => ({ ...prev, [transaction.id]: false }));
    }
  };

  const handleSubmitVerificationRequest = async () => {
    if (!firebaseUser || verificationBusy) return;

    const legalName = String(verificationForm.legalName || '').trim();
    const birthDate = String(verificationForm.birthDate || '').trim();
    const phone = String(verificationForm.phone || '').trim();
    const email = String(verificationForm.email || firebaseUser.email || '').trim().toLowerCase();
    const verificationTypes = ['seller'];

    if (!legalName || !birthDate || !phone || !email) {
      setVerificationError('Legal name, birth date, phone, and email are all required.');
      return;
    }
    if (!hasAcceptedVerificationTerms) {
      setVerificationError('You must accept the marketplace terms before submitting verification.');
      return;
    }
    if (!verificationDocFile) {
      setVerificationError('Upload a government-issued license/ID to continue.');
      return;
    }

    setVerificationBusy(true);
    setVerificationError('');
    setVerificationInfo('');

    try {
      const optimizedFile = await compressImageFile(verificationDocFile);
      const safeName = optimizedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const docPath = `verification-docs/${firebaseUser.uid}/${Date.now()}-${safeName}`;
      const verificationDocRef = ref(storage, docPath);

      await withTimeout(uploadBytes(verificationDocRef, optimizedFile), 15000, 'Verification upload timed out');
      const verificationDocumentUrl = await withTimeout(getDownloadURL(verificationDocRef), 12000, 'Verification URL fetch timed out');

      await withTimeout(
        addDoc(collection(db, 'sellerVerifications'), {
          userId: firebaseUser.uid,
          uid: firebaseUser.uid,
          userEmail: email,
          email,
          legalName,
          birthDate,
          phone,
          status: 'pending',
          buyerStatus: 'not_requested',
          sellerStatus: 'pending',
          verificationTypes,
          verificationDocumentUrl,
          verificationDocumentPath: docPath,
          notes: String(verificationForm.notes || '').trim(),
          reviewedBy: null,
          reviewedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }),
        12000,
        'Verification submission timed out'
      );

      const nextUserPayload = {
        legalName,
        birthDate,
        phone,
        email,
        verificationStatus: 'pending',
        verificationSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      nextUserPayload.sellerVerificationStatus = 'pending';
      await setDoc(
        doc(db, 'subscriptions', `verified_seller_${firebaseUser.uid}`),
        {
          userId: firebaseUser.uid,
          email,
          planType: 'verified_seller',
          planName: 'Verified Seller',
          amount: VERIFIED_SELLER_SUBSCRIPTION_PRICE,
          billingInterval: 'monthly',
          status: 'pending_verification',
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );

      await withTimeout(updateDoc(doc(db, 'users', firebaseUser.uid), nextUserPayload), 10000, 'Profile update timed out');

      setVerificationInfo('Verification submitted. CS support will review your request in 1-2 days. You can continue trading while status is pending.');
      setVerificationDocFile(null);
      if (verificationDocInputRef.current) {
        verificationDocInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to submit verification request:', error);
      const isNetworkIssue =
        String(error?.code || '').includes('offline') ||
        String(error?.code || '').includes('unavailable') ||
        String(error?.code || '').includes('operation-timeout');
      setVerificationError(
        isNetworkIssue
          ? 'Network issue while submitting verification. Please try again.'
          : 'Unable to submit verification request right now. Please try again.'
      );
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleStartIdentityVerification = async () => {
    if (!firebaseUser || verificationSessionBusy) return;

    setVerificationSessionBusy(true);
    setVerificationError('');
    try {
      const response = await fetch('/api/verification/create-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Stripe Identity did not return a hosted verification link.');
      }
      window.open(payload.url, '_blank', 'noopener,noreferrer');
      setVerificationInfo('Stripe Identity opened in a new window. Complete the document check, then return here.');
    } catch (error) {
      console.error('Failed to start Stripe Identity verification:', error);
      setVerificationError(error.message || 'Unable to start identity verification.');
    } finally {
      setVerificationSessionBusy(false);
    }
  };

  const handleAdminReviewVerification = async (record, decision) => {
    if (!firebaseUser || !record?.id || !record?.userId) return;

    const normalizedDecision = String(decision || '').toLowerCase();
    if (normalizedDecision !== 'verified' && normalizedDecision !== 'rejected') return;

    const requestedTypes = Array.isArray(record.verificationTypes) ? record.verificationTypes : [];
    const nextSellerStatus =
      requestedTypes.includes('seller')
        ? normalizedDecision
        : (record.sellerStatus || 'not_requested');
    const overallStatus = nextSellerStatus === 'verified' ? 'verified' : normalizedDecision;

    try {
      await updateDoc(doc(db, 'sellerVerifications', record.id), {
        status: normalizedDecision,
        buyerStatus: 'not_requested',
        sellerStatus: nextSellerStatus,
        reviewedBy: firebaseUser.uid,
        reviewerEmail: firebaseUser.email || '',
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'users', record.userId), {
        verificationStatus: overallStatus,
        sellerVerificationStatus: nextSellerStatus,
        verificationReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to review verification request:', error);
      setAdminUsersError('Failed to update verification request. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    const trimmedMessage = chatDraft.trim();
    if (!firebaseUser) {
      setAuthError('You must be signed in to send messages.');
      return;
    }
    if (!activeChat) {
      setAuthError('No active chat selected. Please select a match to message.');
      return;
    }
    if (!trimmedMessage) {
      setAuthError('Please enter a message before sending.');
      return;
    }

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

      setChatDraft('');
      setAuthError('');
    } catch (error) {
      console.error('Failed to persist message:', error);
      const errorMessage =
        error?.code === 'operation-timeout' || error?.code?.includes('offline') || error?.code?.includes('unavailable')
          ? 'Network issue while sending message. Please try again.'
          : 'Failed to send message. Please try again.';
      setAuthError(errorMessage);
    }
  };

  const handleSendOffer = async () => {
    if (!firebaseUser || !activeChat?.id || offerBusy) return;

    const amount = parseDollarValue(offerDraftAmount);
    if (offerDealType !== 'pure_trade' && (!amount || amount <= 0)) {
      setAuthError('Enter a valid offer amount.');
      return;
    }

    const fromUserId = firebaseUser.uid;
    const participants = Array.isArray(activeChat.participants) ? activeChat.participants : [];
    const toUserId = participants.find((uid) => uid !== fromUserId) || activeChat.counterpartyUserId;
    if (!toUserId) {
      setAuthError('Unable to determine who should receive this offer.');
      return;
    }

    const sellerUid = activeChat.ownerUserId || null;
    const buyerUid = activeChat.requesterUserId || null;
    if (offerDealType === 'pure_trade' && amount > 0) {
      setAuthError('Trade-only offers cannot include a cash amount. Choose Card + Cash instead.');
      return;
    }

    setOfferBusy(true);
    setAuthError('');
    try {
      await addDoc(collection(db, 'offers'), {
        matchId: activeChat.id,
        cardId: activeChat.cardId || null,
        cardTitle: activeChat.cardTitle || '',
        buyerUid,
        sellerUid,
        fromUserId,
        fromUserName: firebaseUser.displayName || firebaseUser.email || 'Collector',
        toUserId,
        amount,
        dealType: offerDealType,
        cashAmount: offerDealType === 'pure_trade' ? 0 : amount,
        currency: 'USD',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const summaryMessage = offerDealType === 'pure_trade'
        ? 'Trade-only offer sent'
        : `Hybrid offer sent: ${formatMoney(amount)} cash`;
      await updateDoc(doc(db, 'matches', activeChat.id), {
        lastMessage: summaryMessage,
        unreadBy: [toUserId],
        updatedAt: serverTimestamp()
      });

      setOfferDraftAmount('');
    } catch (error) {
      console.error('Failed to send offer:', error);
      setAuthError('Unable to send offer right now. Please try again.');
    } finally {
      setOfferBusy(false);
    }
  };

  const handleOfferDecision = async (offer, decision) => {
    if (!firebaseUser || !activeChat?.id || !offer?.id) return;

    const normalized = String(decision || '').toLowerCase();
    const isCounter = normalized === 'counter';
    const nextStatus = isCounter ? 'countered' : normalized;

    if (!['accepted', 'rejected', 'countered'].includes(nextStatus)) {
      return;
    }

    if (offer.toUserId !== firebaseUser.uid) {
      setAuthError('Only the offer recipient can take this action.');
      return;
    }

    let counterAmount = null;
    if (isCounter) {
      const raw = window.prompt('Enter your counter-offer amount (USD):', String(offer.amount || ''));
      if (raw === null) return;
      counterAmount = parseDollarValue(raw);
      if (!counterAmount || counterAmount <= 0) {
        setAuthError('Counter offer must be greater than $0.');
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'offers', offer.id), {
        status: nextStatus,
        decidedBy: firebaseUser.uid,
        decidedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const normalizedDealType = String(offer.dealType || '').toLowerCase();
      const requiresProtectionCheckout = nextStatus === 'accepted' &&
        ['pure_trade', 'hybrid_trade', 'cash_sale'].includes(normalizedDealType) &&
        (normalizedDealType === 'pure_trade' || offer.buyerUid === firebaseUser.uid);
      if (requiresProtectionCheckout) {
        const checkoutCard = {
          id: offer.cardId || activeChat.cardId || null,
          title: offer.cardTitle || activeChat.cardTitle || 'Card trade',
          brand: offer.brand || activeChat.brand || '',
          ownerUid: offer.sellerUid || activeChat.ownerUserId || null,
          owner: offer.sellerName || activeChat.counterpartyName || 'Seller',
          sellerConnectedAccountId: offer.sellerConnectedAccountId || activeChat.sellerConnectedAccountId || null,
          connectedAccountId: offer.connectedAccountId || activeChat.connectedAccountId || null,
          sellerState: offer.sellerState || activeChat.sellerState || '',
          buyNowPrice: normalizedDealType === 'pure_trade' ? 0 : offer.cashAmount || offer.amount || 0,
          tradeValue: normalizedDealType === 'pure_trade' ? 0 : offer.cashAmount || offer.amount || 0,
          value: normalizedDealType === 'pure_trade' ? 0 : offer.cashAmount || offer.amount || 0
        };
        const checkoutStarted = await handleInstantPurchase(checkoutCard, {
          cashAmount: offer.cashAmount || offer.amount || 0,
          offerId: offer.id,
          dealType: normalizedDealType,
          feeOnly: normalizedDealType === 'pure_trade',
          protectionRole: offer.buyerUid === firebaseUser.uid ? 'buyer' : 'seller',
          buyerProtectionPaymentStatus: offer.buyerProtectionPaymentStatus || null,
          sellerProtectionPaymentStatus: offer.sellerProtectionPaymentStatus || null,
          advanceAfterPurchase: false
        });
        await updateDoc(doc(db, 'offers', offer.id), {
          paymentStatus: checkoutStarted ? 'checkout_open' : 'payment_configuration_pending',
          updatedAt: serverTimestamp()
        });
        if (!checkoutStarted) return;
        setAuthInfo('Offer accepted. Complete secure checkout to place the cash difference in escrow.');
        return;
      }

      const fromUserId = firebaseUser.uid;
      const participants = Array.isArray(activeChat.participants) ? activeChat.participants : [];
      const toUserId = participants.find((uid) => uid !== fromUserId) || offer.fromUserId;

      let summaryMessage = `Offer ${nextStatus}: ${formatMoney(offer.amount || 0)}`;
      if (isCounter && counterAmount) {
        await addDoc(collection(db, 'offers'), {
          matchId: activeChat.id,
          cardId: offer.cardId || activeChat.cardId || null,
          cardTitle: offer.cardTitle || activeChat.cardTitle || '',
          buyerUid: offer.buyerUid || activeChat.requesterUserId || null,
          sellerUid: offer.sellerUid || activeChat.ownerUserId || null,
          fromUserId,
          fromUserName: firebaseUser.displayName || firebaseUser.email || 'Collector',
          toUserId,
          amount: counterAmount,
          dealType: offer.dealType || 'hybrid_trade',
          cashAmount: offer.dealType === 'pure_trade' ? 0 : counterAmount,
          currency: 'USD',
          status: 'pending',
          parentOfferId: offer.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        summaryMessage = `Counter offer sent: ${formatMoney(counterAmount)}`;
      }

      await updateDoc(doc(db, 'matches', activeChat.id), {
        lastMessage: summaryMessage,
        unreadBy: [toUserId],
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update offer decision:', error);
      setAuthError('Unable to update this offer. Please try again.');
    }
  };

  const handleForgotPassword = async () => {
    setAuthError('');
    setAuthInfo('');
    const normalizedEmail = normalizeAuthEmail(authEmail);

    if (!normalizedEmail) {
      setAuthError('Enter your account email to receive a reset link.');
      return;
    }

    setAuthEmail(normalizedEmail);
    setIsSendingReset(true);
    try {
      if (!isNativeApp) {
        const signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail);

        if (signInMethods.includes('google.com')) {
          setAuthError('That account uses Google sign-in, so no password reset email will be sent. Tap Continue with Google instead.');
          return;
        }

        if (signInMethods.length > 0 && !signInMethods.includes('password')) {
          setAuthError('That account does not use a password login. Please sign in with the method you used when creating it.');
          return;
        }
      }

      await withTimeout(sendPasswordResetEmail(auth, normalizedEmail), 20000, 'Sending reset link timed out');
      setAuthInfo('Reset link sent. Check your inbox and spam folder. It can take a few minutes to arrive.');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error, 'reset'));
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (isAuthSubmitting) return;

    setAuthError('');
    setAuthInfo('');
    const normalizedEmail = normalizeAuthEmail(authEmail);

    if (!normalizedEmail || !authPassword) {
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

    if (authMode === 'create' && !hasAcceptedEscrowTerms) {
      setAuthError('You must agree to the Terms of Service before creating an account.');
      return;
    }

    setAuthEmail(normalizedEmail);
    setIsAuthSubmitting(true);

    try {
      let signInMethods = [];
      if (!isNativeApp) {
        signInMethods = await withTimeout(
          fetchSignInMethodsForEmail(auth, normalizedEmail),
          15000,
          'Checking sign-in methods timed out'
        );
      }

      if (authMode === 'create') {
        if (signInMethods.length > 0) {
          setAuthError(getSignInMethodMessage(signInMethods, 'create'));
          return;
        }

        const credential = await withTimeout(
          createUserWithEmailAndPassword(auth, normalizedEmail, authPassword),
          30000,
          'Creating account timed out'
        );
        const displayName = authDisplayName.trim();
        await withTimeout(updateProfile(credential.user, { displayName }), 10000, 'Updating profile timed out');
        await withTimeout(
          setDoc(
            doc(db, 'users', credential.user.uid),
            {
              uid: credential.user.uid,
              email: normalizedEmail,
              displayName,
              legalName: displayName,
              tos_accepted: true,
              tos_accepted_at: serverTimestamp(),
              tos_version_accepted: 'v1.1',
              updatedAt: serverTimestamp()
            },
            { merge: true }
          ),
          12000,
          'Saving Terms acceptance timed out'
        );
      } else {
        if (signInMethods.includes('google.com')) {
          setAuthError(getSignInMethodMessage(signInMethods, 'login'));
          return;
        }

        if (signInMethods.length > 0 && !signInMethods.includes('password')) {
          setAuthError(getSignInMethodMessage(signInMethods, 'login'));
          return;
        }

        await withTimeout(
          signInWithEmailAndPassword(auth, normalizedEmail, authPassword),
          30000,
          'Signing in timed out'
        );
      }
        setCurrentTab('onboarding');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error, authMode === 'create' ? 'create' : 'login'));
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    setAuthInfo('');
    try {
      const provider = new GoogleAuthProvider();

      if (isNativeApp) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, '1');
        }
        setIsGoogleRedirecting(true);
        setAuthInfo('Opening Google sign-in in your browser...');
        await signInWithRedirect(auth, provider);
        return;
      }

      await signInWithPopup(auth, provider);
      setCurrentTab('onboarding');
    } catch (error) {
      setIsGoogleRedirecting(false);
      setAuthError(getAuthErrorMessage(error, 'google'));
    }
  };

  const navigateToTab = (nextTab) => {
    if (!isAuthenticated) {
      setCurrentTab(isNativeApp ? 'auth' : 'landing');
      return;
    }
    if (nextTab === 'admin' && !canAccessAdmin) {
      setCurrentTab('onboarding');
      return;
    }
    setCurrentTab(nextTab);
  };

  const handleOpenNotifications = () => {
    setShowNotificationsPanel(true);
    setAccountMenuOpen(false);
  };

  const handleNotificationClick = (notification) => {
    setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    if (notification.actionTab) {
      navigateToTab(notification.actionTab);
    }
    setShowNotificationsPanel(false);
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const resetClubDraft = () => {
    if (clubDraftLogoPreview) URL.revokeObjectURL(clubDraftLogoPreview);
    setClubDraftName('');
    setClubDraftDescription('');
    setClubDraftLogoId('');
    setClubDraftLogoFile(null);
    setClubDraftLogoPreview('');
    setClubDraftError('');
  };

  const openCreateClub = () => {
    resetClubDraft();
    setClubError('');
    setClubInfo('');
    setCurrentTab('create-club');
  };

  const handleClubLogoFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setClubDraftError('Choose an image file for the club logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setClubDraftError('Club logos must be 5 MB or smaller.');
      return;
    }

    const image = new Image();
    const previewUrl = URL.createObjectURL(file);
    image.onload = () => {
      if (image.width !== 640 || image.height !== 640) {
        URL.revokeObjectURL(previewUrl);
        setClubDraftError('Custom club logos must be exactly 640 x 640 pixels.');
        return;
      }
      if (clubDraftLogoPreview) URL.revokeObjectURL(clubDraftLogoPreview);
      setClubDraftLogoFile(file);
      setClubDraftLogoPreview(previewUrl);
      setClubDraftLogoId('custom');
      setClubDraftError('');
    };
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      setClubDraftError('That image could not be read. Choose another file.');
    };
    image.src = previewUrl;
  };

  const handleCreateClub = async () => {
    if (!firebaseUser || clubCreateBusy) return;
    const ownerName = currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector';
    const clubName = clubDraftName.trim();
    if (clubName.length < 3 || clubName.length > 20) {
      setClubDraftError('Club names must be between 3 and 20 characters.');
      return;
    }
    if (!clubDraftLogoId) {
      setClubDraftError('Choose a club logo before confirming.');
      return;
    }

    setClubCreateBusy(true);
    setClubError('');
    setClubDraftError('');
    setClubInfo('');

    try {
      let logoUrl = '';
      if (clubDraftLogoId === 'custom' && clubDraftLogoFile) {
        const safeFileName = clubDraftLogoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const logoRef = ref(storage, `club-logos/${firebaseUser.uid}/${Date.now()}-${safeFileName}`);
        await withTimeout(uploadBytes(logoRef, clubDraftLogoFile), 15000, 'Club logo upload timed out');
        logoUrl = await withTimeout(getDownloadURL(logoRef), 12000, 'Club logo URL fetch timed out');
      }

      let clubCode = buildClubCode();
      for (let attempts = 0; attempts < 5; attempts += 1) {
        const existing = await getDocs(query(collection(db, 'clubs'), where('code', '==', clubCode), limit(1)));
        if (existing.empty) break;
        clubCode = buildClubCode();
      }

      const clubRef = await addDoc(collection(db, 'clubs'), {
        name: clubName,
        description: clubDraftDescription.trim() || 'Club built for card trade nights and member credit management.',
        code: clubCode,
        logoType: clubDraftLogoId === 'custom' ? 'custom' : 'preset',
        logoPresetId: clubDraftLogoId === 'custom' ? null : clubDraftLogoId,
        logoUrl,
        accessMode: 'private',
        creditHierarchy: 'owner→agent→member',
        ownerUid: firebaseUser.uid,
        ownerEmail: firebaseUser.email || '',
        ownerName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        memberCount: 1,
        activeTables: 0,
        totalEscrow: 0,
        creditLedger: {
          ownerUid: firebaseUser.uid,
          ownerBalance: 'infinite',
          agentQuotas: {},
          memberBalances: {
            [firebaseUser.uid]: {
              role: 'owner',
              credits: 'infinite',
              creditLimit: 'infinite',
              escrowHeld: 0,
              status: 'active'
            }
          },
          escrowVault: 0
        },
        defaultEventConfig: {
          buyInCredits: 50,
          guaranteedPool: 1000,
          registrationWindowMinutes: 30,
          roundMinutes: 10,
          capLimit: 64,
          status: 'upcoming'
        }
      });

      await setDoc(doc(clubRef, 'members', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        email: firebaseUser.email || '',
        role: 'owner',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        credits: 'infinite',
        creditLimit: 'infinite',
        escrowHeld: 0,
        status: 'active'
      }, { merge: true });

      setSelectedClubId(clubRef.id);
      setClubInfo('Club created. Owner-led credit hierarchy is active and agents can be assigned for trade nights.');
      resetClubDraft();
      setCurrentTab('onboarding');
    } catch (error) {
      console.error('Failed creating club:', error);
      setClubDraftError('Could not create club right now. Please try again.');
    } finally {
      setClubCreateBusy(false);
    }
  };

  const handleJoinClubByCode = async () => {
    if (!firebaseUser || clubJoinBusy) return;
    const normalizedCode = clubJoinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setClubError('Enter a club code to join.');
      return;
    }

    setClubJoinBusy(true);
    setClubError('');
    setClubInfo('');

    try {
      const clubSnapshot = await getDocs(query(collection(db, 'clubs'), where('code', '==', normalizedCode), limit(1)));
      if (clubSnapshot.empty) {
        setClubError('No club found for that code.');
        return;
      }

      const clubDoc = clubSnapshot.docs[0];
      const clubData = clubDoc.data();
      const clubAccessMode = getClubAccessMode(clubData);
      const banSnapshot = await getDoc(doc(clubDoc.ref, 'bans', firebaseUser.uid));
      if (banSnapshot.exists()) {
        setClubError('You have been blocked from this club by its moderators.');
        return;
      }

      const memberProfile = {
        uid: firebaseUser.uid,
        displayName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        email: firebaseUser.email || '',
        role: 'member',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        credits: 0,
        creditLimit: 0,
        escrowHeld: 0,
        status: 'active'
      };

      if (clubAccessMode === 'public') {
        await setDoc(doc(clubDoc.ref, 'members', firebaseUser.uid), memberProfile, { merge: true });

        setSelectedClubId(clubDoc.id);
        setClubJoinCode('');
        setClubInfo(`Joined ${clubData?.name || 'club'}. Credits are tied to the club ledger and trade-night escrow rules.`);
        return;
      }

      await addDoc(collection(db, 'clubs', clubDoc.id, 'joinRequests'), {
        userId: firebaseUser.uid,
        userName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        role: 'member',
        status: 'pending',
        requestedAt: serverTimestamp(),
        creditRequest: 0,
        requestType: 'member-join'
      });

      setSelectedClubId(clubDoc.id);
      setClubJoinCode('');
      setClubInfo(`Private club request sent to ${clubData?.name || 'the club owner'}. Awaiting approval.`);
    } catch (error) {
      console.error('Failed joining club:', error);
      setClubError('Unable to join that club right now.');
    } finally {
      setClubJoinBusy(false);
    }
  };

  const handleCreateTradeNight = async () => {
    if (!firebaseUser || !selectedClubId || !canModerateClubPosts || clubEventBusyId) return;

    setClubEventBusyId('create');
    setClubError('');
    setClubInfo('');

    try {
      const config = selectedClub?.defaultEventConfig || {};
      const buyInCredits = Math.max(1, Number(config.buyInCredits || 50));
      const capLimit = Math.max(2, Number(config.capLimit || 64));
      const guaranteedPool = Math.max(0, Number(config.guaranteedPool || 0));
      const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await addDoc(collection(db, 'clubs', selectedClubId, 'events'), {
        title: 'Trade Night',
        status: 'registration',
        format: 'mtt-trade-night',
        buyInCredits,
        guaranteedPool,
        capLimit,
        currentRegistrations: 0,
        escrowTotal: 0,
        roundMinutes: Math.max(1, Number(config.roundMinutes || 10)),
        scheduledFor,
        createdByUid: firebaseUser.uid,
        createdByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Moderator',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setClubInfo('Trade night opened for registration. Buy-ins will be held in club escrow.');
    } catch (error) {
      console.error('Failed creating trade night:', error);
      setClubError('Could not create the trade night.');
    } finally {
      setClubEventBusyId('');
    }
  };

  const handleRegisterForTradeNight = async (event) => {
    if (!firebaseUser || !selectedClubId || !event?.id || clubEventBusyId) return;
    if (!selectedClubMembership || isSelectedClubBanned) {
      setClubError('Join the club before registering for a trade night.');
      return;
    }

    setClubEventBusyId(`register-${event.id}`);
    setClubError('');
    setClubInfo('');

    try {
      const response = await fetch('/api/clubs/register-trade-night', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({ clubId: selectedClubId, eventId: event.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Registration could not be completed.');
      }
      setClubInfo(`Registered for ${event.title || 'Trade Night'}. ${payload.buyInCredits} credits are held in escrow.`);
    } catch (error) {
      console.error('Failed registering for trade night:', error);
      setClubError(error.message || 'Could not register for this trade night.');
    } finally {
      setClubEventBusyId('');
    }
  };

  const handleReportChatUser = async () => {
    if (!firebaseUser || !activeChat?.id || chatReportBusy) return;

    const reasonInput = window.prompt(`Report @${activeChat.counterpartyName || 'this user'} for:`, 'Harassment, scam attempt, or abusive behavior');
    const reason = String(reasonInput || '').trim();
    if (!reason) return;

    setChatReportBusy(true);
    setAuthError('');
    try {
      await addDoc(collection(db, 'chatReports'), {
        status: 'open',
        contextType: 'direct-match',
        matchId: activeChat.id,
        reportedUserId: activeChat.counterpartyUserId || null,
        reportedUserName: activeChat.counterpartyName || activeChat.user || 'Collector',
        reportedByUid: firebaseUser.uid,
        reportedByEmail: firebaseUser.email || '',
        reportedByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        reason,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setAuthInfo('Report submitted to CardSwipers admin for review.');
    } catch (error) {
      console.error('Failed to report chat user:', error);
      setAuthError('Could not submit your report right now. Please try again.');
    } finally {
      setChatReportBusy(false);
    }
  };

  const handleReportClubMember = async (member) => {
    if (!firebaseUser || !selectedClubId || !member?.uid || clubReportBusy) return;
    if (!selectedClubMembership) {
      setClubError('Join this club before submitting reports.');
      return;
    }

    const reasonInput = window.prompt(`Report ${member.displayName || member.email || member.uid} for:`, 'Spam, abuse, or policy violation');
    const reason = String(reasonInput || '').trim();
    if (!reason) return;

    setClubReportBusy(true);
    setClubError('');
    setClubInfo('');
    try {
      await addDoc(collection(db, 'clubs', selectedClubId, 'reports'), {
        status: 'open',
        reportType: 'member',
        clubId: selectedClubId,
        clubName: selectedClub?.name || '',
        reportedByUid: firebaseUser.uid,
        reportedByEmail: firebaseUser.email || '',
        reportedByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        targetUid: member.uid,
        targetName: member.displayName || member.email || member.uid,
        targetRole: member.role || 'member',
        reason,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setClubInfo('Report submitted. Club owner and agents can now review it.');
    } catch (error) {
      console.error('Failed reporting club member:', error);
      setClubError('Could not submit club report right now.');
    } finally {
      setClubReportBusy(false);
    }
  };

  const handleReportClubPost = async (post) => {
    if (!firebaseUser || !selectedClubId || !post?.id || clubReportBusy) return;
    if (!selectedClubMembership) {
      setClubError('Join this club before submitting reports.');
      return;
    }

    const reasonInput = window.prompt(`Report post "${post.title || 'Untitled Card'}" for:`, 'Fake listing, abusive content, or scam attempt');
    const reason = String(reasonInput || '').trim();
    if (!reason) return;

    setClubReportBusy(true);
    setClubError('');
    setClubInfo('');
    try {
      await addDoc(collection(db, 'clubs', selectedClubId, 'reports'), {
        status: 'open',
        reportType: 'post',
        clubId: selectedClubId,
        clubName: selectedClub?.name || '',
        reportedByUid: firebaseUser.uid,
        reportedByEmail: firebaseUser.email || '',
        reportedByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        targetUid: post.createdByUid || null,
        targetName: post.createdByName || 'Unknown',
        targetPostId: post.id,
        targetPostTitle: post.title || '',
        reason,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setClubInfo('Post report submitted for moderator review.');
    } catch (error) {
      console.error('Failed reporting club post:', error);
      setClubError('Could not submit post report right now.');
    } finally {
      setClubReportBusy(false);
    }
  };

  const handleUpdateClubMemberRole = async (memberUid, role) => {
    if (!firebaseUser || !selectedClubId || !canManageClubMembers) return;
    if (memberUid === firebaseUser.uid) return;
    setClubActionBusyId(`role-${memberUid}`);
    setClubError('');
    setClubInfo('');

    try {
      await setDoc(doc(db, 'clubs', selectedClubId, 'members', memberUid), {
        role,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setClubInfo('Member role updated.');
    } catch (error) {
      console.error('Failed updating club role:', error);
      setClubError('Could not update that member role.');
    } finally {
      setClubActionBusyId('');
    }
  };

  const handleAllocateClubCredits = async (member) => {
    if (!firebaseUser || !selectedClubId || !member?.uid || !canModerateClubPosts) return;
    const creditsInput = window.prompt(`Credits to assign to ${member.displayName || member.email || 'this member'}:`, '50');
    const credits = Math.floor(Number(creditsInput));
    if (!Number.isFinite(credits) || credits <= 0) return;

    setClubActionBusyId(`credits-${member.uid}`);
    setClubError('');
    setClubInfo('');
    try {
      const response = await fetch('/api/clubs/allocate-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({ clubId: selectedClubId, memberId: member.uid, credits })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Credit allocation failed.');
      setClubInfo(`${credits} credits assigned to ${member.displayName || member.email || 'member'}.`);
    } catch (error) {
      console.error('Failed allocating club credits:', error);
      setClubError(error.message || 'Could not allocate credits.');
    } finally {
      setClubActionBusyId('');
    }
  };

  const handleRemoveClubMember = async (member) => {
    if (!firebaseUser || !selectedClubId || !member?.uid) return false;
    if (member.role === 'owner') return false;
    if (!canModerateClubPosts) return false;

    setClubActionBusyId(`remove-${member.uid}`);
    setClubError('');
    setClubInfo('');

    try {
      await deleteDoc(doc(db, 'clubs', selectedClubId, 'members', member.uid));
      setClubInfo('Member removed from this club.');
      return true;
    } catch (error) {
      console.error('Failed removing club member:', error);
      setClubError('Could not remove that member.');
      return false;
    } finally {
      setClubActionBusyId('');
    }
  };

  const handleBanClubMember = async (member, reason = '') => {
    if (!firebaseUser || !selectedClubId || !member?.uid) return false;
    if (!canModerateClubPosts || member.role === 'owner' || member.uid === selectedClub?.ownerUid) return false;

    const banReason = String(reason || '').trim() || 'Club moderation action';
    setClubActionBusyId(`ban-${member.uid}`);
    setClubError('');
    setClubInfo('');

    try {
      await setDoc(doc(db, 'clubs', selectedClubId, 'bans', member.uid), {
        uid: member.uid,
        displayName: member.displayName || member.email || member.uid,
        email: member.email || '',
        reason: banReason,
        bannedByUid: firebaseUser.uid,
        bannedByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Moderator',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      await deleteDoc(doc(db, 'clubs', selectedClubId, 'members', member.uid));
      setClubInfo('Member has been blocked and removed from this club.');
      return true;
    } catch (error) {
      console.error('Failed banning club member:', error);
      setClubError('Could not block that member right now.');
      return false;
    } finally {
      setClubActionBusyId('');
    }
  };

  const handleResolveClubReport = async (report, status = 'resolved', action = 'dismissed') => {
    if (!firebaseUser || !selectedClubId || !report?.id || !canModerateClubPosts) return;
    setClubActionBusyId(`report-${report.id}`);
    setClubError('');
    setClubInfo('');

    try {
      await updateDoc(doc(db, 'clubs', selectedClubId, 'reports', report.id), {
        status,
        moderationAction: action,
        moderatedByUid: firebaseUser.uid,
        moderatedByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Moderator',
        moderatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setClubInfo('Report has been updated.');
    } catch (error) {
      console.error('Failed updating club report:', error);
      setClubError('Could not update that report.');
    } finally {
      setClubActionBusyId('');
    }
  };

  const handleModerationActionFromReport = async (report, action) => {
    if (!report || !canModerateClubPosts) return;

    if (action === 'dismiss') {
      await handleResolveClubReport(report, 'dismissed', 'dismissed');
      return;
    }

    if (action === 'remove-member' && report.targetUid) {
      const member = selectedClubMembers.find((entry) => entry.uid === report.targetUid);
      if (member) {
        const removed = await handleRemoveClubMember(member);
        if (!removed) return;
      }
      await handleResolveClubReport(report, 'resolved', 'member_removed');
      return;
    }

    if (action === 'ban-member' && report.targetUid) {
      const member = selectedClubMembers.find((entry) => entry.uid === report.targetUid) || {
        uid: report.targetUid,
        displayName: report.targetName || report.targetUid,
        email: '',
        role: report.targetRole || 'member'
      };
      const banned = await handleBanClubMember(member, report.reason || 'Banned from report review');
      if (!banned) return;
      await handleResolveClubReport(report, 'resolved', 'member_banned');
      return;
    }

    if (action === 'delete-post' && report.targetPostId) {
      const targetPost = selectedClubPosts.find((entry) => entry.id === report.targetPostId) || {
        id: report.targetPostId,
        createdByUid: report.targetUid || null
      };
      const deleted = await handleDeleteClubPost(targetPost);
      if (!deleted) return;
      await handleResolveClubReport(report, 'resolved', 'post_deleted');
    }
  };

  const handlePublishClubPost = async () => {
    if (!firebaseUser || !selectedClubId || clubPostBusy) return;
    if (isSelectedClubBanned) {
      setClubError('You are blocked from posting in this club.');
      return;
    }
    if (!selectedClubMembership) {
      setClubError('Join this club before posting.');
      return;
    }

    const title = clubPostDraft.title.trim();
    const askingPrice = clubPostDraft.askingPrice.trim();
    if (!title || !askingPrice) {
      setClubError('Add a card title and asking price before posting.');
      return;
    }

    setClubPostBusy(true);
    setClubError('');
    setClubInfo('');

    try {
      await addDoc(collection(db, 'clubs', selectedClubId, 'posts'), {
        title,
        askingPrice,
        description: clubPostDraft.description.trim(),
        imageUrl: clubPostDraft.imageUrl.trim(),
        createdByUid: firebaseUser.uid,
        createdByName: currentUserProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Collector',
        createdByRole: selectedClubRole || 'member',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setClubPostDraft({
        title: '',
        askingPrice: '',
        description: '',
        imageUrl: ''
      });
      setClubInfo('Card posted to this club feed.');
    } catch (error) {
      console.error('Failed publishing club post:', error);
      setClubError('Could not publish this card post.');
    } finally {
      setClubPostBusy(false);
    }
  };

  const handleDeleteClubPost = async (post) => {
    if (!firebaseUser || !selectedClubId || !post?.id) return false;
    const canDelete = canModerateClubPosts || post.createdByUid === firebaseUser.uid;
    if (!canDelete) return false;

    setClubActionBusyId(`post-${post.id}`);
    setClubError('');
    setClubInfo('');

    try {
      await deleteDoc(doc(db, 'clubs', selectedClubId, 'posts', post.id));
      setClubInfo('Post removed from club feed.');
      return true;
    } catch (error) {
      console.error('Failed deleting club post:', error);
      setClubError('Could not remove that post.');
      return false;
    } finally {
      setClubActionBusyId('');
    }
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

  const requestConfirmation = (title, message, confirmLabel = 'Confirm') => new Promise((resolve) => {
    confirmResolverRef.current = resolve;
    setConfirmDialog({ title, message, confirmLabel });
  });

  const handleToggleUserStatus = async (userRecord) => {
    if (!firebaseUser || userRecord.uid === firebaseUser.uid) return;

    const nextStatus = userRecord.status === 'deactivated' ? 'active' : 'deactivated';
    const confirmed = await requestConfirmation(
      nextStatus === 'deactivated' ? 'Block user' : 'Unblock user',
      nextStatus === 'deactivated'
        ? `${userRecord.email || userRecord.uid} will be blocked from access.`
        : `Restore access for ${userRecord.email || userRecord.uid}?`,
      nextStatus === 'deactivated' ? 'Block User' : 'Unblock User'
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

  const handleResolveChatReport = async (reportId) => {
    if (!reportId) return;
    try {
      await updateDoc(doc(db, 'chatReports', reportId), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: firebaseUser?.uid || null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed resolving chat report:', error);
      setChatReportsError('Failed to resolve chat report.');
    }
  };

  const handleBlockUserFromChatReport = async (report) => {
    if (!report?.reportedUserId) {
      setChatReportsError('Cannot block this report target because no user id was attached.');
      return;
    }

    const confirmed = await requestConfirmation(
      'Block reported user',
      `Block ${report.reportedUserName || report.reportedUserId} from platform access?`,
      'Block User'
    );
    if (!confirmed) return;

    setAdminActionUserId(report.reportedUserId);
    try {
      await updateDoc(doc(db, 'users', report.reportedUserId), {
        status: 'deactivated',
        blockedAt: serverTimestamp(),
        blockedBy: firebaseUser?.uid || null,
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'chatReports', report.id), {
        status: 'actioned',
        moderationAction: 'user_blocked',
        resolvedAt: serverTimestamp(),
        resolvedBy: firebaseUser?.uid || null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed blocking user from chat report:', error);
      setChatReportsError('Failed to block reported user.');
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
        cardImageUrl: currentCard.imageFrontUrl || currentCard.imageUrl,
        flaggedAt: serverTimestamp(),
        status: 'pending'
      });
      setShowFlagModal(false);
      setFlagReason('');
      setFlagCardId(null);
      setAuthInfo('Card flagged for review. Thank you for helping keep CardSwipers safe.');
    } catch (error) {
      console.error('Failed to flag card:', error);
      setAuthError('Failed to flag card. Please try again.');
    }
  };

  const handleDeleteFlaggedCard = async (flagId, cardId) => {
    const confirmed = await requestConfirmation('Delete flagged card', 'Delete this flagged card report and its listing?', 'Delete Card');
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
    const confirmed = await requestConfirmation('Clear flag report', 'Clear this flag report while keeping the card?', 'Clear Flag');
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
  const isCreateClubScreen = currentTab === 'create-club';
  const isCoreAppScreen = !isLandingScreen && !isAuthScreen && !isCreateClubScreen;
  const showPersistentMobileDock = isAuthenticated && !isLandingScreen && !isAuthScreen && !isCreateClubScreen;
  const isNativeCoreApp = isNativeApp && isAuthenticated && isCoreAppScreen;
  const canAccessAdmin = hasAdminAccess && !isNativeApp;
  const totalUsers = adminUsers.length;
  const activeUsers = adminUsers.filter((user) => user.status !== 'deactivated').length;
  const deactivatedUsers = adminUsers.filter((user) => user.status === 'deactivated').length;
  const filteredAdminUsers = adminUsers.filter((user) => {
    if (!adminSearch.trim()) return true;
    const queryText = adminSearch.toLowerCase();
    const haystack = `${user.email || ''} ${user.displayName || ''} ${user.uid || ''}`.toLowerCase();
    return haystack.includes(queryText);
  });

  const currentDate = new Date();
  const isSameMonth = (value) => {
    const date = toDateValue(value);
    return Boolean(date) && date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();
  };
  const isSameYear = (value) => {
    const date = toDateValue(value);
    return Boolean(date) && date.getFullYear() === currentDate.getFullYear();
  };

  const completedSaleStatuses = new Set(['released', 'completed', 'fulfilled']);
  const escrowStatuses = new Set(['pending', 'requires_payment', 'in_escrow', 'held']);
  const adminPurchaseRecords = purchaseIntents || [];
  const completedPurchases = adminPurchaseRecords.filter((record) => completedSaleStatuses.has(String(record.status || '').toLowerCase()) || String(record.escrowStatus || '').toLowerCase() === 'released');
  const monthlyCompletedPurchases = completedPurchases.filter((record) => isSameMonth(record.createdAt || record.updatedAt || record.listedAt));
  const ytdCompletedPurchases = completedPurchases.filter((record) => isSameYear(record.createdAt || record.updatedAt || record.listedAt));
  const currentEscrowPurchases = adminPurchaseRecords.filter((record) => escrowStatuses.has(String(record.escrowStatus || record.status || '').toLowerCase()));

  const marketplaceTotals = completedPurchases.reduce(
    (totals, record) => {
      const grossAmount = parseDollarValue(record.listingPrice || record.grossAmount || record.totalAmount || 0);
      const marketplaceFee = parseDollarValue(record.marketplaceFeeAmount || (grossAmount * MARKETPLACE_FEE_RATE).toFixed(2));
      const sellerPayout = parseDollarValue(record.sellerPayoutAmount || (grossAmount - marketplaceFee).toFixed(2));
      return {
        totalSales: totals.totalSales + grossAmount,
        monthlySales: totals.monthlySales + (isSameMonth(record.createdAt || record.updatedAt || record.listedAt) ? grossAmount : 0),
        ytdSales: totals.ytdSales + (isSameYear(record.createdAt || record.updatedAt || record.listedAt) ? grossAmount : 0),
        platformFees: totals.platformFees + marketplaceFee,
        sellerPayouts: totals.sellerPayouts + sellerPayout
      };
    },
    { totalSales: 0, monthlySales: 0, ytdSales: 0, platformFees: 0, sellerPayouts: 0 }
  );

  const premiumMRR = premiumSubscriptions.reduce((total, subscription) => {
    const status = String(subscription.status || '').toLowerCase();
    if (status && status !== 'active') return total;
    const defaultAmount = VERIFIED_SELLER_SUBSCRIPTION_PRICE;
    return total + parseDollarValue(subscription.amount || defaultAmount);
  }, 0);

  const verifiedSellerCount = sellerVerifications.filter((record) => String(record.status || '').toLowerCase() === 'verified').length;
  const marketplaceStatsByUser = adminPurchaseRecords.reduce((accumulator, record) => {
    const sellerUid = record.sellerUid || record.ownerUid || record.userId;
    if (!sellerUid) return accumulator;
    const grossAmount = parseDollarValue(record.listingPrice || record.grossAmount || record.totalAmount || 0);
    const marketplaceFee = parseDollarValue(record.marketplaceFeeAmount || (grossAmount * MARKETPLACE_FEE_RATE).toFixed(2));
    const escrowAmount = parseDollarValue(record.escrowAmount || grossAmount);
    const currentEntry = accumulator[sellerUid] || { salesTotal: 0, escrowTotal: 0, orderCount: 0 };
    const saleClosed = completedSaleStatuses.has(String(record.status || '').toLowerCase()) || String(record.escrowStatus || '').toLowerCase() === 'released';
    accumulator[sellerUid] = {
      salesTotal: currentEntry.salesTotal + (saleClosed ? grossAmount : 0),
      escrowTotal: currentEntry.escrowTotal + (escrowStatuses.has(String(record.escrowStatus || record.status || '').toLowerCase()) ? escrowAmount : 0),
      orderCount: currentEntry.orderCount + 1,
      feeTotal: (currentEntry.feeTotal || 0) + marketplaceFee
    };
    return accumulator;
  }, {});
  return (
    <div
      className="text-white font-sans flex flex-col relative min-h-[100dvh] bg-black"
      style={
        isNativeApp && nativeViewportHeight
          ? {
              minHeight: `${nativeViewportHeight}px`
            }
          : undefined
      }
    >
      {showStartupSplash && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black">
          <style>{`
            @keyframes csSplashBounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
            @keyframes csSplashPulse {
              0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
              50% { transform: scale(1.06); filter: drop-shadow(0 8px 20px rgba(255,255,255,0.26)); }
            }
            @keyframes csSplashSwipe {
              0% { transform: translateX(-185%) rotate(-18deg); opacity: 0; }
              20% { opacity: 0.82; }
              60% { opacity: 0.82; }
              100% { transform: translateX(185%) rotate(-18deg); opacity: 0; }
            }
          `}</style>
          <div className="text-center px-6">
            <div className="relative mx-auto w-[140px] h-[140px]" style={{ animation: 'csSplashBounce 1.55s ease-in-out infinite' }}>
              <img
                src={authHeroImage}
                alt="CardSwipers splash"
                className="w-full h-full object-contain"
                style={{ animation: 'csSplashPulse 1.55s ease-in-out infinite' }}
              />
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <div
                  className="absolute -top-[20%] -left-[18%] h-[145%] w-16 bg-gradient-to-r from-transparent via-white/80 to-transparent blur-[2px]"
                  style={{ animation: 'csSplashSwipe 1.25s linear infinite' }}
                />
              </div>
            </div>
            <div className="mt-8 w-24 h-[2px] rounded-full bg-white/20 overflow-hidden mx-auto">
              <div className="h-full w-1/2 rounded-full bg-white/75" style={{ animation: 'csSplashSwipe 1.25s linear infinite' }} />
            </div>
          </div>
        </div>
      )}
      {isLandingScreen && (
        <>
          <div className="absolute -top-36 -left-20 w-[28rem] h-[28rem] rounded-full bg-[#D72638]/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[24rem] h-[24rem] rounded-full bg-[#F5C542]/10 blur-3xl pointer-events-none" />
        </>
      )}
      {isAuthScreen && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(225,29,72,0.10), transparent 60%)' }} />
      )}

      {!isCreateClubScreen && (isAuthenticated || (isLandingScreen && !isNativeApp)) && (
      <header
        className="bg-black/95 border-white/10 backdrop-blur-md border-b sticky top-0 z-50"
        style={isNativeCoreApp ? { paddingTop: 'env(safe-area-inset-top)', paddingBottom: '0.35rem' } : undefined}
      >
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 ${isNativeCoreApp ? 'py-2 min-h-[64px]' : 'py-2.5 sm:py-4'}`}>

          <button
            type="button"
            onClick={() => navigateToTab(isAuthenticated ? 'swipe' : 'landing')}
            className={`flex items-center shrink-0 ${isNativeCoreApp ? 'gap-2' : 'gap-2.5'}`}
          >
            <img src={authHeroImage} alt="CardSwipers" className={`${isNativeCoreApp ? 'w-14 h-14 rounded-lg' : 'w-16 h-16 rounded-xl'} object-contain`} />
            <span className={`${isNativeCoreApp ? 'text-[16px] tracking-[0.08em]' : 'text-base sm:text-lg tracking-wide'} font-black uppercase italic text-white`}>CardSwipers</span>
          </button>

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
                        setCurrentTab(isNativeApp ? 'auth' : 'landing');
                      }}
                      className="h-11 px-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
                    >
                      Log Out
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentTab('onboarding')}
                      className="h-11 px-6 rounded-xl bg-gradient-to-b from-[#FF3040] to-[#D72638] text-white text-sm font-semibold shadow-[0_10px_30px_rgba(215,38,56,0.35)]"
                    >
                      Enter App
                    </button>
                  </div>
                )}
              </>
            )}

            {isCoreAppScreen && isAuthenticated && (
              <div className={`flex items-center ${isNativeCoreApp ? 'gap-1.5' : 'gap-2'}`}>
                <button
                  type="button"
                  onClick={handleOpenNotifications}
                  className={`relative rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-white ${isNativeCoreApp ? 'w-10 h-10' : 'w-11 h-11'}`}
                >
                  <BellIcon />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#E50914] text-[10px] leading-4 text-white font-bold text-center">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    className={`rounded-full bg-gradient-to-br from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600 transition-all flex items-center justify-center text-white font-bold shadow-lg ${isNativeCoreApp ? 'w-10 h-10 text-sm' : 'w-11 h-11'}`}
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
                        Card Clubs
                      </button>
                      <button
                        onClick={() => {
                          handleOpenNotifications();
                        }}
                        className="w-full text-left px-4 py-3 text-white hover:bg-white/5 transition-colors text-sm"
                        type="button"
                      >
                        Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ''}
                      </button>
                      <div className="border-t border-white/10"></div>
                      <button
                        onClick={async () => {
                          await signOut(auth);
                          setCurrentTab(isNativeApp ? 'auth' : 'landing');
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
      )}

      <main
        className={`flex-1 min-h-0 w-full max-w-full overflow-x-hidden ${isAuthScreen ? 'h-full overflow-hidden px-0' : isCreateClubScreen ? 'overflow-hidden px-0' : `overflow-y-auto overscroll-y-contain ${isCoreAppScreen ? 'px-3 sm:px-5 lg:px-8' : 'px-4 sm:px-6 lg:px-8'} ${showPersistentMobileDock ? 'pb-24 md:pb-28' : ''}`}`}
      >
        <div className={`${isAuthScreen || isCreateClubScreen ? 'h-full' : 'max-w-6xl mx-auto'} w-full max-w-full flex flex-col min-h-0 overflow-x-hidden`}>
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
                      alt="CardSwipers marketplace preview"
                      className="w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F1117]/60 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center px-4">
                      <p className="text-xs text-white/50 tracking-widest uppercase font-medium">
                        Live Marketplace Preview
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
                      onClick={() => setCurrentTab('onboarding')}
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
          <div
            className={`h-full min-h-full w-full flex flex-col ${isNativeApp ? 'justify-between px-0 items-stretch' : 'justify-center py-6 px-4 items-center'} relative overflow-hidden ${isNativeApp ? 'bg-gradient-to-b from-[#FFF5F8] via-[#FFD7E1] to-[#D90429]' : ''}`}
            style={
              isNativeApp
                ? {
                    paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
                    paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
                  }
                : undefined
            }
          >
            {isNativeApp && (
              <>
                <img
                  src={authBackdropImage}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(255,217,226,0.58) 44%, rgba(217,4,41,0.70) 100%)'
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(115% 85% at 8% 8%, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 96% at 92% 20%, rgba(255,227,233,0.68) 0%, rgba(255,227,233,0) 70%), linear-gradient(170deg, rgba(225,7,46,0) 44%, rgba(217,4,41,0.88) 100%)'
                  }}
                />
                <div className="relative z-10 w-full max-w-[740px] px-3 shrink-0">
                  <img src={authHeroImage} alt="CardSwipers mark" className="w-full h-auto max-h-[240px] object-contain" />
                </div>
              </>
            )}

            <div className={`w-full ${isNativeApp ? 'max-w-[480px] mx-auto' : 'max-w-[460px]'} bg-white text-[#111827] ${isNativeApp ? 'rounded-[32px] p-4.5 sm:p-5' : 'rounded-[26px] p-6 sm:p-7'} shadow-[0_20px_45px_rgba(0,0,0,0.14)] border border-black/5 relative z-10`}>
              <div className="space-y-2 text-center">
                <h1 className={`${isNativeApp ? 'text-[31px]' : 'text-[34px]'} leading-[1.08] font-bold tracking-[-0.03em] text-[#111827]`}>
                  {authMode === 'login' ? 'Sign in' : 'Create Account'}
                </h1>
                <p className={`${isNativeApp ? 'text-[11px]' : 'text-sm'} text-[#6B7280]`}>
                  {authMode === 'login' ? 'Enter your credentials to continue.' : 'Set up your account in less than a minute.'}
                </p>
              </div>

              <form onSubmit={handleAuthSubmit} className={`mt-4 ${isNativeApp ? 'space-y-2.5' : 'space-y-3'} text-left`}>
                <div className={`w-full grid grid-cols-2 rounded-2xl p-1 bg-[#F3F4F6] border border-[#E5E7EB] ${isNativeApp ? 'text-xs' : 'text-sm'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                      setAuthInfo('');
                      setAuthConfirmPassword('');
                    }}
                    className={`${isNativeApp ? 'h-10' : 'h-12'} rounded-xl transition-colors ${authMode === 'login' ? 'bg-[#E60028] text-white font-semibold shadow-[0_8px_22px_rgba(230,0,40,0.28)]' : 'text-[#6B7280] hover:text-[#111827]'}`}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('create');
                      setAuthError('');
                      setAuthInfo('');
                      setAuthConfirmPassword('');
                    }}
                    className={`${isNativeApp ? 'h-10' : 'h-12'} rounded-xl transition-colors ${authMode === 'create' ? 'bg-[#E60028] text-white font-semibold shadow-[0_8px_22px_rgba(230,0,40,0.28)]' : 'text-[#6B7280] hover:text-[#111827]'}`}
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
                    className={`w-full ${isNativeApp ? 'h-10 text-sm' : 'h-14'} px-4 rounded-2xl bg-white border border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#E60028]/40`}
                  />
                )}

                <label className={`w-full ${isNativeApp ? 'h-10' : 'h-14'} px-4 rounded-2xl bg-white border border-[#E5E7EB] flex items-center gap-3`}>
                  <svg viewBox="0 0 24 24" fill="none" className={`${isNativeApp ? 'w-4 h-4' : 'w-6 h-6'} text-[#E60028]`} aria-hidden="true">
                    <path d="M4 7.5h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="Email"
                    className={`w-full bg-transparent ${isNativeApp ? 'text-sm' : 'text-base'} text-[#111827] placeholder-[#9CA3AF] focus:outline-none`}
                  />
                </label>

                <label className={`w-full ${isNativeApp ? 'h-10' : 'h-14'} px-4 rounded-2xl bg-white border border-[#E5E7EB] flex items-center gap-3`}>
                  <svg viewBox="0 0 24 24" fill="none" className={`${isNativeApp ? 'w-4 h-4' : 'w-6 h-6'} text-[#E60028]`} aria-hidden="true">
                    <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M8 10V8a4 4 0 1 1 8 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <input
                    type={showAuthPassword ? 'text' : 'password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Password"
                    className={`w-full bg-transparent ${isNativeApp ? 'text-sm' : 'text-base'} text-[#111827] placeholder-[#9CA3AF] focus:outline-none`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword((prev) => !prev)}
                    className="text-[#9CA3AF] hover:text-[#6B7280]"
                    aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" className={`${isNativeApp ? 'w-4 h-4' : 'w-6 h-6'}`} aria-hidden="true">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </button>
                </label>

                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isSendingReset}
                    className={`${isNativeApp ? 'self-start text-[15px]' : 'self-start text-xs'} text-[#E60028] hover:text-[#B70A22] underline underline-offset-2 disabled:opacity-60`}
                  >
                    {isSendingReset ? 'Sending reset link...' : 'Forgot Password?'}
                  </button>
                )}

                {authMode === 'create' && (
                  <input
                    type={showAuthPassword ? 'text' : 'password'}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className={`w-full ${isNativeApp ? 'h-10 text-sm' : 'h-14'} px-4 rounded-2xl bg-white border border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#E60028]/40`}
                  />
                )}

                {authMode === 'create' && (
                  <label className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-[#FFF7F8] px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={hasAcceptedEscrowTerms}
                      onChange={(event) => setHasAcceptedEscrowTerms(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-[#D1D5DB] text-[#E60028]"
                    />
                    <span className="text-xs leading-5 text-[#374151]">
                      {ESCROW_TERMS_LABEL}{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsOfService(true)}
                        className="text-[#E60028] underline underline-offset-2"
                      >
                        Review Terms
                      </button>
                    </span>
                  </label>
                )}

                {authError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2.5">
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 mt-0.5 text-red-500 shrink-0" aria-hidden="true">
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 6.2v4.8M10 14h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <p className="text-xs leading-5 text-red-600">{authError}</p>
                  </div>
                )}
                {authInfo && (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5">
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" aria-hidden="true">
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                      <path d="m7 10.1 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="text-xs leading-5 text-emerald-700">{authInfo}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAuthSubmitting}
                  aria-busy={isAuthSubmitting}
                  className={`w-full ${isNativeApp ? 'h-10 text-sm' : 'h-14 text-lg'} px-6 rounded-2xl bg-[#E60028] hover:bg-[#C90024] text-white font-semibold transition-all`}
                >
                  {isAuthSubmitting ? (authMode === 'create' ? 'Creating account...' : 'Logging in...') : authMode === 'create' ? 'Create Account' : 'Log In'}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={isAuthSubmitting || isGoogleRedirecting}
                  className={`w-full ${isNativeApp ? 'h-10 text-sm' : 'h-14 text-base'} px-6 rounded-2xl bg-white border border-[#D4D8DE] hover:border-[#BAC0C8] text-[#111827] font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2.5`}
                >
                  <span
                    className={`${isNativeApp ? 'text-base' : 'text-[22px]'} font-bold leading-none`}
                    style={{
                      background: 'conic-gradient(from 15deg, #4285F4 0deg 95deg, #34A853 95deg 190deg, #FBBC05 190deg 285deg, #EA4335 285deg 360deg)',
                      WebkitBackgroundClip: 'text',
                      color: 'transparent'
                    }}
                    aria-hidden="true"
                  >
                    G
                  </span>
                  {isGoogleRedirecting ? 'Opening Google...' : 'Continue with Google'}
                </button>

                {isNativeApp && (
                  <p className={`${isNativeApp ? 'text-[9px] leading-4' : 'text-[11px] leading-5'} text-[#6B7280]`}>
                    On iPhone, Google sign-in may open Safari to finish authentication and return to the app.
                  </p>
                )}
              </form>
            </div>

            <div className={`text-center ${isNativeApp ? 'pt-3 shrink-0' : 'pt-7'} relative z-10 ${isNativeApp ? 'text-white' : ''}`}>
              <p className={`${isNativeApp ? 'text-[10px]' : 'text-xs'} mb-2 ${isNativeApp ? 'text-white' : 'text-[#9CA3AF]'}`}>Need help? Contact help@cardswipers.com</p>
              {!isNativeApp && (
                <button
                  type="button"
                  onClick={() => setCurrentTab('landing')}
                  className="text-[11px] text-[#9CA3AF] hover:text-white underline underline-offset-2 mr-3"
                >
                  Back to Landing
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTermsOfService(true)}
                className={`${isNativeApp ? 'text-[10px]' : 'text-[11px]'} underline underline-offset-2 mr-3 ${isNativeApp ? 'text-white/95 hover:text-white' : 'text-[#9CA3AF] hover:text-white'}`}
              >
                Terms of Service
              </button>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(true)}
                className={`${isNativeApp ? 'text-[10px]' : 'text-[11px]'} underline underline-offset-2 ${isNativeApp ? 'text-white/95 hover:text-white' : 'text-[#9CA3AF] hover:text-white'}`}
              >
                Privacy Policy
              </button>
              <p className={`${isNativeApp ? 'text-[9px]' : 'text-[10px]'} mt-2 ${isNativeApp ? 'text-white/95' : 'text-[#9CA3AF]'}`}>© 2026 CardSwipers. All rights reserved.</p>
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
            chatReports={chatReports}
            chatReportsError={chatReportsError}
            chatReportsLoading={chatReportsLoading}
            handleResolveChatReport={handleResolveChatReport}
            handleBlockUserFromChatReport={handleBlockUserFromChatReport}
            adminUsersLoading={adminUsersLoading}
            filteredAdminUsers={filteredAdminUsers}
            firebaseUser={firebaseUser}
            adminActionUserId={adminActionUserId}
            handleToggleUserStatus={handleToggleUserStatus}
            marketplaceTotals={marketplaceTotals}
            premiumMRR={premiumMRR}
            verifiedSellerCount={verifiedSellerCount}
            currentEscrowTotal={currentEscrowPurchases.reduce((total, record) => total + parseDollarValue(record.escrowAmount || record.listingPrice || record.grossAmount || 0), 0)}
            marketplaceStatsByUser={marketplaceStatsByUser}
            ratingStatsByUser={ratingStatsByUser}
            sellerVerifications={sellerVerifications}
            premiumSubscriptions={premiumSubscriptions}
            handleAdminReviewVerification={handleAdminReviewVerification}
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
                        <StatusPill label={status} status={status} tone={status === 'deactivated' ? 'error' : 'success'} />
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
          <div className="min-h-0 max-w-6xl mx-auto w-full flex flex-col justify-between py-1.5 md:py-4 overflow-y-auto overscroll-y-contain pr-1">
            {currentCard ? (
              <div className="w-full flex-1 min-h-0 grid xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] gap-4 md:gap-6 items-start">
                <div className="space-y-3 md:space-y-5">
                  <div className="w-full h-full min-h-0 bg-[#171923] border border-white/10 rounded-[28px] md:rounded-[32px] p-3 md:p-5 flex flex-col justify-between relative overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
                    <div className={`absolute inset-0 bg-gradient-to-br ${currentCard.cardColor} opacity-30 pointer-events-none`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.25))] pointer-events-none" />

                    {swipeFeedback === 'like' && (
                      <div className="absolute top-6 left-4 -rotate-12 border-3 border-emerald-400 text-emerald-400 font-black text-lg sm:text-2xl px-2.5 py-1 rounded-xl uppercase tracking-wider z-20 pointer-events-none">
                        Interested
                      </div>
                    )}
                    {swipeFeedback === 'pass' && (
                      <div className="absolute top-6 right-4 rotate-12 border-3 border-[#E11D48] text-[#E11D48] font-black text-lg sm:text-2xl px-2.5 py-1 rounded-xl uppercase tracking-wider z-20 pointer-events-none">
                        Pass
                      </div>
                    )}

                    <div className="flex justify-between items-center z-10 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-white/10 backdrop-blur-md text-[11px] font-bold px-3 py-1 rounded-full border border-white/15 uppercase tracking-wider text-white">
                          {currentCard.brand}
                        </span>
                        <StatusPill label="Active Listing" status="active" tone="success" />
                        {currentCard.sellerVerified && (
                          <StatusPill label="Verified Seller" status="verified" tone="success" />
                        )}
                        {currentSellerRating?.count > 0 && (
                          <span className="bg-amber-500/15 text-amber-100 text-[11px] font-bold px-3 py-1 rounded-full border border-amber-300/30 tracking-wider">
                            Seller Rating {currentSellerRating.average.toFixed(1)} ★ ({currentSellerRating.count})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="bg-[#E11D48] text-white text-[11px] font-extrabold px-3 py-1 rounded-full border border-rose-200/60 uppercase tracking-wider shadow-sm">
                          {currentCard.condition}
                        </span>
                        <span className="bg-white/10 text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/15 tracking-wider">
                          {currentCard.tradeValue}
                        </span>
                      </div>
                    </div>

                    <div className="relative z-10 flex-1 flex items-center justify-center py-2 md:py-8">
                      <div className={`w-full max-w-[440px] md:max-w-[520px] h-[32vh] min-h-[220px] md:min-h-[250px] max-h-[320px] md:max-h-[460px] bg-[#0F131C] border ${currentCard.borderColor} rounded-[28px] md:rounded-[32px] shadow-[0_24px_64px_rgba(0,0,0,0.55)] relative overflow-hidden`} onClick={() => canToggleCurrentCardImage && setActiveCardImageSide((prev) => (prev === 'front' ? 'back' : 'front'))}>
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),transparent_25%,transparent_75%,rgba(255,255,255,0.05))]" />
                        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent" />
                        <div className="absolute top-4 right-4 text-[10px] uppercase tracking-[0.22em] text-white/60 font-bold">
                          {canToggleCurrentCardImage ? 'Front • Back' : 'Featured Listing'}
                        </div>
                        <div
                          className="h-full flex flex-col items-center justify-center px-6 pt-14 pb-8 text-center"
                          onTouchStart={(event) => {
                            cardImageTouchStartXRef.current = event.changedTouches?.[0]?.clientX || 0;
                          }}
                          onTouchEnd={(event) => {
                            if (!canToggleCurrentCardImage) return;
                            const endX = event.changedTouches?.[0]?.clientX || 0;
                            const deltaX = endX - cardImageTouchStartXRef.current;
                            if (Math.abs(deltaX) < 40) return;
                            setActiveCardImageSide((prev) => {
                              if (deltaX < 0) return 'back';
                              return 'front';
                            });
                          }}
                        >
                          <div className="relative h-[28vh] max-h-[340px] w-full max-w-[340px]">
                            <CardFlipImage
                              frontImageUrl={currentCard.imageFrontUrl || currentCard.imageUrl || ''}
                              backImageUrl={currentCard.imageBackUrl || ''}
                              title={currentCard.title}
                              fallback={currentCard.imageEmoji}
                            />
                          </div>
                          {canToggleCurrentCardImage && (
                            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-2 py-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveCardImageSide('front');
                                }}
                                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                  activeCardImageSide === 'front' ? 'bg-white text-black' : 'text-white/80 hover:text-white'
                                }`}
                              >
                                Front
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveCardImageSide('back');
                                }}
                                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                  activeCardImageSide === 'back' ? 'bg-white text-black' : 'text-white/80 hover:text-white'
                                }`}
                              >
                                Back
                              </button>
                            </div>
                          )}
                          <div className="mt-5 md:mt-8 space-y-1.5 md:space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-white/45 font-semibold">{currentCard.category}</p>
                            <h3 className="text-xl font-bold text-white leading-snug max-w-[16rem] mx-auto">{currentCard.title}</h3>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="z-10 space-y-3 md:space-y-4 bg-gradient-to-t from-[#171923] via-[#171923]/92 to-transparent pt-3 md:pt-4 rounded-xl">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-2 min-w-0">
                          <h2 className="text-[1.18rem] sm:text-[1.8rem] font-black tracking-[-0.04em] leading-tight">{currentCard.title}</h2>
                          <p className="text-sm text-white/70 font-medium">{currentCard.detailLine}</p>
                          <p className="text-xs text-white/75">{currentCard.listedAtLabel || formatListingDate(currentCard.listedAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Listed at</p>
                          <p className="text-lg sm:text-2xl font-bold text-white">{currentCard.tradeValue}</p>
                          <p className="text-[11px] text-white/75 mt-1">Buy now {currentCard.buyNowPrice || currentCard.tradeValue}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 flex-wrap bg-[#0F131C] border border-white/10 rounded-2xl px-3 py-2.5 md:px-4 md:py-3">
                        <button
                          type="button"
                          onClick={() => setViewingCollection(currentCard)}
                          className="text-sm text-white font-semibold hover:text-rose-300 transition-colors"
                        >
                          @{currentCard.owner} · View Binder ({(currentCard.collection || []).length} items)
                        </button>
                        <p className="text-sm text-white/65">Seeking: {currentCard.lookingFor}</p>
                      </div>

                      <div className="rounded-2xl border border-[#30363D] bg-[#161B22] px-3 py-3 md:px-4 md:py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-[#FFD700]">Recent Market Sales</p>
                            <p className="mt-1 text-xs text-white/75">
                              {currentCard.playerName || currentCard.player || currentCard.title} · {currentCard.grade || currentCard.detailLine || 'Grade not provided'}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-[#FFE66D]">
                            {(() => {
                              const estimate = parseDollarValue(currentCard.recentComps || currentCard.avgMarketValue || currentCard.value || currentCard.tradeValue || 0);
                              return estimate > 0 ? `${formatMoney(estimate * 0.9)} - ${formatMoney(estimate * 1.1)}` : 'No sales range yet';
                            })()}
                          </p>
                        </div>
                        {Array.isArray(currentCard.recentTradeHistory) && currentCard.recentTradeHistory.length > 0 ? (
                          <div className="mt-3 space-y-1.5">
                            {currentCard.recentTradeHistory.slice(0, 3).map((sale, index) => (
                              <div key={`${sale.id || sale.date || 'sale'}-${index}`} className="flex items-center justify-between gap-3 text-xs text-white/80">
                                <span>{sale.date || sale.platform || 'Recent sale'}</span>
                                <span className="font-semibold">{formatMoney(sale.price || sale.amount || 0)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-white/70">Estimated range based on the listed market value. Recent verified sales will appear here when available.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 md:gap-3">
                    <button
                      onClick={() => handleSwipe('pass')}
                      className="min-h-[60px] md:min-h-[68px] rounded-2xl bg-white/[0.04] border border-white/10 text-white shadow-lg hover:border-white/20 hover:bg-white/[0.06] transition-all px-3 py-2.5 md:px-4 md:py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/[0.04] border border-white/10 inline-flex items-center justify-center text-white/70"><PassIcon /></span>
                        <div>
                          <p className="font-semibold">Pass</p>
                          <p className="text-xs text-white/75">Skip this listing</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setViewingCollection(currentCard)}
                      className="min-h-[60px] md:min-h-[68px] rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-400/40 text-white shadow-lg hover:border-amber-400/60 hover:from-amber-500/30 hover:to-amber-600/20 transition-all px-3 py-2.5 md:px-4 md:py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-amber-500/20 border border-amber-400/30 inline-flex items-center justify-center text-amber-300 font-bold"><BinderIcon /></span>
                        <div>
                          <p className="font-bold text-sm md:text-base">View Binder</p>
                          <p className="text-xs text-amber-200/70">{(currentCard.collection || []).length} items available</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleSwipe('like')}
                      className="min-h-[60px] md:min-h-[68px] rounded-2xl bg-gradient-to-b from-[#E11D48] to-[#BE123C] text-white shadow-[0_12px_24px_rgba(225,29,72,0.28)] hover:brightness-110 transition-all px-3 py-2.5 md:px-4 md:py-3 text-left"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-white"><InterestIcon /></span>
                        <div>
                          <p className="font-semibold">Interested</p>
                          <p className="text-xs text-white/75">Send trade request</p>
                        </div>
                      </div>
                    </button>
                    {ENABLE_PAYMENT_PIPELINE && (
                      <button
                        onClick={() => handleInstantPurchase(currentCard, { advanceAfterPurchase: true })}
                        className="min-h-[60px] md:min-h-[68px] rounded-2xl bg-gradient-to-b from-[#F59E0B] to-[#D97706] text-white shadow-[0_12px_24px_rgba(245,158,11,0.25)] hover:brightness-110 transition-all px-3 py-2.5 md:px-4 md:py-3 text-left disabled:opacity-55 disabled:cursor-not-allowed"
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-white font-black">$</span>
                          <div>
                            <p className="font-semibold">Buy Now</p>
                            <p className="text-xs text-white/75">
                              {currentCard.buyNowPrice || currentCard.tradeValue}
                            </p>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 md:px-4 md:py-3 text-sm text-white/65">
                    Pass hides this listing for 30 days. Interested opens negotiation.
                  </div>
                </div>

                <aside className="space-y-3 md:space-y-4 xl:sticky xl:top-24">
                  <div className="rounded-[24px] md:rounded-[28px] bg-[#111827] border border-white/10 p-4 md:p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Collector Profile</p>
                      <h3 className="mt-2 text-xl sm:text-2xl font-bold">{currentCard.owner}</h3>
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

                  <div className="rounded-[24px] md:rounded-[28px] bg-[#111827] border border-white/10 p-4 md:p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)] space-y-4">
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
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8 space-y-4">
                <span className="text-5xl text-white/60"><SwipeDeckIcon /></span>
                <h3 className="text-xl font-bold">{personalizedDeck.length === 0 ? 'No Cards Available' : 'End of the Deck!'}</h3>
                <p className="text-sm text-white/65 max-w-xs">
                  {personalizedDeck.length === 0 
                    ? 'No cards are available yet. Check back later or adjust your onboarding preferences.' 
                    : 'No more collectors matching your filters in your radius. Try expanding your search options.'}
                </p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'post' && (
          <div className="h-screen max-h-screen min-h-0 max-w-6xl mx-auto w-full max-w-full flex flex-col overflow-hidden relative">
            {isNativeApp && <div id="camera-container" className="absolute inset-0 bg-transparent pointer-events-none" aria-hidden="true" />}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-y-contain overflow-x-hidden pb-32 px-4 py-1.5 md:py-2 [touch-action:pan-y]">
            <div className="rounded-[22px] md:rounded-[24px] border border-white/10 bg-[#11161F] px-3 py-3.5 sm:px-7 sm:py-6 shadow-[0_16px_48px_rgba(0,0,0,0.3)]">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 font-semibold">+ Card</p>
                  <h2 className="mt-2 text-[1.32rem] sm:text-[2rem] leading-[1.06] font-black tracking-[-0.04em]">Post Your Collectible</h2>
                  <p className="mt-2 text-sm text-white/65">Show off your best card and get matched with active traders fast.</p>
                </div>
                <div className="min-w-[220px] grow sm:grow-0">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Step {postComposerStep} of 2</p>
                  <div className="mt-2 h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#E11D48] to-[#FB7185] transition-all duration-500"
                      style={{ width: `${postCompletionPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-white/60">{postCompletionCount} of {postProgressChecks.length} fields complete</p>
                </div>
              </div>
            </div>

            <div className="grid xl:grid-cols-[1.35fr_0.95fr] gap-4 md:gap-6 items-start flex-1 min-h-0">
              <form onSubmit={handlePostCard} className="space-y-3 md:space-y-4 rounded-[22px] md:rounded-[24px] border border-white/10 bg-[#11161F] p-3 sm:p-6 shadow-[0_18px_56px_rgba(0,0,0,0.35)] min-h-0 [touch-action:pan-y]">
                <input
                  ref={postFrontImageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handlePostImageChange('front', event)}
                  className="hidden"
                />
                <input
                  ref={postBackImageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handlePostImageChange('back', event)}
                  className="hidden"
                />

                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => postFrontImageInputRef.current?.click()}
                      className="rounded-[18px] border border-dashed border-white/20 bg-[#0D1117] hover:border-[#FB7185]/60 transition-all p-3"
                    >
                      <div className="rounded-[14px] overflow-hidden min-h-[104px] sm:min-h-[148px] bg-[#0A0D13] flex items-center justify-center relative group">
                        {postFrontImagePreview ? (
                          <img
                            src={postFrontImagePreview}
                            alt="Front card preview"
                            className="w-full h-[104px] sm:h-[148px] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="text-center px-4 py-5 sm:py-6">
                            <p className="text-3xl">📷</p>
                            <p className="mt-2 text-sm font-bold text-white">Take Front Photo</p>
                            <p className="mt-1 text-[11px] text-white/55">Tap to choose from camera or library</p>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2 text-left">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">{postFrontImagePreview ? '✓ Front Captured' : 'Front of Card'}</p>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        postBackImageInputRef.current?.click();
                      }}
                      className="rounded-[18px] border border-dashed border-white/20 bg-[#0D1117] hover:border-[#FB7185]/60 transition-all p-3"
                    >
                      <div className="rounded-[14px] overflow-hidden min-h-[104px] sm:min-h-[148px] bg-[#0A0D13] flex items-center justify-center relative group">
                        {postBackImagePreview ? (
                          <img
                            src={postBackImagePreview}
                            alt="Back card preview"
                            className="w-full h-[104px] sm:h-[148px] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="text-center px-4 py-5 sm:py-6">
                            <p className="text-3xl">📷</p>
                            <p className="mt-2 text-sm font-bold text-white">Take Back Photo</p>
                            <p className="mt-1 text-[11px] text-white/55">Tap to choose from camera or library</p>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2 text-left">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">{postBackImagePreview ? '✓ Back Captured' : 'Back of Card'}</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="rounded-[18px] border border-white/10 bg-[#0D1117] px-4 py-4 space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">On-Device OCR Scanner</p>
                    <div className="relative h-36 sm:h-44 rounded-[14px] bg-black/45 overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,29,72,0.12),transparent_70%)]" />
                      <div className="absolute inset-4 sm:inset-6 rounded-xl border-2 border-dashed border-[#FB7185]/70" />
                      <div className="absolute inset-x-0 bottom-2 text-center text-[11px] text-white/70 px-2">
                        Align card inside the frame before capture
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleScanCardWithOcr}
                        disabled={scannerBusy}
                        className="px-4 py-2 rounded-full text-xs font-semibold bg-[#E11D48] hover:brightness-110 disabled:opacity-60"
                      >
                        {scannerBusy ? 'Scanning...' : 'Scan Card Text'}
                      </button>
                      {scannerInfo && <p className="text-xs text-white/70">{scannerInfo}</p>}
                    </div>
                    {scannerDetectedLines.length > 0 && (
                      <p className="text-[11px] text-white/55">
                        OCR lines: {scannerDetectedLines.join(' • ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-[16px] border border-white/10 bg-[#0D1117] px-4 py-3">
                    <p className="text-xs text-white/70">Step {postComposerStep} of 2: {postComposerStep === 1 ? 'Capture photos' : 'Enter details manually'}</p>
                    {postComposerStep === 1 ? (
                      <button
                        type="button"
                        onClick={() => setPostComposerStep(2)}
                        disabled={!postFrontImagePreview || !postBackImagePreview}
                        className="px-4 py-2 rounded-full text-xs font-semibold bg-[#E11D48] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPostComposerStep(1)}
                        className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20"
                      >
                        Edit Photos
                      </button>
                    )}
                  </div>
                </div>

                {postImageError && <p className="text-xs text-red-300">{postImageError}</p>}

                {postComposerStep === 2 && (
                  <>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">🪪 Card Name</label>
                  <input
                    type="text"
                    placeholder="e.g., 2018 Shohei Ohtani Rookie Card"
                    value={newCard.title}
                    onChange={(e) => setNewCard({ ...newCard, title: e.target.value })}
                    className="w-full px-4 py-3 text-base font-semibold bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Card Number</label>
                    <input
                      type="text"
                      placeholder="e.g., 025"
                      value={newCard.cardNumber || ''}
                      onChange={(e) => setNewCard({ ...newCard, cardNumber: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Set Number</label>
                    <input
                      type="text"
                      placeholder="e.g., 182"
                      value={newCard.setNumber || ''}
                      onChange={(e) => setNewCard({ ...newCard, setNumber: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">🏷️ Brand</label>
                    <select
                      value={newCard.brand}
                      onChange={(e) => setNewCard({ ...newCard, brand: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
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

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">🧾 Grade Company</label>
                    <select
                      value={newCard.gradingCompany}
                      onChange={(e) => setNewCard({ ...newCard, gradingCompany: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
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
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">🧿 Raw Condition</label>
                    <select
                      value={newCard.rawCondition}
                      onChange={(e) => setNewCard({ ...newCard, rawCondition: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
                    >
                      {RAW_CONDITIONS.map((condition) => (
                        <option key={condition} value={condition}>
                          {condition}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">📊 Numeric Grade</label>
                    <select
                      value={newCard.grade}
                      onChange={(e) => setNewCard({ ...newCard, grade: e.target.value })}
                      className="w-full px-4 py-4 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all"
                    >
                      {NUMERIC_GRADES.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">💵 Estimated Market Value</label>
                  <div className="flex items-center gap-2 rounded-[18px] border border-white/10 bg-[#1A2230] px-4 py-3.5 focus-within:ring-2 focus-within:ring-[#E11D48]/55 focus-within:border-[#E11D48]/55 transition-all">
                    <span className="text-white/65 font-semibold">$</span>
                    <input
                      type="text"
                      placeholder="250"
                      value={newCard.estimatedValue}
                      onChange={(e) => setNewCard({ ...newCard, estimatedValue: e.target.value })}
                      className="w-full bg-transparent text-base font-semibold focus:outline-none"
                    />
                    <span className="text-[11px] uppercase tracking-[0.16em] text-white/45">USD</span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">💸 Buy Now Price</label>
                    <div className="flex items-center gap-2 rounded-[18px] border border-white/10 bg-[#1A2230] px-4 py-3.5 focus-within:ring-2 focus-within:ring-[#E11D48]/55 focus-within:border-[#E11D48]/55 transition-all">
                      <span className="text-white/65 font-semibold">$</span>
                      <input
                        type="text"
                        placeholder={newCard.estimatedValue || '250'}
                        value={newCard.buyNowPrice}
                        onChange={(e) => setNewCard({ ...newCard, buyNowPrice: e.target.value })}
                        className="w-full bg-transparent text-base font-semibold focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">📍 Seller State</label>
                    <input
                      type="text"
                      placeholder={normalizeStateCode(currentUserProfile?.state || currentUserProfile?.shippingState || '') || 'CA'}
                      value={newCard.sellerState}
                      onChange={(e) => setNewCard({ ...newCard, sellerState: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 transition-all uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">🧭 Sale Mode</label>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {[
                      { value: 'trade_only', label: 'Trade Only' },
                      { value: 'sale_only', label: 'Buy Now Only' },
                      { value: 'trade_and_sale', label: 'Trade + Sale' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setNewCard({ ...newCard, saleMode: option.value })}
                        className={`px-3 py-3 rounded-[18px] text-xs font-semibold border transition-all ${
                          newCard.saleMode === option.value
                            ? 'bg-[#E11D48] border-[#E11D48] text-white shadow-[0_6px_16px_rgba(225,29,72,0.32)]'
                            : 'bg-[#161C27] border-white/10 text-white/80 hover:border-white/25'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">🎯 Looking For</label>
                  <div className="flex flex-wrap gap-2">
                    {ISO_QUICK_OPTIONS.map((option) => {
                      const isActive = (newCard.lookingFor || '')
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean)
                        .includes(option);

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleLookingForOption(option)}
                          className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all ${
                            isActive
                              ? 'bg-[#E11D48] border-[#E11D48] text-white shadow-[0_6px_16px_rgba(225,29,72,0.32)]'
                              : 'bg-[#161C27] border-white/10 text-white/80 hover:border-white/25'
                          }`}
                        >
                          {isActive ? '✓ ' : ''}
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    placeholder="Add more details or specific trade targets"
                    value={newCard.lookingFor}
                    onChange={(e) => setNewCard({ ...newCard, lookingFor: e.target.value })}
                    className="w-full px-4 py-3.5 bg-[#1A2230] border border-white/10 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/55 focus:border-[#E11D48]/55 text-sm resize-none transition-all"
                    rows={3}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPostingCard}
                  className="w-full h-[54px] md:h-[60px] bg-gradient-to-b from-[#E11D48] to-[#BE123C] hover:brightness-110 disabled:opacity-70 font-bold rounded-[20px] shadow-[0_16px_30px_rgba(225,29,72,0.26)] transition-all text-sm"
                >
                  {isPostingCard ? 'Publishing...' : 'Publish Asset to Feed'}
                </button>
                  </>
                )}
              </form>

              <aside className="hidden xl:block rounded-[24px] border border-white/10 bg-[#11161F] p-4 sm:p-6 shadow-[0_18px_56px_rgba(0,0,0,0.35)] xl:sticky xl:top-24 space-y-3 min-h-0 overflow-y-auto">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Live Preview</p>
                  <h3 className="mt-2 text-xl font-black">Your Listing Card</h3>
                </div>

                <div className="rounded-[20px] bg-[#0D1117] border border-white/10 overflow-hidden">
                  <div className="h-40 sm:h-48 bg-black/40 flex items-center justify-center relative">
                    {postFrontImagePreview ? (
                      <img src={postFrontImagePreview} alt="Live card preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <p className="text-3xl">🃏</p>
                        <p className="text-xs text-white/55 mt-2">Capture front photo to preview</p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-2.5">
                    <h4 className="text-base font-bold leading-snug">
                      {newCard.title.trim() || 'Card title will appear here'}
                    </h4>
                    <div className="flex items-center justify-between gap-3">
                      <span className="px-3 py-1 rounded-full bg-white/8 border border-white/10 text-xs text-white/80">
                        {newCard.brand || 'Brand'}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {newCard.estimatedValue?.trim() ? `$${newCard.estimatedValue}` : '$0'}
                      </span>
                    </div>
                    <p className="text-xs text-white/65">{previewConditionLabel}</p>
                    <p className="text-[11px] text-white/55">{postBackImagePreview ? 'Front + Back ready for swipe viewers' : 'Add a back photo for full listing quality'}</p>
                  </div>
                </div>

                <div className="rounded-[18px] bg-[#0D1117] border border-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Tips</p>
                  <ul className="mt-2 space-y-1 text-xs text-white/70">
                    <li>Use bright lighting and fill most of the frame with the card.</li>
                    <li>Keep the title specific for better match quality.</li>
                    <li>Add at least one Looking For target to increase responses.</li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
          </div>
        )}

        {currentTab === 'create-club' && (
          <div className="min-h-0 flex-1 w-full overflow-y-auto overscroll-y-contain bg-white text-[#191919] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateClub();
              }}
              className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-10"
            >
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    resetClubDraft();
                    setCurrentTab('onboarding');
                  }}
                  className="absolute left-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#202020] hover:bg-black/5"
                  aria-label="Back to clubs"
                >
                  <span className="text-5xl font-light leading-none">‹</span>
                </button>
                <h1 className="text-3xl font-bold tracking-0">Create Club</h1>
              </div>

              <div className="mt-8 sm:mt-14">
                <label htmlFor="club-name" className="block text-xl font-medium">Club Name</label>
                <input
                  id="club-name"
                  type="text"
                  value={clubDraftName}
                  onChange={(event) => {
                    setClubDraftName(event.target.value.slice(0, 20));
                    setClubDraftError('');
                  }}
                  placeholder="Please enter your club name."
                  maxLength={20}
                  autoFocus
                  className="mt-4 h-[76px] w-full rounded-2xl border border-[#B9C2C9] px-5 text-lg text-[#202020] placeholder:text-[#89919D] focus:border-[#16C779] focus:outline-none focus:ring-2 focus:ring-[#16C779]/20 sm:h-[94px] sm:px-6 sm:text-xl"
                />
                <p className="mt-2 text-right text-xs text-[#7B8490]">{clubDraftName.trim().length}/20</p>
              </div>

              <div className="mt-8">
                <p className="text-xl font-medium">Club Logo</p>
                <input
                  ref={clubLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleClubLogoFileChange}
                  className="hidden"
                />
                <div className="mt-4 grid grid-cols-3 gap-3 sm:mt-5 sm:gap-5">
                  <button
                    type="button"
                    onClick={() => clubLogoInputRef.current?.click()}
                    className={`aspect-square rounded-2xl border-2 border-dashed p-3 transition-colors ${clubDraftLogoId === 'custom' ? 'border-[#16C779] bg-[#F1FFF7]' : 'border-[#B9C2C9] bg-white hover:border-[#7B8490]'}`}
                  >
                    {clubDraftLogoPreview ? (
                      <img src={clubDraftLogoPreview} alt="Custom club logo preview" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-full flex-col items-center justify-center text-center text-[#404040]">
                        <span className="text-4xl leading-none">↑</span>
                        <span className="mt-3 text-sm font-medium">Add Image</span>
                        <span className="mt-1 text-xs text-[#69717B]">640 x 640</span>
                      </span>
                    )}
                  </button>
                  {CLUB_LOGO_PRESETS.map((preset) => {
                    const selected = clubDraftLogoId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          if (clubDraftLogoPreview) URL.revokeObjectURL(clubDraftLogoPreview);
                          setClubDraftLogoPreview('');
                          setClubDraftLogoFile(null);
                          setClubDraftLogoId(preset.id);
                          setClubDraftError('');
                        }}
                        className={`relative aspect-square overflow-hidden rounded-2xl border-2 bg-gradient-to-br ${preset.className} ${selected ? 'border-[#16C779] ring-2 ring-[#16C779]' : 'border-[#CFD6DA]'}`}
                        aria-label={`Use ${preset.id} club logo`}
                      >
                        <span className="absolute inset-0 bg-[radial-gradient(circle_at_45%_28%,rgba(255,255,255,0.28),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.16),transparent_45%)]" />
                        <span className="relative flex h-full items-center justify-center text-[3.6rem] font-bold leading-none text-white drop-shadow-[0_8px_10px_rgba(0,0,0,0.5)] sm:text-[5.4rem]">{preset.symbol}</span>
                        {selected && <span className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#16C779] text-base font-bold text-white sm:right-2 sm:top-2 sm:h-9 sm:w-9 sm:text-xl">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {clubDraftError && <p className="mt-5 text-sm font-medium text-[#D91B3C]">{clubDraftError}</p>}

              <button
                type="submit"
                disabled={clubCreateBusy || clubDraftName.trim().length < 3 || !clubDraftLogoId}
                className="mt-8 min-h-14 w-full shrink-0 rounded-2xl bg-[#16C779] px-6 py-3 text-xl font-bold text-white shadow-[0_8px_18px_rgba(22,199,121,0.22)] transition-colors hover:bg-[#10AD65] disabled:bg-[#D3E9E0] disabled:text-white/70 disabled:shadow-none sm:mt-auto sm:min-h-16 sm:py-4 sm:text-2xl"
              >
                {clubCreateBusy ? 'Creating...' : 'Confirm'}
              </button>
            </form>
          </div>
        )}

        {currentTab === 'onboarding' && (
          <div className="max-w-6xl mx-auto w-full flex flex-col gap-2 md:gap-3 py-1 md:py-2 overflow-y-auto overscroll-y-contain pb-24 md:pb-28">
            <div className="grid xl:grid-cols-[0.96fr_1.04fr] gap-2.5 md:gap-4 min-h-0 flex-1">
              <section className="rounded-[22px] border border-white/10 bg-[#11161F] p-3.5 sm:p-5 shadow-[0_16px_42px_rgba(0,0,0,0.32)] flex flex-col gap-2.5 min-h-0 items-center justify-between">
                {/* Search Club bar — full-width pill with magnifying glass */}
                <div className="relative w-full">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
                      <circle cx="8.5" cy="8.5" r="5.5" />
                      <path d="m13.5 13.5 3 3" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={clubSearchQuery}
                    onChange={(event) => setClubSearchQuery(event.target.value)}
                    placeholder="Search Club"
                    className="w-full pl-9 pr-4 py-3 rounded-full bg-white text-[#111] placeholder-[#aaa] text-sm focus:outline-none shadow-sm"
                  />
                </div>

                <div className="w-full max-w-[296px] mx-auto flex flex-col items-center gap-2.5">
                  <div className="rounded-2xl border border-white/10 bg-[#0D1117] overflow-hidden w-full shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
                    <div className="relative w-full aspect-square bg-[#0A0D13] overflow-hidden">
                      <img
                        src={authHeroImage}
                        alt="Create a club"
                        className="w-full h-full object-cover opacity-80"
                      />
                    </div>
                  </div>

                  <div className="w-12 h-12 rounded-2xl bg-[#22C55E] flex items-center justify-center shadow-[0_8px_20px_rgba(34,197,94,0.35)] border border-white/10">
                    <CardClubsIcon />
                  </div>

                  <button
                    type="button"
                    onClick={openCreateClub}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-55 disabled:cursor-not-allowed text-white shadow-[0_6px_18px_rgba(34,197,94,0.35)] transition-colors"
                  >
                    Create Club
                  </button>
                </div>

                <div className="flex-1 min-h-0 w-full overflow-y-auto overscroll-y-contain space-y-2 pr-1">
                  {filteredClubs.length === 0 ? (
                    <p className="text-sm text-white/65 px-1 py-2">No clubs match your search yet.</p>
                  ) : (
                    filteredClubs.map((club) => {
                      const isActive = club.id === selectedClubId;
                      const logoPreset = CLUB_LOGO_PRESETS.find((preset) => preset.id === club.logoPresetId);
                      return (
                        <button
                          key={club.id}
                          type="button"
                          onClick={() => setSelectedClubId(club.id)}
                          className={`w-full text-left rounded-2xl border px-3 py-3 transition-colors ${isActive ? 'border-[#FB7185]/70 bg-[#25111A]' : 'border-white/10 bg-[#0D1117] hover:border-white/25'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-3">
                              {club.logoUrl ? (
                                <img src={club.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                              ) : logoPreset ? (
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${logoPreset.className} text-2xl font-bold text-white`}>{logoPreset.symbol}</span>
                              ) : null}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-white">{club.name || 'Untitled Club'}</p>
                                <p className="mt-1 text-[11px] text-white/55">{club.description || 'No description yet.'}</p>
                              </div>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-full border border-white/15 bg-white/5 text-white/70">{club.code || '------'}</span>
                          </div>
                          <p className="mt-2 text-[11px] text-white/50">Owner: {club.ownerName || club.ownerEmail || 'Unknown'}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-[22px] border border-white/10 bg-[#11161F] p-4 sm:p-5 shadow-[0_16px_42px_rgba(0,0,0,0.32)] flex flex-col gap-3 min-h-0">
                {selectedClub ? (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-[#0D1117] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg sm:text-xl font-black">{selectedClub.name}</h3>
                          <p className="text-xs text-white/60 mt-1">{selectedClub.description || 'No description provided.'}</p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.15em] border border-white/20 bg-white/10">Code {selectedClub.code || '------'}</span>
                      </div>
                    </div>

                    <section className="rounded-2xl border border-white/10 bg-[#0D1117] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Trade Nights</p>
                          <p className="mt-1 text-xs text-white/60">Buy-ins are held in escrow until the event payout is verified.</p>
                        </div>
                        {canModerateClubPosts && (
                          <button
                            type="button"
                            onClick={handleCreateTradeNight}
                            disabled={Boolean(clubEventBusyId)}
                            className="px-3 py-2 rounded-lg text-xs font-bold bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            {clubEventBusyId === 'create' ? 'Opening...' : 'Open Trade Night'}
                          </button>
                        )}
                      </div>
                      <div className="mt-3 grid gap-2">
                        {selectedClubEvents.length === 0 ? (
                          <p className="text-sm text-white/60">No trade nights are open yet.</p>
                        ) : (
                          selectedClubEvents.map((event) => {
                            const eventDate = toDateValue(event.scheduledFor);
                            const registrationOpen = String(event.status || '').toLowerCase() === 'registration';
                            return (
                              <div key={event.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold">{event.title || 'Trade Night'}</p>
                                  <p className="mt-1 text-[11px] text-white/55">
                                    {event.buyInCredits || 0} credits · {event.currentRegistrations || 0}/{event.capLimit || '∞'} registered
                                    {eventDate ? ` · ${eventDate.toLocaleDateString()}` : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRegisterForTradeNight(event)}
                                  disabled={!registrationOpen || !selectedClubMembership || isSelectedClubBanned || Boolean(clubEventBusyId)}
                                  className="px-3 py-2 rounded-lg text-xs font-bold bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-55 disabled:cursor-not-allowed"
                                >
                                  {clubEventBusyId === `register-${event.id}` ? 'Registering...' : registrationOpen ? 'Register' : String(event.status || 'closed')}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>

                    <div className="grid lg:grid-cols-2 gap-3 min-h-0">
                      <div className="rounded-2xl border border-white/10 bg-[#0D1117] p-3 min-h-0 flex flex-col">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mb-2">Members</p>
                        <div className="space-y-2 overflow-y-auto pr-1">
                          {selectedClubMembers.length === 0 ? (
                            <p className="text-xs text-white/60">No members yet.</p>
                          ) : (
                            selectedClubMembers.map((member) => (
                              <div key={member.uid} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{member.displayName || member.email || member.uid}</p>
                                    <p className="text-[11px] text-white/55 truncate">{member.email || member.uid}</p>
                                    <p className="text-[11px] text-[#86EFAC] mt-1">{member.credits === 'infinite' ? 'Unlimited credits' : `${Number(member.credits || 0)} credits`} · {Number(member.escrowHeld || 0)} held</p>
                                  </div>
                                  <span className="text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-full border border-white/15 bg-white/5 text-white/70">{member.role || 'member'}</span>
                                </div>
                                {(canManageClubMembers || canModerateClubPosts) && member.uid !== firebaseUser?.uid && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {canManageClubMembers && member.role !== 'owner' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateClubMemberRole(member.uid, 'agent')}
                                          disabled={clubActionBusyId === `role-${member.uid}`}
                                          className="px-2.5 py-1 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                        >
                                          Make Agent
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateClubMemberRole(member.uid, 'member')}
                                          disabled={clubActionBusyId === `role-${member.uid}`}
                                          className="px-2.5 py-1 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                        >
                                          Make Member
                                        </button>
                                      </>
                                    )}
                                    {member.role !== 'owner' && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveClubMember(member)}
                                        disabled={clubActionBusyId === `remove-${member.uid}`}
                                        className="px-2.5 py-1 rounded-lg text-[11px] bg-red-900/45 border border-red-400/30 text-red-100 hover:bg-red-900/60 disabled:opacity-60"
                                      >
                                        Remove
                                      </button>
                                    )}
                                    {member.role !== 'owner' && canModerateClubPosts && (
                                      <button
                                        type="button"
                                        onClick={() => handleAllocateClubCredits(member)}
                                        disabled={clubActionBusyId === `credits-${member.uid}` || (selectedClubRole === 'agent' && member.role !== 'member')}
                                        className="px-2.5 py-1 rounded-lg text-[11px] bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
                                      >
                                        {clubActionBusyId === `credits-${member.uid}` ? 'Assigning...' : 'Add Credits'}
                                      </button>
                                    )}
                                    {member.role !== 'owner' && canModerateClubPosts && (
                                      <button
                                        type="button"
                                        onClick={() => handleBanClubMember(member, 'Manual moderator action')}
                                        disabled={clubActionBusyId === `ban-${member.uid}`}
                                        className="px-2.5 py-1 rounded-lg text-[11px] bg-red-800/55 border border-red-300/40 text-red-100 hover:bg-red-800/70 disabled:opacity-60"
                                      >
                                        Block
                                      </button>
                                    )}
                                  </div>
                                )}
                                {member.uid !== firebaseUser?.uid && (
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      onClick={() => handleReportClubMember(member)}
                                      disabled={clubReportBusy || !selectedClubMembership || isSelectedClubBanned}
                                      className="px-2.5 py-1 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                    >
                                      Report
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-[#0D1117] p-3 min-h-0 flex flex-col gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Post Card In Club</p>
                          <p className="text-[11px] text-white/55 mt-1">Members can post cards. Owners and agents can delete posts.</p>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={clubPostDraft.title}
                            onChange={(event) => setClubPostDraft((prev) => ({ ...prev, title: event.target.value }))}
                            placeholder="Card title"
                            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/15 text-sm focus:outline-none focus:border-white/35"
                          />
                          <input
                            type="text"
                            value={clubPostDraft.askingPrice}
                            onChange={(event) => setClubPostDraft((prev) => ({ ...prev, askingPrice: event.target.value }))}
                            placeholder="Asking price (e.g. $450 or trade + $200)"
                            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/15 text-sm focus:outline-none focus:border-white/35"
                          />
                          <input
                            type="text"
                            value={clubPostDraft.imageUrl}
                            onChange={(event) => setClubPostDraft((prev) => ({ ...prev, imageUrl: event.target.value }))}
                            placeholder="Image URL (optional)"
                            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/15 text-sm focus:outline-none focus:border-white/35"
                          />
                          <textarea
                            value={clubPostDraft.description}
                            onChange={(event) => setClubPostDraft((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder="Condition, comp references, and shipping notes"
                            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/15 text-sm focus:outline-none focus:border-white/35 resize-none"
                            rows={3}
                          />
                          <button
                            type="button"
                            onClick={handlePublishClubPost}
                            disabled={clubPostBusy || !selectedClubMembership || isSelectedClubBanned}
                            className="w-full px-3 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-b from-[#E11D48] to-[#BE123C] hover:brightness-110 disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            {clubPostBusy ? 'Posting...' : isSelectedClubBanned ? 'Blocked From Club' : selectedClubMembership ? 'Post In Club Feed' : 'Join Club To Post'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0D1117] p-3 min-h-0 flex-1 overflow-y-auto">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mb-2">Club Feed</p>
                      <div className="space-y-2">
                        {selectedClubPosts.length === 0 ? (
                          <p className="text-sm text-white/60">No card posts yet in this club.</p>
                        ) : (
                          selectedClubPosts.map((post) => {
                            const canDeletePost = canModerateClubPosts || post.createdByUid === firebaseUser?.uid;
                            return (
                              <div key={post.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold">{post.title || 'Untitled Card'}</p>
                                    <p className="text-xs text-[#FECACA] mt-1">Asking: {post.askingPrice || 'N/A'}</p>
                                    <p className="text-[11px] text-white/55 mt-1">Posted by {post.createdByName || 'Unknown'} {post.createdByRole ? `(${post.createdByRole})` : ''}</p>
                                  </div>
                                  {canDeletePost && (
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteClubPost(post)}
                                        disabled={clubActionBusyId === `post-${post.id}`}
                                        className="px-2.5 py-1 rounded-lg text-[11px] bg-red-900/45 border border-red-400/30 text-red-100 hover:bg-red-900/60 disabled:opacity-60"
                                      >
                                        Delete
                                      </button>
                                      {post.createdByUid && post.createdByUid !== firebaseUser?.uid && (
                                        <button
                                          type="button"
                                          onClick={() => handleReportClubPost(post)}
                                          disabled={clubReportBusy || !selectedClubMembership || isSelectedClubBanned}
                                          className="px-2.5 py-1 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                        >
                                          Report
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {!canDeletePost && post.createdByUid !== firebaseUser?.uid && (
                                    <button
                                      type="button"
                                      onClick={() => handleReportClubPost(post)}
                                      disabled={clubReportBusy || !selectedClubMembership || isSelectedClubBanned}
                                      className="px-2.5 py-1 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                    >
                                      Report
                                    </button>
                                  )}
                                </div>
                                {post.imageUrl && (
                                  <a
                                    href={post.imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-block text-[11px] text-red-200 hover:text-red-100"
                                  >
                                    View card image
                                  </a>
                                )}
                                {post.description && <p className="mt-2 text-sm text-white/75">{post.description}</p>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {canModerateClubPosts && (
                      <div className="rounded-2xl border border-white/10 bg-[#0D1117] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Moderation Queue</p>
                          <span className="text-[11px] text-white/65">Open: {openSelectedClubReports.length}</span>
                        </div>
                        <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
                          {openSelectedClubReports.length === 0 ? (
                            <p className="text-xs text-white/60">No open reports in this club.</p>
                          ) : (
                            openSelectedClubReports.map((report) => (
                              <div key={report.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 space-y-2">
                                <p className="text-sm font-semibold">
                                  {report.reportType === 'post' ? 'Post Report' : 'Member Report'}: {report.targetName || report.targetPostTitle || 'Unknown target'}
                                </p>
                                <p className="text-[11px] text-white/60">Reason: {report.reason || 'No reason provided'}</p>
                                <p className="text-[11px] text-white/50">Reported by {report.reportedByName || report.reportedByEmail || report.reportedByUid}</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleModerationActionFromReport(report, 'dismiss')}
                                    disabled={clubActionBusyId === `report-${report.id}`}
                                    className="px-2.5 py-1 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                  >
                                    Dismiss
                                  </button>
                                  {report.targetUid && (
                                    <button
                                      type="button"
                                      onClick={() => handleModerationActionFromReport(report, 'remove-member')}
                                      disabled={clubActionBusyId === `report-${report.id}`}
                                      className="px-2.5 py-1 rounded-lg text-[11px] bg-red-900/45 border border-red-400/30 text-red-100 hover:bg-red-900/60 disabled:opacity-60"
                                    >
                                      Remove Member
                                    </button>
                                  )}
                                  {report.targetUid && (
                                    <button
                                      type="button"
                                      onClick={() => handleModerationActionFromReport(report, 'ban-member')}
                                      disabled={clubActionBusyId === `report-${report.id}`}
                                      className="px-2.5 py-1 rounded-lg text-[11px] bg-red-800/55 border border-red-300/40 text-red-100 hover:bg-red-800/70 disabled:opacity-60"
                                    >
                                      Block Member
                                    </button>
                                  )}
                                  {report.targetPostId && (
                                    <button
                                      type="button"
                                      onClick={() => handleModerationActionFromReport(report, 'delete-post')}
                                      disabled={clubActionBusyId === `report-${report.id}`}
                                      className="px-2.5 py-1 rounded-lg text-[11px] bg-amber-700/40 border border-amber-300/30 text-amber-100 hover:bg-amber-700/60 disabled:opacity-60"
                                    >
                                      Delete Post
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full min-h-0 flex items-center justify-center text-center">
                    <div>
                      <p className="text-lg font-bold">No club selected</p>
                      <p className="text-sm text-white/60 mt-1">Create a club or pick one from the list.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {currentTab === 'collection' && (
          <div className="min-h-0 space-y-3 py-1.5 max-w-4xl mx-auto w-full flex flex-col overflow-y-auto overscroll-y-contain pr-1">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-black">My Trading Binder</h2>
                <p className="text-xs text-red-100">Your public inventory up for trade.</p>
              </div>
              <button onClick={() => setCurrentTab('post')} className="bg-[#E50914] text-white text-xs font-bold px-3 py-2 rounded-xl" type="button">
                + Add
              </button>
            </div>

            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200">Account Verification</p>
                  <p className="mt-1 text-sm text-white/80">
                    Status: {String(currentUserProfile?.isVerified || currentUserProfile?.is_verified || sellerVerificationStatus === 'verified' ? 'Verified' : sellerVerificationStatus)}
                  </p>
                </div>
                <StatusPill
                  label={currentUserProfile?.isVerified || currentUserProfile?.is_verified || sellerVerificationStatus === 'verified' ? 'Verified' : 'Action needed'}
                  status={currentUserProfile?.isVerified || currentUserProfile?.is_verified || sellerVerificationStatus === 'verified' ? 'verified' : 'pending'}
                  tone={currentUserProfile?.isVerified || currentUserProfile?.is_verified || sellerVerificationStatus === 'verified' ? 'success' : 'warning'}
                />
              </div>
              <button
                type="button"
                onClick={handleStartIdentityVerification}
                disabled={verificationSessionBusy}
                className="min-h-11 rounded-xl border border-[#FFD700]/70 bg-[#FFD700] px-4 py-2.5 text-sm font-bold text-[#0B0E14] hover:bg-[#FFE66D] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70 disabled:opacity-60"
              >
                {verificationSessionBusy ? 'Opening verification...' : 'Verify Account with Stripe Identity'}
              </button>
              {verificationError && <p className="text-xs text-rose-200">{verificationError}</p>}
              {verificationInfo && <p className="text-xs text-emerald-200">{verificationInfo}</p>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {myCollection.map((card) => (
                <div
                  key={card.id}
                  className="bg-red-950/70 border border-red-400/30 rounded-2xl p-3 md:p-4 flex flex-col justify-between h-36 md:h-40 relative group"
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
          <div className="space-y-3 py-1.5 min-h-0 flex flex-col max-w-3xl mx-auto w-full overflow-y-auto overscroll-y-contain pr-1">
            {!activeChat ? (
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg sm:text-2xl font-black">Marketplace Inbox</h2>
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

                {reviewableTransactions.length > 0 && (
                  <details className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4 space-y-3" open={!isNativeCoreApp}>
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-red-100">Completed Deals Awaiting Your Review</h3>
                      <span className="text-xs text-red-200">{reviewableTransactions.length}</span>
                    </summary>
                    <div className="mt-3 space-y-3">
                    {reviewableTransactions.slice(0, 8).map((transaction) => {
                      const draft = reviewDrafts[transaction.id] || { rating: 5, comment: '' };
                      const isSubmitting = Boolean(reviewBusyByPurchaseId[transaction.id]);
                      return (
                        <div key={transaction.id} className="rounded-xl border border-red-400/20 bg-black/20 p-3 space-y-2">
                          <p className="text-sm font-semibold">
                            {transaction.cardTitle || 'Completed Transaction'}
                          </p>
                          <p className="text-xs text-red-100">
                            Leave a {transaction.reviewedRole} review for {transaction.counterpartyName}
                          </p>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-red-100">Rating</label>
                            <select
                              value={draft.rating}
                              onChange={(event) => handleReviewDraftChange(transaction.id, 'rating', Number(event.target.value))}
                              className="px-2 py-1 rounded-lg bg-red-950 border border-red-400/30 text-xs"
                            >
                              {[5, 4, 3, 2, 1].map((value) => (
                                <option key={value} value={value}>{value} ★</option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            rows={2}
                            value={draft.comment}
                            onChange={(event) => handleReviewDraftChange(transaction.id, 'comment', event.target.value)}
                            placeholder="Share your experience"
                            className="w-full px-3 py-2 rounded-lg bg-red-950 border border-red-400/30 text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleSubmitTransactionReview(transaction)}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#E50914] hover:bg-[#cc070e] disabled:opacity-60"
                          >
                            {isSubmitting ? 'Submitting...' : 'Submit Review'}
                          </button>
                        </div>
                      );
                    })}
                    </div>
                  </details>
                )}

                {escrowTransactions.length > 0 && (
                  <details className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4 space-y-3" open={!isNativeCoreApp}>
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-red-100">Escrow Orders</h3>
                      <span className="text-xs text-red-200">{escrowTransactions.length}</span>
                    </summary>
                    <div className="mt-3 space-y-3">
                    {escrowTransactions.slice(0, 10).map((transaction) => {
                      const trackingDraft = trackingDrafts[transaction.orderId] || { carrier: '', trackingNumber: '', trackingUrl: '' };
                      const trackingBusy = Boolean(trackingBusyByPurchaseId[transaction.orderId]);
                      const releaseBusy = Boolean(releaseBusyByPurchaseId[transaction.orderId]);
                      const disputeBusy = Boolean(disputeBusyByPurchaseId[transaction.orderId]);
                      const paymentHeld = String(transaction.escrowStatus || transaction.status || '').toLowerCase() === 'payment_held';
                      return (
                        <div key={transaction.orderId} className="rounded-xl border border-red-400/20 bg-black/20 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-sm font-semibold">{transaction.cardTitle || 'Escrow Order'}</p>
                              <p className="text-xs text-red-100">
                                Order {transaction.orderId} · Status {transaction.escrowStatus || transaction.status || 'pending'}
                              </p>
                              <p className="text-xs text-red-100">
                                Charge {formatMoney(transaction.chargedTotalAmount || transaction.listingPrice || 0)} · Held for {formatMoney(transaction.escrowAmount || transaction.sellerPayoutAmount || transaction.listingPrice || 0)}
                              </p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[11px] border ${paymentHeld ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'border-white/20 bg-white/10'}`}>
                              {transaction.isBuyer ? `Buyer view · Seller ${transaction.counterpartyName}` : `Seller view · Buyer ${transaction.counterpartyName}`}
                            </span>
                          </div>

                          {transaction.isSeller && !paymentHeld && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
                              Awaiting Buyer Payment
                            </div>
                          )}

                          {transaction.isSeller && paymentHeld && (
                            <div className="grid gap-2 md:grid-cols-3">
                              <input
                                type="text"
                                value={trackingDraft.carrier}
                                onChange={(event) => setTrackingDrafts((prev) => ({
                                  ...prev,
                                  [transaction.orderId]: {
                                    ...trackingDraft,
                                    carrier: event.target.value
                                  }
                                }))}
                                placeholder="Carrier (UPS, USPS, FedEx)"
                                className="px-3 py-2 rounded-xl bg-red-950 border border-red-400/30 text-xs focus:outline-none"
                              />
                              <input
                                type="text"
                                value={trackingDraft.trackingNumber}
                                onChange={(event) => setTrackingDrafts((prev) => ({
                                  ...prev,
                                  [transaction.orderId]: {
                                    ...trackingDraft,
                                    trackingNumber: event.target.value
                                  }
                                }))}
                                placeholder="Tracking number"
                                className="px-3 py-2 rounded-xl bg-red-950 border border-red-400/30 text-xs focus:outline-none"
                              />
                              <input
                                type="url"
                                value={trackingDraft.trackingUrl}
                                onChange={(event) => setTrackingDrafts((prev) => ({
                                  ...prev,
                                  [transaction.orderId]: {
                                    ...trackingDraft,
                                    trackingUrl: event.target.value
                                  }
                                }))}
                                placeholder="Optional tracking URL"
                                className="px-3 py-2 rounded-xl bg-red-950 border border-red-400/30 text-xs focus:outline-none"
                              />
                            </div>
                          )}

                          {transaction.isBuyer && (
                            <textarea
                              rows={2}
                              value={disputeDrafts[transaction.orderId] || ''}
                              onChange={(event) => setDisputeDrafts((prev) => ({
                                ...prev,
                                [transaction.orderId]: event.target.value
                              }))}
                              placeholder="If needed, explain the dispute reason before the 48-hour timer expires"
                              className="w-full px-3 py-2 rounded-xl bg-red-950 border border-red-400/30 text-xs focus:outline-none resize-none"
                            />
                          )}

                          <div className="flex flex-wrap gap-2">
                            {transaction.isSeller && paymentHeld && (
                              <button
                                type="button"
                                disabled={trackingBusy}
                                onClick={() => handleSubmitTrackingForOrder(transaction)}
                                className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-60"
                              >
                                {trackingBusy ? 'Submitting tracking...' : 'Submit Tracking'}
                              </button>
                            )}

                            {transaction.isBuyer && (
                              <>
                                <button
                                  type="button"
                                  disabled={releaseBusy}
                                  onClick={() => handleReleaseSellerFundsEarly(transaction)}
                                  className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {releaseBusy ? 'Releasing...' : 'Accept Delivery & Release Funds'}
                                </button>
                                <button
                                  type="button"
                                  disabled={disputeBusy}
                                  onClick={() => handleOpenOrderDispute(transaction)}
                                  className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 disabled:opacity-60"
                                >
                                  {disputeBusy ? 'Opening dispute...' : 'Open Dispute'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </details>
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
              </div>
            ) : (
              <div className="flex flex-col h-full min-h-0 space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-red-600/40">
                  <button onClick={() => setActiveChat(null)} className="text-red-200 text-sm hover:text-white" type="button">
                    ◀ Back
                  </button>
                  <h3 className="font-bold text-base flex-1">Chatting with @{activeChat.counterpartyName || activeChat.user}</h3>
                  <button
                    type="button"
                    onClick={handleReportChatUser}
                    disabled={chatReportBusy}
                    className="px-3 py-1.5 rounded-lg text-[11px] bg-red-900/45 border border-red-400/30 text-red-100 hover:bg-red-900/60 disabled:opacity-60"
                  >
                    {chatReportBusy ? 'Submitting...' : 'Report User'}
                  </button>
                </div>

                <div className="rounded-2xl border border-red-400/30 bg-red-950/35 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs uppercase tracking-wider text-red-100 font-bold">Offer Negotiation</p>
                    <p className="text-xs text-red-200">Select trade-only or a cash difference protected by escrow.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {DEAL_TYPES.filter((deal) => deal.value !== 'cash_sale').map((deal) => (
                      <button
                        key={deal.value}
                        type="button"
                        onClick={() => setOfferDealType(deal.value)}
                        className={`px-2 py-2 rounded-xl text-[11px] border ${offerDealType === deal.value ? 'bg-[#E50914] border-[#E50914]' : 'bg-white/5 border-white/15 hover:border-white/30'}`}
                      >
                        {deal.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={offerDealType === 'pure_trade' ? 'No cash amount' : 'Cash difference'}
                      value={offerDraftAmount}
                      onChange={(event) => setOfferDraftAmount(event.target.value)}
                      disabled={offerDealType === 'pure_trade'}
                      className="flex-grow p-2.5 bg-red-950 border border-red-400/30 rounded-xl text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendOffer}
                      disabled={offerBusy}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-[#E50914] hover:bg-[#cc070e] disabled:opacity-60"
                    >
                      {offerBusy ? 'Sending...' : 'Send Offer'}
                    </button>
                  </div>

                  {chatOffers.length > 0 && (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {chatOffers.map((offer) => {
                        const fromSelf = offer.fromUserId === firebaseUser?.uid;
                        const isIncomingPending = !fromSelf && String(offer.status || '').toLowerCase() === 'pending';
                        const dealType = offer.dealType || 'pure_trade';
                        const paymentHeld = offer.paymentStatus === 'payment_held';
                        const cashPaymentPending = ['hybrid_trade', 'cash_sale'].includes(dealType) && !paymentHeld && String(offer.status || '').toLowerCase() === 'accepted';
                        const pureTradeAccepted = dealType === 'pure_trade' && String(offer.status || '').toLowerCase() === 'accepted';
                        const isBuyer = offer.buyerUid === firebaseUser?.uid;
                        const currentProtectionPaid = isBuyer
                          ? offer.buyerProtectionPaymentStatus === 'payment_held'
                          : offer.sellerProtectionPaymentStatus === 'payment_held';
                        const pureTradePaymentPending = pureTradeAccepted && !currentProtectionPaid;
                        return (
                          <div
                            key={offer.id}
                            className={`rounded-xl border px-3 py-2 text-xs ${fromSelf ? 'bg-[#E50914]/20 border-[#E50914]/40' : 'bg-black/25 border-white/15'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold">
                              {fromSelf ? 'You offered' : `${offer.fromUserName || 'Collector'} offered`} {offer.dealType === 'pure_trade' ? 'a card trade' : `${formatMoney(offer.cashAmount || offer.amount || 0)} cash`}
                              </p>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${DEAL_TYPE_STYLES[dealType] || DEAL_TYPE_STYLES.pure_trade}`}>
                                {DEAL_TYPES.find((deal) => deal.value === dealType)?.label || 'Trade Only'}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/70 mt-1">Status: {offer.status || 'pending'}</p>
                            {(cashPaymentPending || pureTradePaymentPending) && (
                              <div className={`mt-2 rounded-lg border px-2.5 py-2 ${fromSelf ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-500/30 bg-slate-500/10 text-slate-300'}`}>
                                <p className="font-semibold">{pureTradePaymentPending ? 'Trade Protection Fee Required · $2.99' : 'Awaiting Buyer Payment'}</p>
                                {((cashPaymentPending && isBuyer) || pureTradePaymentPending) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryOfferPayment(offer)}
                                    className="mt-2 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-black hover:bg-amber-400"
                                  >
                                    {pureTradePaymentPending ? 'Pay Trade Protection Fee' : 'Complete Escrow Payment'}
                                  </button>
                                )}
                              </div>
                            )}
                            {pureTradeAccepted && currentProtectionPaid && !paymentHeld && (
                              <p className="mt-2 rounded-lg border border-slate-500/30 bg-slate-500/10 px-2.5 py-2 font-semibold text-slate-300">
                                {isBuyer ? 'Your protection fee is paid. Awaiting the other party.' : 'Awaiting the other party’s Trade Protection Fee.'}
                              </p>
                            )}
                            {paymentHeld && dealType !== 'pure_trade' && (
                              <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 font-semibold text-emerald-400">
                                Escrow Held · Seller may ship
                              </p>
                            )}
                            {isIncomingPending && (
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleOfferDecision(offer, 'accepted')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-bold"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOfferDecision(offer, 'rejected')}
                                  className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-bold"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOfferDecision(offer, 'counter')}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 font-bold"
                                >
                                  Counter
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div data-chat-messages className="flex-1 min-h-0 bg-red-900/20 rounded-2xl p-4 flex flex-col justify-end space-y-3 overflow-y-auto">
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
                  <button 
                    className={`px-4 rounded-xl text-xs font-bold transition-opacity ${
                      activeChat && chatDraft.trim() 
                        ? 'bg-[#E50914] hover:bg-[#cc070e] cursor-pointer' 
                        : 'bg-gray-600 opacity-50 cursor-not-allowed'
                    }`} 
                    type="button" 
                    onClick={handleSendMessage}
                    disabled={!activeChat || !chatDraft.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {showNotificationsPanel && (
        <div className="fixed inset-0 bg-black/70 z-[66] flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#171A22] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Notifications</h3>
                <p className="text-xs text-white/60">Realtime updates for interests, matches, and messages.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationsPanel(false)}
                className="text-sm text-white/70 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleMarkAllNotificationsRead}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold"
              >
                Mark all as read
              </button>
              <button
                type="button"
                onClick={() => setNotifications([])}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white/80"
              >
                Clear all
              </button>
              {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                <button
                  type="button"
                  onClick={() => Notification.requestPermission().catch(() => {})}
                  className="px-3 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-xs font-semibold"
                >
                  Enable Browser Alerts
                </button>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {notifications.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${notification.read ? 'border-white/10 bg-white/[0.02]' : 'border-red-400/30 bg-red-500/10 hover:bg-red-500/15'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{notification.title}</p>
                      {!notification.read && <span className="w-2 h-2 rounded-full bg-[#E50914]" />}
                    </div>
                    <p className="text-xs text-white/75 mt-1">{notification.message}</p>
                    <p className="text-[11px] text-white/45 mt-2">
                      {new Date(notification.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
                <div className="h-32 w-full pt-2">
                  <CardFlipImage
                    frontImageUrl={viewingCollection.imageFrontUrl || viewingCollection.imageUrl || ''}
                    backImageUrl={viewingCollection.imageBackUrl || ''}
                    title={viewingCollection.title}
                    fallback={viewingCollection.imageEmoji}
                  />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white line-clamp-1">{viewingCollection.title}</h4>
                  <p className="text-[10px] text-neutral-400">{viewingCollection.brand}</p>
                </div>
              </div>

              {(viewingCollection.collection || []).map((item) => (
                <div key={item.id} className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 flex flex-col justify-between space-y-4">
                  <div className="h-32 w-full pt-2">
                    <CardFlipImage
                      frontImageUrl={item.imageFrontUrl || item.imageUrl || ''}
                      backImageUrl={item.imageBackUrl || ''}
                      title={item.title}
                      fallback={item.emoji}
                    />
                  </div>
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
              <h3 className="text-lg font-bold">Choose Action</h3>
              <button
                type="button"
                onClick={() => setShowInterestModal(false)}
                className="text-sm text-white/70 hover:text-white"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-white/75">
              {ENABLE_PAYMENT_PIPELINE
                ? `Choose whether you want to negotiate or buy ${currentCard.title} at the listed price.`
                : `Choose whether you want to negotiate for ${currentCard.title}.`}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEAL_TYPES.map((deal) => (
                <button
                  key={deal.value}
                  type="button"
                  onClick={() => {
                    setPendingDealType(deal.value);
                    setPendingInterestType(deal.value === 'cash_sale' ? INSTANT_PURCHASE_ACTION : MARKETPLACE_ACTION_TYPES[0]);
                  }}
                  className={`px-2 py-2 rounded-xl text-[11px] border ${pendingDealType === deal.value ? DEAL_TYPE_STYLES[deal.value] : 'bg-white/5 border-white/15 hover:border-white/30'}`}
                >
                  {deal.label}
                </button>
              ))}
            </div>
            {pendingDealType === 'hybrid_trade' && (
              <label className="block text-xs text-white/70">
                Cash difference
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                  <span className="text-white/50">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pendingCashAmount}
                    onChange={(event) => setPendingCashAmount(event.target.value)}
                    placeholder="200"
                      className="w-full bg-transparent text-base text-white focus:outline-none"
                  />
                </div>
              </label>
            )}
            <button
              type="button"
              disabled={interestBusy}
              onClick={handleSendInterest}
              className="min-h-11 w-full rounded-xl bg-[#FFD700] text-[#0B0E14] hover:bg-[#FFE66D] font-semibold text-sm disabled:opacity-60"
            >
              {interestBusy ? 'Submitting...' : pendingDealType === 'cash_sale' ? 'Continue to Secure Checkout' : pendingDealType === 'hybrid_trade' ? 'Send Hybrid Trade' : 'Send Trade Request'}
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
                      onClick={() => {
                        setShowOnboarding(false);
                        setOnboardingBusy(false);
                      }}
                      className="px-4 py-2.5 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-medium transition-all"
                    >
                      Skip for Now
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

      {showPersistentMobileDock && (
      <footer
        className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-[env(safe-area-inset-bottom)] pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="max-w-lg mx-auto pointer-events-auto">
        <nav className="grid grid-cols-5 items-end rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(10,10,10,0.98),rgba(0,0,0,0.98))] px-2 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl ring-1 ring-white/8">
          <button
            onClick={() => {
              navigateToTab('onboarding');
              setActiveChat(null);
            }}
            className="group relative flex items-center justify-center"
            type="button"
          >
            <span className={`absolute inset-x-1 inset-y-0 rounded-[24px] border transition-all duration-300 ${currentTab === 'onboarding' ? 'border-white/10 bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border-transparent bg-transparent group-hover:bg-white/[0.04]'}`} />
            <span className="relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-2 py-2">
              {clubModerationBadgeCount > 0 && (
                <span className="absolute -top-0.5 right-1 min-w-4 h-4 px-1 rounded-full bg-[#E50914] border border-red-300/40 text-[10px] leading-4 text-white font-bold text-center">
                  {clubModerationBadgeCount > 99 ? '99+' : clubModerationBadgeCount}
                </span>
              )}
              <NavIcon className={`transition-all duration-300 ${currentTab === 'onboarding' ? 'w-[1.3rem] h-[1.3rem] text-white' : 'w-[1.2rem] h-[1.2rem] text-white/65 group-hover:text-white/80'}`}><CardClubsIcon /></NavIcon>
              <span className={`text-[11px] font-semibold tracking-[0.01em] transition-colors duration-300 ${currentTab === 'onboarding' ? 'text-white' : 'text-white/60 group-hover:text-white/78'}`}>Card Clubs</span>
              <span className={`absolute bottom-1.5 h-1 rounded-full bg-gradient-to-r from-[#F5C542] via-white to-[#E11D48] transition-all duration-300 ${currentTab === 'onboarding' ? 'w-8 opacity-100' : 'w-3 opacity-0'}`} />
            </span>
          </button>

          <button
            onClick={() => {
              navigateToTab('swipe');
              setActiveChat(null);
            }}
            className="group relative flex items-center justify-center"
            type="button"
          >
            <span className={`absolute inset-x-1 inset-y-0 rounded-[24px] border transition-all duration-300 ${currentTab === 'swipe' ? 'border-white/10 bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border-transparent bg-transparent group-hover:bg-white/[0.04]'}`} />
            <span className="relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-2 py-2">
              <NavIcon className={`transition-all duration-300 ${currentTab === 'swipe' ? 'w-[1.3rem] h-[1.3rem] text-white' : 'w-[1.2rem] h-[1.2rem] text-white/65 group-hover:text-white/80'}`}><SwipeDeckIcon /></NavIcon>
              <span className={`text-[11px] font-semibold tracking-[0.01em] transition-colors duration-300 ${currentTab === 'swipe' ? 'text-white' : 'text-white/60 group-hover:text-white/78'}`}>Discover</span>
              <span className={`absolute bottom-1.5 h-1 rounded-full bg-gradient-to-r from-[#F5C542] via-white to-[#E11D48] transition-all duration-300 ${currentTab === 'swipe' ? 'w-8 opacity-100' : 'w-3 opacity-0'}`} />
            </span>
          </button>

          <button
            onClick={handleQuickCaptureFromDock}
            className="group relative flex items-center justify-center -mt-4"
            type="button"
          >
            <span className={`absolute inset-x-1 inset-y-0 rounded-[26px] border transition-all duration-300 ${currentTab === 'post' ? 'border-[#F5C542]/25 bg-[radial-gradient(circle_at_top,rgba(245,197,66,0.3),rgba(225,29,72,0.24)_62%,rgba(255,255,255,0.08))] shadow-[0_16px_30px_rgba(225,29,72,0.24)]' : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] group-hover:bg-white/[0.08]'}`} />
            <span className="relative flex min-h-[74px] flex-col items-center justify-center gap-1 px-3 py-2.5">
              <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
              <NavIcon className={`transition-all duration-300 ${currentTab === 'post' ? 'w-[1.5rem] h-[1.5rem] text-white' : 'w-[1.4rem] h-[1.4rem] text-white/85 group-hover:text-white'}`}><CameraIcon /></NavIcon>
              <span className={`text-[11px] font-bold tracking-[0.01em] transition-colors duration-300 ${currentTab === 'post' ? 'text-white' : 'text-white/80 group-hover:text-white'}`}>Camera</span>
              <span className={`absolute bottom-1.5 h-1 rounded-full bg-gradient-to-r from-[#F5C542] via-white to-[#E11D48] transition-all duration-300 ${currentTab === 'post' ? 'w-9 opacity-100' : 'w-3 opacity-40'}`} />
            </span>
          </button>

          <button
            onClick={() => {
              navigateToTab('collection');
              setActiveChat(null);
            }}
            className="group relative flex items-center justify-center"
            type="button"
          >
            <span className={`absolute inset-x-1 inset-y-0 rounded-[24px] border transition-all duration-300 ${currentTab === 'collection' ? 'border-white/10 bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border-transparent bg-transparent group-hover:bg-white/[0.04]'}`} />
            <span className="relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-2 py-2">
              <NavIcon className={`transition-all duration-300 ${currentTab === 'collection' ? 'w-[1.3rem] h-[1.3rem] text-white' : 'w-[1.2rem] h-[1.2rem] text-white/65 group-hover:text-white/80'}`}><BinderIcon /></NavIcon>
              <span className={`text-[11px] font-semibold tracking-[0.01em] transition-colors duration-300 ${currentTab === 'collection' ? 'text-white' : 'text-white/60 group-hover:text-white/78'}`}>Binder</span>
              <span className={`absolute bottom-1.5 h-1 rounded-full bg-gradient-to-r from-[#F5C542] via-white to-[#E11D48] transition-all duration-300 ${currentTab === 'collection' ? 'w-8 opacity-100' : 'w-3 opacity-0'}`} />
            </span>
          </button>

          <button
            onClick={() => navigateToTab('messages')}
            className="group relative flex items-center justify-center"
            type="button"
          >
            <span className={`absolute inset-x-1 inset-y-0 rounded-[24px] border transition-all duration-300 ${currentTab === 'messages' ? 'border-white/10 bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border-transparent bg-transparent group-hover:bg-white/[0.04]'}`} />
            <span className="relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-2 py-2">
            <div className="relative">
              <NavIcon className={`transition-all duration-300 ${currentTab === 'messages' ? 'w-[1.3rem] h-[1.3rem] text-white' : 'w-[1.2rem] h-[1.2rem] text-white/65 group-hover:text-white/80'}`}><InboxIcon /></NavIcon>
              {inboxBadgeCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[1.3rem] h-[1.3rem] px-1.5 rounded-full border border-white/18 bg-[linear-gradient(180deg,#FF4D5E,#C9143E)] text-[10px] leading-[1.1rem] text-white font-extrabold text-center shadow-[0_8px_16px_rgba(201,20,62,0.35)] ring-2 ring-[#121826]">
                  {inboxBadgeCount > 99 ? '99+' : inboxBadgeCount}
                </span>
              )}
            </div>
            <span className={`text-[11px] font-semibold tracking-[0.01em] transition-colors duration-300 ${currentTab === 'messages' ? 'text-white' : 'text-white/60 group-hover:text-white/78'}`}>Imbox</span>
            <span className={`absolute bottom-1.5 h-1 rounded-full bg-gradient-to-r from-[#F5C542] via-white to-[#E11D48] transition-all duration-300 ${currentTab === 'messages' ? 'w-8 opacity-100' : 'w-3 opacity-0'}`} />
            </span>
          </button>
        </nav>
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
              CardSwipers is a collector marketplace. You must provide accurate profile information, truthful card descriptions, and clear photos. You are responsible for the content you upload, the accuracy of any card listing, and the way you interact with other users.
            </p>
            <p className="text-sm leading-relaxed">
              To use the service, you must be old enough to form a binding contract in your jurisdiction and must comply with all applicable laws. You agree not to submit false identity information, fraudulent listings, offensive or illegal content, or messages intended to harass, scam, or manipulate other users.
            </p>
            <p className="text-sm leading-relaxed">
              We may review listings, messages, interests, offers, transaction history, and verification records to operate the marketplace, resolve disputes, enforce policies, investigate fraud, and protect users. Account restrictions, deactivation, or removal may occur if you violate these terms or the marketplace rules.
            </p>
            <p className="text-sm leading-relaxed">
              If you request account deletion, we will follow our deletion and retention process, but certain records may be kept when required for legal, fraud-prevention, tax, security, or dispute-resolution purposes.
            </p>
          </div>
        </div>
      )}

      {ENABLE_PAYMENT_PIPELINE && activePaymentSheet && stripePromise && (
        <div className="fixed inset-0 z-[68] flex items-end justify-center overflow-y-auto bg-black/80 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:items-center">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-[28px] border border-[#30363D] bg-[#0B0E14] p-5 pb-8 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Secure escrow checkout</h2>
                <p className="text-sm text-white/75">Payment is held until shipment and release.</p>
            {confirmDialog && (
              <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
                <div className="w-full max-w-md space-y-5 rounded-2xl border border-[#30363D] bg-[#0B0E14] p-5 text-white shadow-2xl">
                  <div>
                    <h2 id="confirm-dialog-title" className="text-lg font-bold">{confirmDialog.title}</h2>
                    <p className="mt-2 text-sm text-white/75">{confirmDialog.message}</p>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        confirmResolverRef.current?.(false);
                        confirmResolverRef.current = null;
                        setConfirmDialog(null);
                      }}
                      className="min-h-11 rounded-xl border border-[#30363D] bg-[#161B22] px-4 text-sm font-semibold text-white hover:bg-[#20262D] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        confirmResolverRef.current?.(true);
                        confirmResolverRef.current = null;
                        setConfirmDialog(null);
                      }}
                      className="min-h-11 rounded-xl bg-[#FFD700] px-4 text-sm font-semibold text-[#0B0E14] hover:bg-[#FFE66D] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70"
                    >
                      {confirmDialog.confirmLabel}
                    </button>
                  </div>
                </div>
              </div>
            )}

              </div>
              <button
                type="button"
                onClick={() => {
                  setActivePaymentSheet(null);
                  setPaymentSheetError('');
                }}
                className="min-h-11 min-w-11 rounded-full text-sm font-semibold text-white/75 hover:bg-[#161B22] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70"
              >
                Close
              </button>
            </div>

            {paymentSheetError && (
              <div className="rounded-xl border border-rose-300/60 bg-rose-400/15 px-3 py-2 text-sm text-rose-100">
                {paymentSheetError}
              </div>
            )}

            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: activePaymentSheet.clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#FFD700',
                    colorBackground: '#161B22',
                    colorText: '#FFFFFF',
                    colorDanger: '#FDA4AF',
                    borderRadius: '12px'
                  }
                }
              }}
            >
              <EscrowPaymentForm
                purchaseSummary={activePaymentSheet}
                onCancel={() => {
                  if (activePaymentSheet.offerId) {
                    updateDoc(doc(db, 'offers', activePaymentSheet.offerId), {
                      paymentStatus: 'payment_pending',
                      updatedAt: serverTimestamp()
                    }).catch((error) => console.error('Failed marking offer payment pending:', error));
                  }
                  setActivePaymentSheet(null);
                  setPaymentSheetError('');
                }}
                onError={setPaymentSheetError}
                onSuccess={handleEscrowPaymentSuccess}
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );
}
