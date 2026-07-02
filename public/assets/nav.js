// Shows account state in the nav on app pages. Signed in: your email,
// linking to settings. Signed out or guest: a quiet Sign in link.

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const chip = document.getElementById("nav-account");

if (chip) {
  onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
      const label = user.email || user.displayName || "Account";
      chip.textContent = label.length > 22 ? label.slice(0, 20) + "..." : label;
      chip.title = label;
    } else {
      chip.textContent = "Sign in";
      chip.title = "";
    }
  });
}
