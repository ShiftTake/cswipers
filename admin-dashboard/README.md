# CardSwipers Admin Dashboard

Standalone React/Vite operations console. This project does not import code from the mobile app or the root React bundle.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in the Firebase web app values from the existing `cardswipers-6aa66` Firebase project.
3. Ensure your Firebase user document at `users/{uid}` contains `isAdmin: true`.
4. Run `npm install` and `npm run dev` from this directory.

The client-side gate checks `users/{uid}.isAdmin === true` after Firebase email/password authentication. Firestore rules must also grant that administrator access to the users, orders, and dispute data this console reads.

## Commands

```text
npm run dev
npm run build
npm run preview
```

The build output is local to `admin-dashboard/dist` and does not run the root app build or modify the mobile bundles.

## Views

- Executive Overview: GMV, net service revenue, orders, active users, escrow held, and monthly GMV chart.
- User Management: searchable users, verification/status indicators, and disable/enable action.
- Tax & 1099 Watchlist: annual gross volume and completed-sales threshold monitoring.
- Dispute Command Center: active disputes, evidence links, and refund/release override actions.
