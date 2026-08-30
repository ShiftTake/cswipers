import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { Capacitor } from '@capacitor/core';
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, setPersistence } from 'firebase/auth';
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

let appCheck = null;

if (typeof window !== 'undefined') {
  const appCheckDebugToken =
    import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ||
    (import.meta.env.DEV ? true : undefined);

  if (appCheckDebugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }

  const recaptchaEnterpriseKey =
    import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ||
    import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
    (typeof window !== 'undefined' ? window.__CARDSWIPERS_RECAPTCHA_KEY__ : '') ||
    '';

  if (recaptchaEnterpriseKey) {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseKey),
        isTokenAutoRefreshEnabled: true
      });
    } catch (appCheckError) {
      console.warn('Firebase App Check initialization failed:', appCheckError);
    }
  }
}

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

if (typeof window !== 'undefined') {
  const authPersistence = isNativeApp ? indexedDBLocalPersistence : browserLocalPersistence;
  setPersistence(auth, authPersistence).catch(() => {
    // Keep the current auth instance if persistence fallback cannot be applied.
  });
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

export { app, appCheck, analytics, db, auth, storage };
