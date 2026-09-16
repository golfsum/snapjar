// Firebase setup. One place to touch when you paste in your real config.
//
// Get your config: Firebase console > Project settings > Your apps > Web app.
// Paste the object below and you're done, every page uses this file.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCozt3hTO1he8N1CeC01_ciRQGWbSxG9SM",
  authDomain: "snapjar-d8489.firebaseapp.com",
  projectId: "snapjar-d8489",
  storageBucket: "snapjar-d8489.firebasestorage.app",
  messagingSenderId: "797013092915",
  appId: "1:797013092915:web:0118a4c75f3c2bcaea9146",
  measurementId: "G-V22WH9DVT5"
};
 
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const FIRST_TOUCH_KEY = "snapjar_first_touch";
const LAST_TOUCH_KEY = "snapjar_last_touch";

function classifySource({ utmSource, referrer, gclid, fbclid }) {
  const source = String(utmSource || "").trim().toLowerCase();
  const ref = String(referrer || "").toLowerCase();
  if (source) return source;
  if (gclid) return "google_ads";
  if (fbclid) return "facebook_ads";
  if (ref.includes("reddit.com")) return "reddit";
  if (ref.includes("google.")) return "google_organic";
  if (ref.includes("bing.com")) return "bing_organic";
  if (ref.includes("facebook.com") || ref.includes("instagram.com")) return "meta_social";
  if (ref.includes("t.co") || ref.includes("twitter.com") || ref.includes("x.com")) return "x_social";
  if (ref) return "referral";
  return "direct";
}

function referringDomain(referrer) {
  try {
    return referrer ? new URL(referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildTouch() {
  const params = new URLSearchParams(location.search);
  const referrer = document.referrer || "";
  const touch = {
    source: "",
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || "",
    utmCampaign: params.get("utm_campaign") || "",
    utmTerm: params.get("utm_term") || "",
    utmContent: params.get("utm_content") || "",
    gclid: params.get("gclid") || "",
    fbclid: params.get("fbclid") || "",
    referrer,
    referringDomain: referringDomain(referrer),
    landingPage: location.pathname + location.search,
    capturedAt: new Date().toISOString()
  };
  touch.source = classifySource(touch);
  return touch;
}

function isSameOriginReferrer(referrer) {
  if (!referrer) return false;
  try {
    return new URL(referrer).origin === location.origin;
  } catch {
    return false;
  }
}

function hasCampaignSignal(touch) {
  return Boolean(
    touch.utmSource || touch.utmMedium || touch.utmCampaign || touch.utmTerm ||
    touch.utmContent || touch.gclid || touch.fbclid
  );
}

function captureAttribution() {
  const current = buildTouch();
  let first = readStored(FIRST_TOUCH_KEY);
  let last = readStored(LAST_TOUCH_KEY);

  try {
    if (!first) {
      first = current;
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(first));
    }

    // Only replace last touch with a meaningful acquisition touch. Internal
    // navigation to /create should not overwrite the external source that led
    // the visitor into SnapJar.
    const meaningful = hasCampaignSignal(current) ||
      (current.referrer && !isSameOriginReferrer(current.referrer)) ||
      (!last && current.source === "direct");

    if (meaningful) {
      last = current;
      localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(last));
    }
  } catch {
    // localStorage can be unavailable in hardened/private browser contexts.
  }

  return {
    firstTouch: first || current,
    lastTouch: last || first || current
  };
}

const attributionSnapshot = captureAttribution();

export function getFirstTouchAttribution() {
  return { ...attributionSnapshot.firstTouch };
}

export function getLastTouchAttribution() {
  return { ...attributionSnapshot.lastTouch };
}

export function getAttributionSnapshot() {
  return {
    firstTouch: { ...attributionSnapshot.firstTouch },
    lastTouch: { ...attributionSnapshot.lastTouch }
  };
}

// Sitewide analytics is loaded by /assets/site.js, including SEO pages.
// This wrapper keeps product modules decoupled from the analytics provider.
export function track(name, params) {
  try { window.snapjarTrack?.(name, params || {}); } catch { /* ignore */ }
}

// Everyone signs in anonymously behind the scenes. Guests never see a login.
// Resolves with the user once auth is ready.
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop();
        resolve(user);
      } else {
        signInAnonymously(auth).catch((err) => {
          stop();
          reject(err);
        });
      }
    });
  });
}
