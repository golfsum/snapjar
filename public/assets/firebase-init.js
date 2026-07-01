// Firebase setup. One place to touch when you paste in your real config.
//
// Get your config: Firebase console > Project settings > Your apps > Web app.
// Paste the object below and you're done, every page uses this file.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// TODO: replace with your project's config before deploying
const firebaseConfig = {
  apiKey: "AIzaSyCozt3hTO1he8N1CeC01_ciRQGWbSxG9SM",
  authDomain: "snapjar-d8489.firebaseapp.com",
  projectId: "snapjar-d8489",
  storageBucket: "snapjar-d8489.firebasestorage.app",
  messagingSenderId: "797013092915",
  appId: "1:797013092915:web:0118a4c75f3c2bcaea9146",
  measurementId: "G-WSPXVLKVL9"
};
 
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

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
