# Automatic album upgrades

SnapJar uses its existing Stripe Payment Links. Each purchase upgrades one album,
identified by the Checkout Session's `client_reference_id`.

## Production setup

Set these variables on the **snapjar** Vercel project's **Production** environment:

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | A SnapJar live restricted API key with Checkout Sessions and Payment Links read access. Store as sensitive. |
| `STRIPE_WEBHOOK_SECRET` | The signing secret for the SnapJar live webhook endpoint below. Store as sensitive. |
| `STRIPE_PARTY_PAYMENT_LINK_ID` | The `plink_...` ID for `https://buy.stripe.com/8x2aEQfRgcP331bdEn2sM01`. |
| `STRIPE_PRO_PAYMENT_LINK_ID` | The `plink_...` ID for `https://buy.stripe.com/bJe3coeNc2ap7hreIr2sM02`. |
| `FIREBASE_PROJECT_ID` | `snapjar-d8489` |
| `FIREBASE_CLIENT_EMAIL` | `snapjar-payments@snapjar-d8489.iam.gserviceaccount.com` |
| `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` | `projects/797013092915/locations/global/workloadIdentityPools/snapjar-vercel/providers/vercel` |

Firebase production access uses Vercel OIDC and Google Workload Identity
Federation. No Google private key is stored in Vercel. The provider accepts only
the `golf-sum` team's `snapjar` production subject, with checks for the immutable
team and project IDs. The service account has the custom `snapjarAlbumPayments`
role: `datastore.databases.get`, `datastore.entities.get`, and
`datastore.entities.update`. It cannot create or delete documents.

`FIREBASE_SERVICE_ACCOUNT` JSON, or `FIREBASE_CLIENT_EMAIL` with
`FIREBASE_PRIVATE_KEY`, remains supported for existing non-Vercel installations.
Never put credentials in Git or client-side JavaScript. Preview testing must use
separate Stripe test credentials and a separate Firebase test project; production
federation deliberately rejects preview and development tokens.

In **SnapJar's live Stripe account**, configure an endpoint at:

`https://getsnapjar.com/api/stripe-webhook`

Subscribe to snapshot events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

The endpoint must use the live account's own events. Copy its signing secret to
`STRIPE_WEBHOOK_SECRET`. Set **both** Payment Links' after-payment behavior to
redirect to this exact URL, retaining the literal placeholder:

`https://getsnapjar.com/api/stripe-success?session_id={CHECKOUT_SESSION_ID}`

Redeploy after setting variables. Vercel applies environment changes to new
deployments. The production build refuses to continue without the required
settings. This checks configuration presence and formatting, not remote
Stripe permissions, webhook delivery, or Firestore write permissions.

## Fulfillment behavior

- Upgrade buttons pass through `/api/checkout`, which checks configuration,
  album existence, existing entitlement, and the live Payment Link before
  redirecting to Stripe with the album reference.
- The webhook verifies Stripe's signature against the unmodified request body,
  retrieves the Checkout Session from Stripe, and grants access only for paid,
  one-time sessions from the configured Party or Pro link in the correct mode.
- The plan comes from the Payment Link ID, so discounts or tax cannot turn Party
  into Pro or Pro into Party.
- A Firestore transaction preserves Pro access and the initial paid timestamp.
  Retries do not repeatedly update the album, and an older Party payment cannot
  replace a later Pro payment reference.
- Pending payments wait for `checkout.session.async_payment_succeeded`.
- Missing album references or albums produce a failed webhook response so Stripe
  retries and the failed delivery remains visible for reconciliation.
- The return page runs the same fulfillment function, then shows success only
  after a successful database update. Failures show a retry/support page instead
  of a false celebration.

## Verification and recovery

Run `npm test` for handler regression tests. These use real Stripe signature
verification with simulated Stripe API responses and an in-memory transactional
Firestore substitute. They do **not** verify live credentials or Firestore IAM.

Before calling production fixed:

1. Verify both live Payment Link IDs, prices, and return URLs in Stripe.
2. Verify the webhook is enabled and subscribed to both required event types.
3. Complete a sandbox Checkout against a separate test album/database and verify
   the album is upgraded even without opening the return page.
4. Verify a signed live delivery in Stripe shows a 2xx response and its intended
   album has `paid: true`, plus `pro: true` for Pro. A legitimate existing purchase
   can be replayed to verify this without charging the customer again.
5. Repeat delivery and check that Pro access and the original paid timestamp are
   unchanged. Open the real session's return URL and confirm it returns to the
   correct upgraded album.

For an existing paid purchase, inspect its Checkout Session's
`client_reference_id`; do not infer the album solely from the customer's name or
email. Once linked, resend its event from Stripe Workbench. If its reference is
missing, reconcile it manually before retrying; do not invent a reference based
only on price. A manual Pro upgrade is preserved when a Party payment is replayed.

Payment Links opened directly outside SnapJar can bypass the pre-check. Keep the
webhook configured and monitor failed deliveries in Stripe Workbench.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment),
[Payment Link return behavior](https://docs.stripe.com/payment-links/post-payment),
[Vercel Google Cloud federation](https://vercel.com/docs/oidc/gcp).
