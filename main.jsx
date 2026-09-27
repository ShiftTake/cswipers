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

class StartupErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('CardSwipers render crash:', error, info?.componentStack);
    Sentry.captureException(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', background: '#0B0E14', color: '#fff', padding: '48px 20px', fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>CardSwipers hit a startup error</h1>
        <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 12, color: '#FCA5A5' }}>
          {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
        </pre>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '12px 18px', borderRadius: 12, background: '#E11D48', color: '#fff', fontWeight: 700, border: 0 }}>
          Reload
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      <CardSwipersLanding />
    </StartupErrorBoundary>
  </React.StrictMode>
);
