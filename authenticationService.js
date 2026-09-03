import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Subscribes to cards awaiting authentication (requiresAuthentication: true and not yet resolved).
 * Returns an unsubscribe function.
 */
export function getAuthenticationQueue(onChange) {
  if (typeof onChange !== 'function') return () => {};

  const authQuery = query(collection(db, 'cards'), where('requiresAuthentication', '==', true));
  return onSnapshot(authQuery, (snapshot) => {
    const cards = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((card) => card.verificationStatus !== 'verified' && card.verificationStatus !== 'rejected');
    onChange(cards);
  });
}

/**
 * Submits a Pass/Reject authentication decision via the admin-authenticated Cloud Function,
 * since card verification updates are outside the owner-only Firestore security rules.
 */
export async function reviewCardAuthentication({ firebaseUser, cardId, decision, notes = '' }) {
  if (!firebaseUser) throw new Error('You must be signed in to review authentication requests.');

  const response = await fetch('/api/authentication/review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await firebaseUser.getIdToken()}`
    },
    body: JSON.stringify({ cardId, decision, notes })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to submit authentication decision.');
  }
  return payload;
}
