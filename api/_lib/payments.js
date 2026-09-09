const Stripe = require("stripe");

function paymentConfig() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  const partyLink = process.env.STRIPE_PARTY_PAYMENT_LINK_ID || "";
  const proLink = process.env.STRIPE_PRO_PAYMENT_LINK_ID || "";
  if (!/^[sr]k_(live|test)_/.test(key) || !partyLink.startsWith("plink_") ||
      !proLink.startsWith("plink_") || partyLink === proLink) {
    throw new Error("payment_configuration_missing");
  }
  const livemode = /^[sr]k_live_/.test(key);
  if (process.env.VERCEL_ENV === "production" && !livemode) {
    throw new Error("production_requires_live_stripe");
  }
  return { key, partyLink, proLink, livemode };
}

function stripeClient() {
  return new Stripe(paymentConfig().key, { maxNetworkRetries: 2, timeout: 10000 });
}

function planFromSession(session) {
  const config = paymentConfig();
  if (session.livemode !== config.livemode || session.mode !== "payment") return null;
  const linkId = typeof session.payment_link === "string"
    ? session.payment_link : session.payment_link?.id;
  if (linkId === config.partyLink) return "party";
  if (linkId === config.proLink) return "pro";
  return null;
}

module.exports = { paymentConfig, stripeClient, planFromSession };
