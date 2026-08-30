import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Capacitor } from '@capacitor/core';
import CardSwipersLanding from './CardSwipersLanding.jsx';

const SENTRY_DSN =
  import.meta.env.VITE_SENTRY_DSN ||
  (typeof window !== 'undefined' ? window.__CARDSWIPERS_SENTRY_DSN__ : '');

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || 'production',
    release: 'cardswipers@1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false
      })
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    initialScope: {
      tags: {
        platform: Capacitor.getPlatform(),
        isNative: Capacitor.isNativePlatform()
      }
    }
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CardSwipersLanding />
  </React.StrictMode>
);
