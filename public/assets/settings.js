// Account settings. The important trick here is LINKING instead of plain
// sign-in when the visitor is currently anonymous: their anonymous uid owns
// the albums they made on this device, and linking upgrades that same uid
// into a real account, so nothing is lost.

import { auth, track } from "./firebase-init.js";
import {
  GoogleAuthProvider, signInWithPopup, linkWithPopup,
  EmailAuthProvider, linkWithCredential,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const signedoutView = document.getElementById("signedout-view");
const signedinView = document.getElementById("signedin-view");
const authError = document.getElementById("auth-error");
const deleteError = document.getElementById("delete-error");

// Linking an anonymous account does NOT fire onAuthStateChanged (the uid
// stays the same), so the sign-in handlers call this directly too.
function applyAuthUi() {
  const user = auth.currentUser;
  const hasAccount = user && !user.isAnonymous;
  signedoutView.style.display = hasAccount ? "none" : "block";
  signedinView.style.display = hasAccount ? "block" : "none";
  if (hasAccount) {
    document.getElementById("account-email").textContent =
      `Signed in as ${user.email || user.displayName || "your account"}`;
  }
}

onAuthStateChanged(auth, applyAuthUi);

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.add("show");
}

// ---------- Google ----------

document.getElementById("google-btn").addEventListener("click", async () => {
  authError.classList.remove("show");
  const provider = new GoogleAuthProvider();
  const current = auth.currentUser;

  try {
    if (current && current.isAnonymous) {
      // Upgrade the anonymous session in place, same uid, albums kept.
      await linkWithPopup(current, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
    track("account_signin", { method: "google" });
    applyAuthUi();
  } catch (err) {
    if (err.code === "auth/credential-already-in-use") {
      // They already have an account with this Google identity. Sign into it.
      // Albums made in this guest session stay with the old anonymous uid,
      // but this device's My Albums list still remembers them.
      try {
        await signInWithPopup(auth, provider);
        track("account_signin", { method: "google" });
        return;
      } catch (err2) {
        console.error(err2);
      }
    }
    console.error(err);
    if (err.code !== "auth/popup-closed-by-user") {
      showAuthError("Google sign-in didn't complete. Try again in a second.");
    }
  }
});

// ---------- Email ----------

document.getElementById("email-btn").addEventListener("click", async () => {
  authError.classList.remove("show");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !email.includes("@")) return showAuthError("Enter your email address.");
  if (password.length < 6) return showAuthError("Password needs at least 6 characters.");

  const current = auth.currentUser;

  try {
    if (current && current.isAnonymous) {
      // Try to attach this email to the current guest session first.
      const cred = EmailAuthProvider.credential(email, password);
      await linkWithCredential(current, cred);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    track("account_signin", { method: "email_new" });
    applyAuthUi();
  } catch (err) {
    if (err.code === "auth/email-already-in-use" || err.code === "auth/credential-already-in-use") {
      // Existing account: sign into it instead.
      try {
        await signInWithEmailAndPassword(auth, email, password);
        track("account_signin", { method: "email" });
        return;
      } catch (err2) {
        console.error(err2);
        return showAuthError("That email has an account but the password doesn't match.");
      }
    }
    console.error(err);
    showAuthError("Couldn't sign you in. Check the email and password and try again.");
  }
});

// ---------- Sign out / delete ----------

document.getElementById("signout-btn").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("delete-btn").addEventListener("click", async () => {
  deleteError.classList.remove("show");
  const sure = confirm(
    "Delete your account permanently? Your albums are NOT auto-deleted. This can't be undone."
  );
  if (!sure) return;

  try {
    await deleteUser(auth.currentUser);
    track("account_deleted");
    alert("Your account is deleted.");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/requires-recent-login") {
      deleteError.textContent =
        "For safety, deleting needs a fresh sign-in. Sign out, sign back in, then delete.";
    } else {
      deleteError.textContent = "Couldn't delete the account just now. Try again in a minute.";
    }
    deleteError.classList.add("show");
  }
});
