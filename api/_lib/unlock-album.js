const { getDatabase, FieldValue } = require("./firebase");
const { planFromSession, stripeClient } = require("./payments");

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function albumCodeFrom(session) {
  const raw = String(session.client_reference_id || "").trim().toUpperCase();
  return CODE_RE.test(raw) ? raw : "";
}

async function unlockAlbumFromSession(session) {
  if (!session || session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  const plan = planFromSession(session);
  if (!plan) return { ok: false, reason: "unrelated_payment" };
  const code = albumCodeFrom(session);
  if (!code) return { ok: false, reason: "no_album_code" };

  const db = getDatabase();
  const ref = db.doc(`events/${code}`);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { ok: false, reason: "album_missing", code };
    const album = snap.data();
    const pro = plan === "pro";
    const changesAccess = !album.paid || (pro && !album.pro);
    const patch = {};
    if (!album.paid) patch.paid = true;
    if (pro && !album.pro) patch.pro = true;
    if (!album.paidAt) patch.paidAt = FieldValue.serverTimestamp();
    // Older retries must not overwrite a later Pro payment or downgrade an
    // upgrade made in the admin dashboard.
    if (changesAccess || !album.stripeSessionId) {
      patch.stripeSessionId = session.id;
      patch.stripePaymentIntent = typeof session.payment_intent === "string"
        ? session.payment_intent : session.payment_intent?.id || null;
    }
    if (Object.keys(patch).length) transaction.update(ref, patch);
    return { ok: true, code, pro: pro || !!album.pro };
  });
}

async function fulfillCheckout(sessionId) {
  const session = await stripeClient().checkout.sessions.retrieve(sessionId);
  return unlockAlbumFromSession(session);
}

module.exports = { unlockAlbumFromSession, albumCodeFrom, fulfillCheckout, CODE_RE };
