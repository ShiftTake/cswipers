# Combined iOS MVP Release

Release branch: `ios-mvp1-no-payments`.

The combined app retains the poker Trade Night table, entry-binder checks and
vote-to-boot flow, adds binder management and club discovery/inbox features,
and keeps `ENABLE_PAYMENT_PIPELINE = false`.

## Deployment Scope

Firebase project: `cardswipers-6aa66`.

Deploy the additive integration functions only:

```sh
firebase deploy --project cardswipers-6aa66 --only functions:clubMembershipAction,functions:updateClubMemberRole,functions:onClubTradeNightStatus
```

Do not deploy shared Hosting from this branch: it would replace the
payment-enabled web application with the no-payments iOS build. Native club API
calls use direct Cloud Function URLs, so the new Hosting rewrites are not
required for iOS.

Shared Firestore rules are intentionally unchanged. Older app clients still
write memberships and roles directly. Moving all clients to the authenticated
membership APIs and tightening those shared permissions is a separate rollout.
The new API demotion guard does not protect legacy direct-write callers.

Trade Night discovery summaries are display hints, not authorization data.
The event trigger refreshes them after event writes; existing events are not
replayed automatically at deployment. Registration and table access use the
authoritative event and membership records.

## Mac Build

```sh
git fetch origin
git switch ios-mvp1-no-payments
git pull --ff-only origin ios-mvp1-no-payments
npm ci
npm test
npm run ios:sync
npx cap open ios
```

In Xcode, verify signing, build on a device, and test authenticated club joining,
member-role changes, binder persistence, registration, table rotation and boot
votes with separate accounts. Archive and upload through Xcode Organizer.
The Fastlane scripts in package.json are not usable until their missing
configuration is restored.

JavaScript checks and fixture browser tests do not certify a native archive or
live multi-user Firestore behavior. Payments are disabled in this app, not in
the shared backend. Do not advertise this release as native-production-verified
until the device checks and App Store/TestFlight processing complete.