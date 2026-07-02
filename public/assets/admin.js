// Admin dashboard. Google sign-in gates it client-side for the UI,
// and firestore.rules gates it server-side for the data. The rules are
// the real lock; this page is just the handle.

import { auth, db } from "./firebase-init.js";
import { ADMIN_EMAIL } from "./config.js";
import {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, getDocs, doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PRICE = 19;

const gateView = document.getElementById("gate-view");
const loadingView = document.getElementById("loading-view");
const dashView = document.getElementById("dash-view");
const gateError = document.getElementById("gate-error");
const signoutBtn = document.getElementById("signout-btn");

let albums = [];

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    gateView.style.display = "none";
    signoutBtn.style.display = "inline-block";
    loadDashboard();
  } else {
    gateView.style.display = "block";
    dashView.style.display = "none";
    signoutBtn.style.display = "none";
  }
});

document.getElementById("signin-btn").addEventListener("click", async () => {
  gateError.classList.remove("show");
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    if (result.user.email !== ADMIN_EMAIL) {
      await signOut(auth);
      gateError.textContent = "That Google account isn't the admin.";
      gateError.classList.add("show");
    }
  } catch (err) {
    console.error(err);
    gateError.textContent = "Sign-in didn't complete. Is the Google provider enabled in Firebase?";
    gateError.classList.add("show");
  }
});

signoutBtn.addEventListener("click", () => signOut(auth));

async function loadDashboard() {
  loadingView.style.display = "block";
  try {
    const snap = await getDocs(
      query(collection(db, "events"), orderBy("createdAt", "desc"), limit(500))
    );
    albums = snap.docs.map((d) => ({ code: d.id, ...d.data() }));
    render();
    loadingView.style.display = "none";
    dashView.style.display = "block";
  } catch (err) {
    console.error(err);
    loadingView.style.display = "none";
    gateView.style.display = "block";
    gateError.textContent = "Couldn't load albums. Did you deploy the new firestore.rules?";
    gateError.classList.add("show");
  }
}

function render() {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const paidCount = albums.filter((a) => a.paid).length;
  const photoTotal = albums.reduce((sum, a) => sum + (a.photoCount || 0), 0);
  const weekCount = albums.filter((a) => toMillis(a.createdAt) > weekAgo).length;

  document.getElementById("stat-albums").textContent = albums.length;
  document.getElementById("stat-photos").textContent = photoTotal;
  document.getElementById("stat-paid").textContent = paidCount;
  document.getElementById("stat-revenue").textContent = "$" + paidCount * PRICE;
  document.getElementById("stat-week").textContent = weekCount;
  document.getElementById("dash-updated").textContent =
    "Live from Firestore, newest first. " + new Date().toLocaleString();

  const tbody = document.getElementById("album-rows");
  tbody.textContent = "";

  for (const a of albums) {
    const tr = document.createElement("tr");

    const name = document.createElement("td");
    const link = document.createElement("a");
    link.href = `event.html?c=${a.code}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = a.name || "(unnamed)";
    name.appendChild(link);
    if (a.hostName) {
      const host = document.createElement("div");
      host.className = "cell-sub";
      host.textContent = "host: " + a.hostName;
      name.appendChild(host);
    }

    const code = document.createElement("td");
    code.className = "cell-mono";
    code.textContent = a.code;

    const photos = document.createElement("td");
    photos.textContent = a.photoCount || 0;

    const created = document.createElement("td");
    created.textContent = formatDate(a.createdAt);

    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = a.paid ? "tag tag-paid" : "tag tag-free";
    badge.textContent = a.paid ? "Paid" : "Free";
    status.appendChild(badge);

    const actions = document.createElement("td");
    actions.className = "cell-actions";

    const payBtn = document.createElement("button");
    payBtn.className = "mini-btn";
    payBtn.textContent = a.paid ? "Mark free" : "Mark paid";
    payBtn.addEventListener("click", () => setPaid(a, !a.paid, payBtn));

    const delBtn = document.createElement("button");
    delBtn.className = "mini-btn mini-danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => removeAlbum(a, tr, delBtn));

    actions.append(payBtn, delBtn);
    tr.append(name, code, photos, created, status, actions);
    tbody.appendChild(tr);
  }
}

async function setPaid(album, paid, btn) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "events", album.code), { paid });
    album.paid = paid;
    render();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Update failed: " + (err.code || err.message));
  }
}

async function removeAlbum(album, row, btn) {
  const sure = confirm(`Delete "${album.name}" (${album.code})? Guests lose access immediately.`);
  if (!sure) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "events", album.code));
    albums = albums.filter((a) => a.code !== album.code);
    render();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Delete failed: " + (err.code || err.message));
  }
}

function toMillis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

function formatDate(ts) {
  const ms = toMillis(ts);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
