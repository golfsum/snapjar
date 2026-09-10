# Admin inspection

Sign in with the verified owner account at `/dashboard-q7x2m9`.
Album links open a read-only dialog. Direct `/event?c=...` visits with the same
verified account redirect to this dashboard before album reads, counter writes,
subscriptions, or guest initialization. Analytics on the event route waits for
persisted Firebase authentication and excludes this account.

The inspector uses only Firestore reads. It displays the newest 100 photos/videos
and 100 messages and identifies these limits. It does not create guest activity,
change counters, send notifications, or alter customer records. Infrastructure
access logs are unaffected. Existing historical counters are not rewritten.
Signed-out browsers cannot be identified as the admin and retain guest behavior.

The dashboard reads the newest 1,000 albums and 200 reports, with limits shown.
Plan value is estimated from entitlement flags, not verified Stripe revenue.
Customer changes are disabled until explicitly enabled for the current page
session. Preview mode blocks all mutation handlers regardless of checkbox state.

Validation: `npm test` runs payment regression and admin safety tests.
No database migration or Firestore/Storage rule deployment is required.
