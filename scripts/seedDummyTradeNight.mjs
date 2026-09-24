// One-off dev script: seeds a club + open trade night for a test account and registers them.
// Credentials are read from env vars only - never hardcode or paste them here.
//
// Usage (PowerShell):
//   $env:SEED_EMAIL="your-dummy-account@example.com"
//   $env:SEED_PASSWORD="the-password"
//   node scripts/seedDummyTradeNight.mjs
//
// The script signs in as that account (same as the app would) and only performs
// writes the account is already allowed to make under firestore.rules.

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDMQiOJDkoeFNJcFy0GlcX2MC0lXPmp53k',
  authDomain: 'cardswipers-6aa66.firebaseapp.com',
  projectId: 'cardswipers-6aa66',
  storageBucket: 'cardswipers-6aa66.firebasestorage.app',
  messagingSenderId: '233845197468',
  appId: '1:233845197468:web:e3dba9f9558cfdfd23bb59'
};

const REGISTER_TRADE_NIGHT_URL = 'https://us-central1-cardswipers-6aa66.cloudfunctions.net/registerTradeNight';
const CLUB_NAME = 'Dummy Test Club';

async function main() {
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (!email || !password) {
    console.error('Set SEED_EMAIL and SEED_PASSWORD environment variables first.');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const { user } = await signInWithEmailAndPassword(auth, email, password);
  console.log(`Signed in as ${user.email} (${user.uid})`);

  let clubId;
  const existingClubs = await getDocs(
    query(collection(db, 'clubs'), where('ownerUid', '==', user.uid), where('name', '==', CLUB_NAME), limit(1))
  );

  if (!existingClubs.empty) {
    clubId = existingClubs.docs[0].id;
    console.log(`Reusing existing club ${clubId}`);
  } else {
    const clubRef = await addDoc(collection(db, 'clubs'), {
      name: CLUB_NAME,
      description: 'Seeded club for testing trade night features.',
      code: `DUMMY${Math.floor(Math.random() * 9000 + 1000)}`,
      logoType: 'preset',
      logoPresetId: 'default',
      logoUrl: '',
      accessMode: 'private',
      creditHierarchy: 'owner→agent→member',
      ownerUid: user.uid,
      ownerId: user.uid,
      ownerEmail: user.email || '',
      ownerName: user.displayName || user.email || 'Collector',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      memberCount: 1,
      activeTables: 0,
      totalEscrow: 0,
      creditLedger: {
        ownerUid: user.uid,
        ownerBalance: 'infinite',
        agentQuotas: {},
        memberBalances: {
          [user.uid]: {
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
        buyInCredits: 10,
        guaranteedPool: 100,
        registrationWindowMinutes: 30,
        roundMinutes: 10,
        capLimit: 8,
        status: 'upcoming'
      }
    });
    clubId = clubRef.id;

    await setDoc(doc(db, 'clubs', clubId, 'members', user.uid), {
      uid: user.uid,
      displayName: user.displayName || user.email || 'Collector',
      email: user.email || '',
      role: 'owner',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      credits: 'infinite',
      creditLimit: 'infinite',
      escrowHeld: 0,
      status: 'active'
    });
    console.log(`Created club ${clubId}`);
  }

  const eventRef = await addDoc(collection(db, 'clubs', clubId, 'events'), {
    title: 'Trade Night',
    status: 'registration',
    format: 'mtt-trade-night',
    buyInCredits: 10,
    guaranteedPool: 100,
    capLimit: 8,
    currentRegistrations: 0,
    escrowTotal: 0,
    roundMinutes: 10,
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
    createdByUid: user.uid,
    createdByName: user.displayName || user.email || 'Moderator',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  console.log(`Created trade night event ${eventRef.id}`);

  const idToken = await user.getIdToken();
  const response = await fetch(REGISTER_TRADE_NIGHT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ clubId, eventId: eventRef.id })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'registerTradeNight call failed');
  }

  console.log(`Registered ${user.email} for the trade night. Buy-in held: ${payload.buyInCredits} credits.`);
  console.log(`\nOpen the app, sign in as ${user.email}, and go to the club's Trade Nights tab to see it.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Seed script failed:', error.message);
  process.exit(1);
});
