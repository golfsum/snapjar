// Shows account state in the nav. Signed-out users get Sign in.
// Signed-in customers get My albums. The verified owner gets Admin HQ.

import { auth } from "./firebase-init.js";
import { isAdminUser } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const chip = document.getElementById("nav-account");

if (chip) {
  onAuthStateChanged(auth, (user) => {
    if (isAdminUser(user)) {
      chip.textContent = "Admin HQ";
      chip.href = "/dashboard-q7x2m9";
      chip.title = user.email || "Admin dashboard";
      return;
    }

    if (user && !user.isAnonymous) {
      chip.textContent = "My albums";
      chip.href = "/albums";
      chip.title = user.email || user.displayName || "My albums";
    } else {
      chip.textContent = "Sign in";
      chip.href = "/settings";
      chip.title = "";
    }
  });
}
