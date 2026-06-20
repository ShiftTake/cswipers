import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';

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
const db = getFirestore(app);

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

export { app, analytics, db };
