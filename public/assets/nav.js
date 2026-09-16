// Shows account state in the nav. Signed-out users get Sign in.
// Signed-in users get Dashboard. The verified owner also gets a separate Admin link.

import { auth } from "./firebase-init.js";
import { isAdminUser } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const chip = document.getElementById("nav-account");

function syncAdminLink(show) {
  if (!chip) return;
  let admin = document.getElementById("nav-admin");
  if (!show) {
    if (admin) admin.remove();
    return;
  }
  if (!admin) {
    admin = document.createElement("a");
    admin.id = "nav-admin";
    admin.href = "/dashboard-q7x2m9";
    admin.textContent = "Admin";
    admin.title = "Snapjar admin dashboard";
    const links = chip.parentElement;
    const firstButton = links?.querySelector(".btn");
    if (firstButton) links.insertBefore(admin, firstButton);
    else links?.appendChild(admin);
  }
}

if (chip) {
  onAuthStateChanged(auth, (user) => {
    const admin = isAdminUser(user);
    syncAdminLink(admin);

    if (user && !user.isAnonymous) {
      chip.textContent = "Dashboard";
      chip.href = "/albums";
      chip.title = user.email || user.displayName || "Dashboard";
    } else {
      chip.textContent = "Sign in";
      chip.href = "/settings";
      chip.title = "";
    }
  });
}
