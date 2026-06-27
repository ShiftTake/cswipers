import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { Capacitor } from '@capacitor/core';
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDMQiOJDkoeFNJcFy0GlcX2MC0lXPmp53k',
  authDomain: 'cardswipers-6aa66.firebaseapp.com',
  projectId: 'cardswipers-6aa66',
  storageBucket: 'cardswipers-6aa66.firebasestorage.app',
  messagingSenderId: '233845197468',
  appId: '1:233845197468:web:e3dba9f9558cfdfd23bb59',
  measurementId: 'G-GN4852TRJZ'
};

const app = initializeApp(firebaseConfig);
const isNativeApp = Capacitor.isNativePlatform();

const db = initializeFirestore(
  app,
  isNativeApp
    ? {
        // Native webviews are more stable with in-memory cache and forced long polling.
        experimentalForceLongPolling: true,
        useFetchStreams: false,
        localCache: memoryLocalCache()
      }
    : {
        // Improves reliability on constrained networks/proxies where WebChannel streams get aborted.
        experimentalAutoDetectLongPolling: true,
        useFetchStreams: false,
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager()
        })
      }
);

let auth;
try {
  // Explicit auth initialization is more predictable in embedded webviews (Capacitor iOS/Android).
  auth = initializeAuth(app, {
    persistence: indexedDBLocalPersistence
  });
} catch {
  auth = getAuth(app);
}

const storage = getStorage(app);

let analytics = null;

if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}

export { app, analytics, db, auth, storage };
