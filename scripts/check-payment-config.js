const { paymentConfig } = require("../api/_lib/payments");
const { databaseSettings } = require("../api/_lib/firebase");

// Stop a production release from silently shipping without fulfillment again.
// Do not print credential values or parser errors that could contain secrets.
if (process.env.VERCEL_ENV === "production") {
  try {
    paymentConfig();
    if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) {
      throw new Error("missing_webhook_secret");
    }
    databaseSettings();
    console.log("Production payment configuration is present.");
  } catch {
    console.error("Production payment configuration is incomplete. See docs/payments.md for the required Stripe and Firebase settings.");
    process.exitCode = 1;
  }
} else {
  console.log("Production payment configuration check applies to production builds only.");
}
