const { initAdmin } = require("./firebase");

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const PARTY_CENTS = 1999;
const PRO_CENTS = 2999;

function albumCodeFrom(session) {
  const raw = String(session.client_reference_id || "").trim().toUpperCase();
  return CODE_RE.test(raw) ? raw : "";
}

function isProSession(session) {
  const amount = Number(session.amount_total || 0);
  if (amount >= PRO_CENTS) return true;
  const link = String(session.payment_link || "");
  return link.includes("bJe3coeNc2ap7hreIr2sM02");
}

async function unlockAlbumFromSession(session) {
  if (!session || session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  const code = albumCodeFrom(session);
  if (!code) return { ok: false, reason: "no_album_code" };

  const admin = initAdmin();
  const ref = admin.firestore().doc(`events/${code}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "album_missing", code };

  const pro = isProSession(session);
  const patch = {
    paid: true,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    stripeSessionId: session.id || null,
    stripePaymentIntent: session.payment_intent || null
  };
  if (pro) patch.pro = true;
  await ref.update(patch);
  return { ok: true, code, pro };
}

module.exports = { unlockAlbumFromSession, albumCodeFrom, PARTY_CENTS, PRO_CENTS };
