// Album creation flow.

import { db, ensureSignedIn, track } from "./firebase-init.js";
import { upgradeUrlFor } from "./config.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("create-form");
const createBtn = document.getElementById("create-btn");
const errorEl = document.getElementById("create-error");

// No confusing characters. Nobody should have to guess if that's a 0 or an O
// while holding a drink.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) code += CODE_CHARS[b % CODE_CHARS.length];
  return code;
}

function albumUrl(code) {
  // Absolute path on purpose. Hosts like Vercel rewrite /create.html to
  // /create, and building relative to pathname breaks the QR link.
  return `${location.origin}/event.html?c=${code}`;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add("show");
}

function rememberAlbum(code, name) {
  const list = JSON.parse(localStorage.getItem("snapjar_albums") || "[]");
  list.unshift({ code, name, createdAt: new Date().toISOString() });
  localStorage.setItem("snapjar_albums", JSON.stringify(list.slice(0, 20)));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.remove("show");

  const eventName = document.getElementById("event-name").value.trim();
  const hostName = document.getElementById("host-name").value.trim();
  if (!eventName) return;

  createBtn.disabled = true;
  createBtn.textContent = "Setting things up...";

  try {
    const user = await ensureSignedIn();

    // Find a free code. Collisions are near impossible but cheap to check.
    let code = randomCode();
    for (let i = 0; i < 3; i++) {
      const existing = await getDoc(doc(db, "events", code));
      if (!existing.exists()) break;
      code = randomCode();
    }

    await setDoc(doc(db, "events", code), {
      name: eventName,
      hostName: hostName || null,
      hostUid: user.uid,
      paid: false,
      photoCount: 0,
      createdAt: serverTimestamp()
    });

    rememberAlbum(code, eventName);
    track("album_created", { album: code });
    showSuccess(code, eventName);
  } catch (err) {
    console.error(err);
    showError("Something went wrong on our end. Give it another try in a second.");
    createBtn.disabled = false;
    createBtn.textContent = "Create album";
  }
});

function showSuccess(code, eventName) {
  const url = albumUrl(code);

  document.getElementById("form-view").style.display = "none";
  document.getElementById("success-view").style.display = "block";

  document.getElementById("qr-caption").textContent = eventName;
  document.getElementById("share-link").value = url;
  document.getElementById("open-album-btn").href = `event.html?c=${code}`;

  const qr = document.getElementById("qr-img");
  qr.src = "https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=2&color=211c15&bgcolor=ffffff&data=" + encodeURIComponent(url);

  // Every printed table card quietly advertises the product
  document.getElementById("qr-domain").textContent = location.host;

  const upsell = document.getElementById("success-upgrade");
  upsell.href = upgradeUrlFor(code);
  upsell.addEventListener("click", () => track("upgrade_click", { album: code, from: "success-screen" }));

  window.scrollTo({ top: 0 });
}

document.getElementById("copy-btn").addEventListener("click", async () => {
  const input = document.getElementById("share-link");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  const btn = document.getElementById("copy-btn");
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

// Show albums this device already made, so hosts can get back in.
(function renderPastAlbums() {
  const list = JSON.parse(localStorage.getItem("snapjar_albums") || "[]");
  if (!list.length) return;

  const wrap = document.getElementById("past-events");
  const container = document.getElementById("past-events-list");
  wrap.style.display = "block";

  for (const album of list) {
    const a = document.createElement("a");
    a.href = `event.html?c=${album.code}`;
    const name = document.createElement("span");
    name.textContent = album.name;
    const chip = document.createElement("span");
    chip.className = "code-chip";
    chip.textContent = album.code;
    a.append(name, chip);
    container.appendChild(a);
  }
})();
