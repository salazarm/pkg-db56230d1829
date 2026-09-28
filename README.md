# Package tracker — encrypted event updates

The existing shipment, inventory, calendar, discovery and analytics views now use a replayable event layer rather than requiring regeneration of an encrypted HTML snapshot for every email.

## Status

GitHub write access and explicit publication consent were verified on September 28, 2026. The encrypted update app, Meta tab and encrypted key are deployed to GitHub Pages. The first batch contains 37 encrypted events, including verified carrier, desk, pickup and exact receipt updates. Email automation remains inactive pending live validation. Meta separates data dates, browser fetches, Gmail check completion and publication time.

## Design

- `archive.html`: byte-for-byte copy of the previous index, retaining the encrypted baseline and rollback path.
- `index.html`: existing views with separate data loading, encrypted update controls, delivery column and review panel.
- `discovery.json`: public product recommendations with prices, photo URLs and XXL availability, checked independently from email updates.
- `sync-analytics.js`: integrates verified new orders into financial totals and charts without duplicating baseline purchases; missing or conflicting totals and refunds remain in review.
- `sync-engine.js`: deterministic event projection, conservative parcel matching, duplicate protection, monotonic shipment status and inventory propagation.
- `meta-ui.js`: displays section freshness, browser refresh health, release version and recorded schedules. `sync/status.json` records service configuration; unavailable or unrecorded check times stay explicit.
- `remember-unlock.js`: optionally stores a non-exportable AES-GCM CryptoKey in IndexedDB on this browser. Lock deletes it. No password is stored.
- `sync-ui.js`: decrypts the baseline locally; generates RSA-OAEP 3072-bit keys on setup; encrypts the private key under the existing password-derived AES-GCM key; fetches and decrypts event envelopes.
- `sync/config.json`: produced by the setup control after deployment. Contains only a public key and encrypted private key. Never publish an unencrypted private key or password.
- `scripts/seal-event.cjs`: uses only the public key to encrypt private event input with a fresh AES-256-GCM key, then wraps that key with RSA-OAEP SHA-256. The opaque event ID is authenticated as GCM additional data.
- `sync/manifest.json`: ordered list of SHA-256 event IDs. Event IDs derive from Gmail message ID plus stable event key, not the extraction time.

The shared password is unchanged, but it is no longer saved in browser storage. Remember on this device is enabled by default at the user’s request. After a successful unlock it stores the non-exportable derived key in IndexedDB, allowing reloads to reopen the app. Unchecking it keeps the session in memory. Lock clears the remembered key. Anyone using that browser can open the app while it is remembered. Legacy plaintext password caches are removed on load. The page does not send email or access Gmail. The authorized Gmail/GitHub automation performs extraction and publishes encrypted envelopes.

## Complete activation

1. Publish the changed files, preserving `archive.html` exactly. Include no private input JSON.
2. Unlock the app at the existing URL and click **Set up encrypted updates**. The visible configuration contains only public/encrypted material. Commit it as `sync/config.json`; never inspect or extract the password.
3. Read and reconcile pending transaction emails. Write events to a private file outside this repository. Run `node scripts/seal-event.cjs /private/events.json`.
4. Commit new encrypted event files and the merged manifest atomically on current main. Retry against latest main on concurrent changes; never force-push or drop existing event IDs.
5. Refresh the app and verify matched shipment states, split shipments, new inventory, and review entries. Verify a browser reload decrypts the same data.
6. Only after that succeeds, create one Gmail message event automation following `EMAIL_SYNC.md`.

## Event schema

Each input needs `sourceMessageId`, `eventKey`, `type`, and ISO `occurredAt`. The writer generates `id`.

- `order`: `merchant`, `orderId`, `orderDate`, `items` with name, optional color/size/category/owner/unitPrice/url, quantity (1–50), optional verified `total`.
- `shipment`: `tracking` strongly preferred, merchant/orderId, status, optional shipDate, deliveredAt, arrivedAt, pickedUpAt, eta (exact date or null), estimateText. Without a unique match it becomes a review item. New tracking attaches to an unshipped order only when all item names/variants/quantities match.
- `financial`: verified receipt/refund amount, currency and kind. Purchase receipts matched to new orders update analytics; unmatched/conflicting totals and refunds remain in review.
- `review`: unresolved merchant/order/tracking and a concise note; changes no shipment.

Carrier delivery, building receipt, and resident pickup are distinct. An old message cannot regress status. Full split-shipment allocation, ambiguous refunds/cancellations, and uncertain totals are intentionally reviewed rather than guessed. Financial charts retain the original baseline and incorporate verified new orders exactly once. New receipt totals are allocated across categories and owners by item price (or quantity when prices are missing); rounding uses integer cents. Unverified order amounts, baseline corrections and refunds require review.

## Validation

`node --test tests/*.test.cjs`

Includes split shipments, replay, out-of-order status, ambiguous matches, USPS normalization, invalid input, browser-compatible encryption round-trip, envelope tampering and CLI deduplication. Core event/encryption tests and freshness regression checks pass. Live release validation includes the Meta tab, calendar notice, remembered unlock and Lock behavior.

## September 28 refresh

Nine public product recommendations were refreshed with price, image and XXL/2XL stock checks. Calendar distinguishes past ETAs from due-today dates and shows known carrier delivery dates. Thirty-seven encrypted email events are published with explicit user approval. Live private-data validation is pending before email automation activation.
