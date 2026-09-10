// One place for settings both pages share.

// The $19.99 Party upgrade. Album codes ride along as client_reference_id,
// so every payment in the Stripe dashboard says which album bought it.
export const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/8x2aEQfRgcP331bdEn2sM01";

// The $29.99 Pro upgrade (unlocks the Table QR Manager).
export const PRO_PAYMENT_LINK = "https://buy.stripe.com/bJe3coeNc2ap7hreIr2sM02";
export const PRO_PRICE = 29.99;
export const PARTY_PRICE = 19.99;

// Public contact and support. Keep this as the only address on the site.
export const SUPPORT_EMAIL = "support@getsnapjar.com";

// The only Google account the admin dashboard accepts. Must match the
// email in firestore.rules or the dashboard queries get denied.
export const ADMIN_EMAIL = "nd82soft@gmail.com";

export function upgradeUrlFor(code) {
  return `/api/checkout?c=${encodeURIComponent(code)}&plan=party`;
}

export function proUpgradeUrlFor(code) {
  return `/api/checkout?c=${encodeURIComponent(code)}&plan=pro`;
}

// Match the verified-email requirement in Firestore rules.
export function isAdminUser(user) {
  return !!user && user.email === ADMIN_EMAIL && user.emailVerified === true;
}
