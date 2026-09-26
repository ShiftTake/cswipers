// Run: node scripts/seed_trade_night_test.js
// Credentials: set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account JSON path,
// or set FIREBASE_SERVICE_ACCOUNT_JSON to the JSON contents before running this script.

const admin = require('firebase-admin');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'cardswipers-6aa66';
const TARGET_EMAIL = 'nathanjohns309@gmail.com';
const CLUB_NAME = 'Woohoo';
const ROOM_TITLE = 'VIP $500+ High Roller Table';
const IMAGE_URL = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600';
const TARGET_AVATAR = 'https://api.dicebear.com/7.x/bottts/svg?seed=nathanjohns309';
const BOT_NAMES = ['Trader_Mike', 'SlabKing99', 'CardShark_Joe', 'HoloCollector', 'ApexGrader'];
const BOT_CARDS = [
  ['1986 Fleer Michael Jordan', 1250],
  ['2003 Topps Chrome LeBron James', 1100],
  ['1999 Base Set Charizard', 975],
  ['2018 Prizm Luka Doncic Rookie', 875],
  ['2000 Bowman Tom Brady Rookie', 800],
  ['2019 National Treasures Zion Williamson', 725],
  ['2001 Topps Chrome Ichiro Rookie', 675],
  ['2020 Prizm Justin Herbert Rookie', 625],
  ['1996 Topps Chrome Kobe Bryant Rookie', 1200],
  ['2017 Prizm Patrick Mahomes Rookie', 1050]
];
const TARGET_CARDS = [
  ['1986 Fleer Michael Jordan', 1450],
  ['1999 Base Set Charizard', 1250],
  ['2003 Topps Chrome LeBron James', 1100],
  ['2018 Prizm Luka Doncic Rookie', 950],
  ['2000 Bowman Tom Brady Rookie', 850],
  ['1996 Topps Chrome Kobe Bryant Rookie', 1300],
  ['2017 Prizm Patrick Mahomes Rookie', 1150],
  ['2020 Prizm Justin Herbert Rookie', 800],
  ['2001 Topps Chrome Ichiro Rookie', 700],
  ['2019 National Treasures Zion Williamson', 900]
];

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function makeCard(id, ownerUid, title, value, index) {
  return {
    id,
    ownerUid,
    ownerName: ownerUid,
    name: title,
    title,
    brand: title.includes('Charizard') ? 'Pokemon' : 'Panini / Topps',
    category: title.includes('Charizard') ? 'TCG' : 'Basketball',
    condition: 'Near Mint - Mint',
    tradeValue: `$${value}`,
    value: `$${value}`,
    avgMarketValue: `$${value}`,
    imageUrl: IMAGE_URL,
    imageFrontUrl: IMAGE_URL,
    imageBackUrl: IMAGE_URL,
    cardNumber: `SEED-${index + 1}`,
    seededFor: 'trade-night-test'
  };
}

function asBinderCard(card) {
  return {
    id: card.id,
    name: card.name,
    title: card.title,
    imageUrl: card.imageUrl,
    value: Number(String(card.value).replace(/[^\d.]/g, ''))
  };
}

async function getOrCreateAuthUser(email, displayName, photoURL, disabled = false) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(existing.uid, { displayName, photoURL, disabled });
    return existing;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    return admin.auth().createUser({ email, displayName, photoURL, disabled });
  }
}

async function findOrCreateClub(db, ownerUid, ownerName) {
  const matches = await db.collection('clubs').where('name', '==', CLUB_NAME).limit(20).get();
  const owned = matches.docs.find((snapshot) => {
    const data = snapshot.data();
    return data.ownerUid === ownerUid || data.ownerId === ownerUid || data.ownerEmail === TARGET_EMAIL;
  });
  if (owned) return owned.ref;

  const clubRef = db.collection('clubs').doc('woohoo');
  await clubRef.set({
    name: CLUB_NAME,
    title: CLUB_NAME,
    description: 'Seeded high-value collector club for Trade Night testing.',
    code: 'WOOHOO',
    accessMode: 'private',
    ownerUid,
    ownerId: ownerUid,
    clubOwner: ownerUid,
    ownerEmail: TARGET_EMAIL,
    ownerName,
    memberCount: 6,
    activeTables: 1,
    totalEscrow: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    defaultEventConfig: {
      buyInCredits: 50,
      capLimit: 8,
      minBinderValue: 500,
      minCardCount: 6,
      minCardValue: 500,
      roundMinutes: 10
    }
  }, { merge: true });
  return clubRef;
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = serviceAccountJson
    ? admin.credential.cert(JSON.parse(serviceAccountJson))
    : admin.credential.applicationDefault();

  if (!admin.apps.length) {
    admin.initializeApp({ credential, projectId: PROJECT_ID });
  }

  const db = admin.firestore();
  const targetAuthUser = await getOrCreateAuthUser(TARGET_EMAIL, 'nathanjohns309', TARGET_AVATAR);
  const targetUid = targetAuthUser.uid;
  const targetProfileRef = db.collection('users').doc(targetUid);
  const targetProfile = {
    uid: targetUid,
    email: TARGET_EMAIL,
    displayName: 'nathanjohns309',
    username: 'nathanjohns309',
    photoURL: TARGET_AVATAR,
    profileImageUrl: TARGET_AVATAR,
    avatarUrl: TARGET_AVATAR,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await targetProfileRef.set(targetProfile, { merge: true });

  const clubRef = await findOrCreateClub(db, targetUid, 'nathanjohns309');
  const groupId = clubRef.id;
  const traders = [{
    uid: targetUid,
    email: TARGET_EMAIL,
    name: 'nathanjohns309',
    avatarUrl: TARGET_AVATAR,
    role: 'owner',
    cards: TARGET_CARDS
  }];

  for (const botName of BOT_NAMES) {
    const email = `${slug(botName)}.trade-night-bot@cardswipers.test`;
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(botName)}`;
    const authUser = await getOrCreateAuthUser(email, botName, avatarUrl, true);
    traders.push({
      uid: authUser.uid,
      email,
      name: botName,
      avatarUrl,
      role: 'member',
      cards: BOT_CARDS.slice(0, 6 + (BOT_NAMES.indexOf(botName) % 5))
    });
  }

  const batch = db.batch();
  const binderSnapshots = new Map();
  const cardSnapshots = new Map();

  for (const trader of traders) {
    const traderProfileRef = db.collection('users').doc(trader.uid);
    batch.set(traderProfileRef, {
      uid: trader.uid,
      email: trader.email,
      displayName: trader.name,
      username: trader.name,
      photoURL: trader.avatarUrl,
      profileImageUrl: trader.avatarUrl,
      avatarUrl: trader.avatarUrl,
      seededFor: 'trade-night-test',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(clubRef.collection('members').doc(trader.uid), {
      uid: trader.uid,
      email: trader.email,
      displayName: trader.name,
      username: trader.name,
      profileImageUrl: trader.avatarUrl,
      role: trader.role,
      status: 'active',
      credits: trader.role === 'owner' ? 'infinite' : 500,
      creditLimit: trader.role === 'owner' ? 'infinite' : 500,
      escrowHeld: 0,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const binderId = `${slug(trader.name)}-grail-collector-binder`;
    const binderRef = db.collection('binders').doc(binderId);
    const cards = trader.cards.map(([title, value], index) => makeCard(`${binderId}-${index + 1}`, trader.uid, title, value, index));
    const binderCards = cards.map(asBinderCard);
    const binderValue = binderCards.reduce((sum, card) => sum + card.value, 0);
    binderSnapshots.set(trader.uid, { binderId, binderName: trader.role === 'owner' ? 'Grail Collector Binder' : `${trader.name} Trade Binder`, cards: binderCards, binderValue });

    batch.set(binderRef, {
      id: binderId,
      binderId,
      userId: trader.uid,
      ownerUid: trader.uid,
      ownerEmail: trader.email,
      name: trader.role === 'owner' ? 'Grail Collector Binder' : `${trader.name} Trade Binder`,
      title: trader.role === 'owner' ? 'Grail Collector Binder' : `${trader.name} Trade Binder`,
      isDefault: true,
      cardCount: binderCards.length,
      totalValue: binderValue,
      cards: binderCards,
      seededFor: 'trade-night-test',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    for (const card of cards) {
      const cardRef = db.collection('cards').doc(card.id);
      cardSnapshots.set(card.id, card);
      batch.set(cardRef, { ...card, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    batch.set(traderProfileRef, { binders: [{ id: binderId, name: trader.role === 'owner' ? 'Grail Collector Binder' : `${trader.name} Trade Binder`, isDefault: true }], selectedBinderId: binderId }, { merge: true });
  }

  const eventId = 'vip-high-roller-table';
  const eventRef = clubRef.collection('events').doc(eventId);
  const roomRef = db.collection('trade_nights').doc(eventId);
  const sessionRef = db.collection('trade_night_sessions').doc(eventId);
  const seats = traders.map((trader) => trader.uid);
  const dealerSeat = 1;
  const targetOffset = seats.length - 1;
  const now = admin.firestore.Timestamp.now();
  const dealExpiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 45 * 1000);
  const table = {
    seats,
    dealerSeat,
    targetOffset,
    round: 1,
    orbit: 1,
    activeDealId: 'trader-mike-to-nathanjohns309',
    turnStartedAt: now,
    turnExpiresAt: dealExpiresAt
  };
  const registrations = traders.map((trader, index) => {
    const binder = binderSnapshots.get(trader.uid);
    return {
      id: trader.uid,
      userId: trader.uid,
      displayName: trader.name,
      username: trader.name,
      email: trader.email,
      profileImageUrl: trader.avatarUrl,
      status: 'registered',
      seatNumber: index + 1,
      binderId: binder.binderId,
      binderName: binder.binderName,
      binderCardIds: binder.cards.map((card) => card.id),
      binderCards: binder.cards,
      binderValue: binder.binderValue,
      binderCardCount: binder.cards.length,
      buyInCredits: 50,
      escrowStatus: 'held'
    };
  });

  batch.set(clubRef, { memberCount: traders.length, activeTables: 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  batch.set(eventRef, {
    id: eventId,
    title: ROOM_TITLE,
    status: 'live',
    format: 'mtt-trade-night',
    groupId,
    clubId: groupId,
    buyInCredits: 50,
    capLimit: 8,
    currentRegistrations: traders.length,
    escrowTotal: traders.length * 50,
    category: 'Basketball',
    minCardValue: 500,
    entryCriteria: { minCardValue: 500, minBinderValue: 500, minCardCount: 6 },
    bootedUids: [],
    table,
    scheduledFor: now,
    createdByUid: targetUid,
    createdByName: 'nathanjohns309',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(roomRef, {
    id: eventId,
    title: ROOM_TITLE,
    status: 'active',
    groupId,
    clubId: groupId,
    category: 'Basketball',
    minCardValue: 500,
    minBinderValue: 500,
    minCardCount: 6,
    sessionId: eventId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(sessionRef, {
    id: eventId,
    tradeNightId: eventId,
    groupId,
    roomTitle: ROOM_TITLE,
    status: 'active',
    activeVendorSeat: 2,
    dealerButtonSeat: 2,
    dealerButtonUid: traders[1].uid,
    seats: registrations,
    table,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  for (const registration of registrations) {
    batch.set(eventRef.collection('registrations').doc(registration.userId), {
      ...registration,
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(sessionRef.collection('seats').doc(`seat-${registration.seatNumber}`), registration, { merge: true });
  }

  const vendor = registrations[1];
  const buyer = registrations[0];
  const vendorCard = vendor.binderCards[0];
  const buyerCard = buyer.binderCards[0];
  const deal = {
    id: 'trader-mike-to-nathanjohns309',
    vendorUid: vendor.userId,
    recipientUid: buyer.userId,
    buyerUid: buyer.userId,
    vendorName: vendor.displayName,
    buyerName: buyer.displayName,
    awaitingUid: buyer.userId,
    status: 'pending',
    round: 1,
    orbit: 1,
    vendorCardIds: [vendorCard.id],
    recipientCardIds: [buyerCard.id],
    vendorCards: [vendorCard],
    recipientCards: [buyerCard],
    vendorCardImage: vendorCard.imageUrl,
    buyerCardImage: buyerCard.imageUrl,
    note: 'VIP table opening offer',
    counterCount: 0,
    expiresAt: dealExpiresAt,
    createdAt: now,
    updatedAt: now
  };
  batch.set(eventRef.collection('deals').doc(deal.id), deal, { merge: true });
  batch.set(sessionRef.collection('deals').doc(deal.id), deal, { merge: true });

  await batch.commit();
  console.log(`Seeded Woohoo group: ${groupId}`);
  console.log(`Target user: ${targetUid} (${TARGET_EMAIL})`);
  console.log(`Trade Night room: trade_nights/${eventId}`);
  console.log(`Live session: trade_night_sessions/${eventId}`);
  console.log('Dealer button: Seat 2 (Trader_Mike) -> Seat 1 (nathanjohns309)');
  console.log('Active deal: pending, expires in 45 seconds');
}

main().catch((error) => {
  console.error('Trade Night seed failed:', error.stack || error.message || error);
  process.exitCode = 1;
});
