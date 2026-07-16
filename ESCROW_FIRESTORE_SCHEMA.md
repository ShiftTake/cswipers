# Escrow Firestore Schema

This project uses Firestore documents instead of SQL tables.

## Collection: `orders`

Each order document uses `order_id` as the document ID and stores:

- `seller_id`: Stripe connected account ID (`acct_...`)
- `seller_user_id`: Firebase UID of the seller
- `seller_name`: Seller display name/email fallback
- `buyer_id`: Firebase UID of the buyer
- `buyer_email`: Buyer email
- `buyer_name`: Buyer display name/email fallback
- `amount_base`: Base item price in cents
- `amount_charged`: Buyer charge amount in cents (`amount_base * 1.02`)
- `currency`: ISO currency code
- `stripe_payment_intent_id`: Stripe PaymentIntent ID
- `stripe_transfer_id`: Stripe Transfer ID, null until payout
- `transfer_group`: Shared Stripe transfer group string
- `status`: `pending_payment | payment_held | shipped | delivered | completed | disputed | refunded`
- `tracking_number`: Carrier tracking number
- `carrier`: USPS / UPS / FedEx / etc.
- `tracking_url`: Carrier tracking URL if available
- `shipping_api_tracker_id`: Shippo tracker ID
- `buyer_shipping_address`: Object containing shipping address data
- `buyer_shipping_zip`: Postal code for shipping validation
- `dispute_reason`: Freeform text, nullable
- `dispute_timer_expires_at`: Firestore timestamp for 48-hour inspection deadline
- `funds_released_at`: Firestore timestamp for seller payout
- `delivered_at`: Firestore timestamp when carrier confirms delivery
- `refunded_at`: Firestore timestamp when admin refunds buyer
- `tos_accepted`: Boolean
- `tos_accepted_at`: Firestore timestamp
- `tos_version_accepted`: String such as `v1.1`
- `created_at`: Firestore timestamp
- `updated_at`: Firestore timestamp

## Collection: `users`

The user profile document stores:

- `tos_accepted`: Boolean, default false until registration consent is captured
- `tos_accepted_at`: Firestore timestamp, nullable
- `tos_version_accepted`: String, nullable

Recommended companion fields already used by the app:

- `verificationStatus`
- `buyerVerificationStatus`
- `sellerVerificationStatus`
- `stripeConnectedAccountId` or `connectedAccountId`
- `shippingZip` / `postalCode`

## Legacy Mirror: `purchaseIntents`

The backend mirrors authoritative order data into `purchaseIntents` so the current React screens continue to render escrow state without a wholesale collection migration.