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

const ATTRIBUTION_KEY = "snapjar_first_touch";

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

function captureFirstTouch() {
  try {
    const existing = localStorage.getItem(ATTRIBUTION_KEY);
    if (existing) return JSON.parse(existing);
    const params = new URLSearchParams(location.search);
    const attribution = {
      source: "",
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmTerm: params.get("utm_term") || "",
      utmContent: params.get("utm_content") || "",
      gclid: params.get("gclid") || "",
      fbclid: params.get("fbclid") || "",
      referrer: document.referrer || "",
      landingPage: location.pathname + location.search,
      capturedAt: new Date().toISOString()
    };
    attribution.source = classifySource(attribution);
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return {
      source: "unknown",
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      utmTerm: "",
      utmContent: "",
      gclid: "",
      fbclid: "",
      referrer: "",
      landingPage: location.pathname,
      capturedAt: new Date().toISOString()
    };
  }
}

const firstTouchAttribution = captureFirstTouch();

export function getFirstTouchAttribution() {
  return { ...firstTouchAttribution };
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
