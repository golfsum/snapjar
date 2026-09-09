const { getDatabase } = require("./_lib/firebase");
const { paymentConfig, stripeClient } = require("./_lib/payments");
const { CODE_RE } = require("./_lib/unlock-album");
const { paymentPage } = require("./_lib/payment-page");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  const code = String(req.query?.c || "").trim().toUpperCase();
  const plan = req.query?.plan;
  if (!CODE_RE.test(code) || !["party", "pro"].includes(plan)) {
    return paymentPage(res, { status: 400, title: "Choose an album first", message: "Open your album and select its upgrade to continue." });
  }
  try {
    const config = paymentConfig();
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("webhook_secret_missing");
    const album = await getDatabase().doc(`events/${code}`).get();
    if (!album.exists) {
      return paymentPage(res, { status: 404, title: "Album not found", message: "Check your album link before purchasing an upgrade." });
    }
    if ((plan === "party" && album.data().paid) || (plan === "pro" && album.data().pro)) {
      return res.redirect(302, `/event?c=${code}`);
    }
    const link = await stripeClient().paymentLinks.retrieve(plan === "pro" ? config.proLink : config.partyLink);
    if (!link.active || link.livemode !== config.livemode) throw new Error("payment_link_unavailable");
    const url = new URL(link.url);
    if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com") throw new Error("invalid_payment_link");
    url.searchParams.set("client_reference_id", code);
    return res.redirect(302, url.toString());
  } catch (err) {
    console.error("[checkout] unavailable", { code: err.code || "checkout_unavailable" });
    return paymentPage(res, {
      status: 503, title: "Upgrades are temporarily unavailable",
      message: "Please try again shortly. You have not been sent to payment.",
      retryUrl: `/api/checkout?c=${code}&plan=${plan}`, albumCode: code
    });
  }
};
