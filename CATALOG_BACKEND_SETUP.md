# Catalog and transaction backend

## Collections

- `masterCards/{masterCardId}` is the canonical catalog record: `set_name`, `card_number`, `rarity`, `release_year`, and `canonical_image_url`.
- `listings/{listingId}` is seller inventory: `seller_id`, `master_card_id`, `condition`, `grade_psa`, `price`, and `status`.
- `Transactions/{stripeEventId}` is an append-only payment ledger record. Client writes are denied by Firestore rules.
- `notifications/{notificationId}` is created by the Stripe webhook after successful payment.

Listing creation uses `POST /api/listings/create` with a Firebase ID token and a `master_card` object. The endpoint creates the canonical card and listing in one batch. It also writes a temporary `cards` projection for the existing feed; the projection includes `master_card_id` and `listing_id` and can be removed after all readers use `listings`.

## Search indexing

`functions/searchService.js` supports `typesense`, `algolia`, and `elasticsearch`. Set `SEARCH_PROVIDER` plus the provider-specific variables before deploying. Listing writes trigger `indexListingOnWrite` asynchronously, so the primary Firestore/API response does not wait for the external cluster.

## Stripe fulfillment

Set the Firebase secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then configure Stripe to send `payment_intent.succeeded` events to `/api/webhooks/stripe`. The handler uses the event ID as the ledger key, marks the listing sold, marks the order paid, and dispatches buyer/seller notifications. Replayed events do not duplicate fulfillment.

## Rate limiting

Creation and transaction endpoints use IP and Firebase UID token buckets in `functions/rateLimiter.js`:

- Listing create/delete: 12 requests per bucket, refilling at 0.1 requests/second.
- Checkout: 5 requests per bucket, refilling at 1 request/30 seconds.

The limiter is intentionally lightweight and process-local. For multi-region or high-volume production traffic, move bucket state to a shared store such as Redis or a Firestore-backed counter service.
