// One place for settings both pages share.

// The $19 Party upgrade. Album codes ride along as client_reference_id,
// so every payment in the Stripe dashboard says which album bought it.
export const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/8x2aEQfRgcP331bdEn2sM01";

// The $29 Pro upgrade (unlocks the Table QR Manager). Paste your $29 Stripe
// Payment Link here. Until then, Pro buttons fall back to the pricing page.
export const PRO_PAYMENT_LINK = "";
export const PRO_PRICE = 29;
export const PARTY_PRICE = 19;

// The only Google account the admin dashboard accepts. Must match the
// email in firestore.rules or the dashboard queries get denied.
export const ADMIN_EMAIL = "nd82soft@gmail.com";

export function upgradeUrlFor(code) {
  if (!STRIPE_PAYMENT_LINK) return "/#pricing";
  return `${STRIPE_PAYMENT_LINK}?client_reference_id=${encodeURIComponent(code)}`;
}

export function proUpgradeUrlFor(code) {
  if (!PRO_PAYMENT_LINK) return "/#pricing";
  return `${PRO_PAYMENT_LINK}?client_reference_id=${encodeURIComponent(code)}`;
}
