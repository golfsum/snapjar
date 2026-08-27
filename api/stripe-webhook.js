const Stripe = require("stripe");
const { unlockAlbumFromSession } = require("./_lib/unlock-album");

function rawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    res.status(503).json({ error: "Stripe webhook is not configured." });
    return;
  }

  let event;
  try {
    const stripe = new Stripe(key);
    const sig = req.headers["stripe-signature"];
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const result = await unlockAlbumFromSession(event.data.object);
      res.status(200).json({ received: true, ...result });
      return;
    }
    res.status(200).json({ received: true, ignored: event.type });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    res.status(500).json({ error: "Unlock failed." });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
