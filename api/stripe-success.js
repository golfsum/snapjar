const Stripe = require("stripe");
const { unlockAlbumFromSession, albumCodeFrom } = require("./_lib/unlock-album");

module.exports = async (req, res) => {
  const sessionId = String((req.query && req.query.session_id) || "").trim();
  if (!sessionId.startsWith("cs_")) {
    res.redirect(302, "/");
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid") {
      await unlockAlbumFromSession(session).catch((err) => {
        console.error("[stripe-success] unlock", err);
      });
    }
    const code = albumCodeFrom(session);
    if (code) {
      res.redirect(302, `/event?c=${encodeURIComponent(code)}&unlocked=1`);
      return;
    }
  } catch (err) {
    console.error("[stripe-success]", err);
  }
  res.redirect(302, "/");
};
