const { stripeClient, paymentConfig } = require("./_lib/payments");
const { fulfillCheckout } = require("./_lib/unlock-album");

function rawBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel preserves the raw stream but exposes parsed JSON through a lazy
    // req.body getter. Never read that getter for signature verification.
    if (typeof req.on !== "function") return reject(new Error("Raw request stream required"));
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripe;
  try {
    if (!secret) throw new Error("webhook_secret_missing");
    stripe = stripeClient();
  } catch {
    res.status(503).json({ error: "Stripe webhook is not configured." });
    return;
  }

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  if (event.livemode !== paymentConfig().livemode) {
    res.status(400).json({ error: "Payment mode mismatch." });
    return;
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const result = await fulfillCheckout(event.data.object.id);
      if (!result.ok && !["not_paid", "unrelated_payment"].includes(result.reason)) {
        console.error("[stripe-webhook] fulfillment pending", {
          eventId: event.id, sessionId: event.data.object.id, ...result
        });
        // Keep unfulfilled purchases visible as failed deliveries so Stripe retries.
        res.status(503).json({ received: true, ...result });
        return;
      }
      res.status(200).json({ received: true, ...result });
      return;
    }
    res.status(200).json({ received: true, ignored: event.type });
  } catch (err) {
    console.error("[stripe-webhook] fulfillment failed", { eventId: event.id, code: err.code || "fulfillment_failed" });
    res.status(500).json({ error: "Unlock failed." });
  }
};

