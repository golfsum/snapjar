// Shows account state in the nav. Signed-out users get Sign in.
// Signed-in users get Dashboard. The verified owner also gets a separate Admin link.

import { auth } from "./firebase-init.js";
import { isAdminUser } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const chip = document.getElementById("nav-account");
const mobileQuery = window.matchMedia("(max-width: 640px)");

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
  admin.style.display = mobileQuery.matches ? "none" : "";
}

function syncSignOut(show) {
  if (!chip) return;
  let link = document.getElementById("nav-signout");
  if (!show) {
    if (link) link.remove();
    return;
  }
  if (!link) {
    link = document.createElement("a");
    link.id = "nav-signout";
    link.href = "#";
    link.textContent = "Sign out";
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await signOut(auth);
        location.href = "/";
      } catch (err) {
        console.error("sign out failed", err);
      }
    });
    const links = chip.parentElement;
    const firstButton = links?.querySelector(".btn");
    if (firstButton) links.insertBefore(link, firstButton);
    else links?.appendChild(link);
  }
  // The shared stylesheet hides non-button nav links on small screens. Force
  // Sign out back on so mobile users always have an obvious exit.
  link.style.display = mobileQuery.matches ? "inline-flex" : "none";
  link.style.alignItems = "center";
  link.style.whiteSpace = "nowrap";
}

function syncMobileLayout() {
  if (!chip) return;
  const links = chip.parentElement;
  if (links) {
    links.style.gap = mobileQuery.matches ? "12px" : "";
    links.style.flexWrap = "nowrap";
  }
  chip.style.display = "inline-flex";
  chip.style.alignItems = "center";
  chip.style.whiteSpace = "nowrap";
  const admin = document.getElementById("nav-admin");
  if (admin) admin.style.display = mobileQuery.matches ? "none" : "";
  const signout = document.getElementById("nav-signout");
  if (signout) signout.style.display = mobileQuery.matches ? "inline-flex" : "none";
}

if (chip) {
  onAuthStateChanged(auth, (user) => {
    const signedIn = !!(user && !user.isAnonymous);
    syncAdminLink(isAdminUser(user));
    syncSignOut(signedIn);

    if (signedIn) {
      chip.textContent = "Dashboard";
      chip.href = "/albums";
      chip.title = user.email || user.displayName || "Dashboard";
    } else {
      chip.textContent = "Sign in";
      chip.href = "/settings";
      chip.title = "";
    }
    syncMobileLayout();
  });

  mobileQuery.addEventListener?.("change", syncMobileLayout);
}
