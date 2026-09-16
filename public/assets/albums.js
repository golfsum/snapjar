// Customer dashboard. Hosted albums come from Firestore ownership.
// Joined albums are remembered per Firebase uid, never browser-wide.

import { auth, db, track } from "./firebase-init.js";
import { upgradeUrlFor } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, deleteDoc, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let rendered = false;

function scopedKey(base, uid) { return `${base}:${uid}`; }
function readList(key) { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeList(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ } }

function migrateCurrentSessionVisits(user) {
  const legacy = readList("snapjar_visited");
  if (!legacy.length) return;
  const signedInAt = Date.parse(user?.metadata?.lastSignInTime || user?.metadata?.creationTime || "") || Date.now();
  const safe = legacy.filter((item) => { const at = Date.parse(item?.at || ""); return Number.isFinite(at) && at >= signedInAt; });
  if (safe.length) {
    const key = scopedKey("snapjar_visited", user.uid);
    const current = readList(key);
    const merged = [...safe, ...current].filter((item, index, arr) => item?.code && arr.findIndex((x) => x.code === item.code) === index).slice(0, 30);
    writeList(key, merged);
  }
  try { localStorage.removeItem("snapjar_visited"); } catch { /* ignore */ }
}

onAuthStateChanged(auth, async (user) => {
  if (rendered) return;
  rendered = true;
  if (!user) { document.getElementById("signedout-state").style.display = "block"; return; }

  try {
    const previous = localStorage.getItem("snapjar_dashboard_uid");
    if (previous && previous !== user.uid) {
      localStorage.removeItem("snapjar_visited");
      localStorage.removeItem("snapjar_albums");
    }
    localStorage.setItem("snapjar_dashboard_uid", user.uid);
  } catch { /* ignore */ }

  migrateCurrentSessionVisits(user);
  const mine = [];
  try {
    const snap = await getDocs(query(collection(db, "events"), where("hostUid", "==", user.uid)));
    for (const d of snap.docs) mine.push({ code: d.id, ...d.data() });
  } catch (err) { console.error("cloud album list failed", err); }

  const joinedKey = scopedKey("snapjar_visited", user.uid);
  const joinedRaw = readList(joinedKey).filter((v) => v?.code && !mine.some((m) => m.code === v.code));
  const joined = await keepExisting(joinedRaw, user.uid, false);
  const owned = await keepExisting(mine, user.uid, true);
  writeList(joinedKey, joined.map(({ code, name, at }) => ({ code, name, at })));

  document.getElementById("hosted-count").textContent = owned.length;
  document.getElementById("joined-count").textContent = joined.length;
  document.getElementById("photo-count").textContent = owned.reduce((sum, album) => sum + (album.photoCount || 0), 0).toLocaleString();

  if (!owned.length && !joined.length) { document.getElementById("empty-state").style.display = "block"; return; }
  if (owned.length) renderSection("mine", owned, true);
  if (joined.length) renderSection("joined", joined, false);
});

async function keepExisting(list, uid, mustOwn) {
  const out = [];
  for (const a of list) {
    try {
      const snap = await getDoc(doc(db, "events", a.code));
      if (!snap.exists()) continue;
      const data = snap.data();
      const isOwner = data.hostUid === uid;
      if (mustOwn && !isOwner) continue;
      if (!mustOwn && isOwner) continue;
      out.push({ ...a, ...data, code: a.code, name: data.name || a.name });
    } catch { /* do not surface unverifiable albums */ }
  }
  return out;
}

function planLabel(album) {
  if (album.pro) return "Pro · videos up to 5 min";
  if (album.paid) return "Party · videos up to 1 min";
  return "Free · photos only";
}

function renderSection(prefix, list, isMine) {
  document.getElementById(`${prefix}-section`).style.display = "block";
  const container = document.getElementById(`${prefix}-list`);
  container.innerHTML = "";

  for (const album of list) {
    const card = document.createElement("div");
    card.className = "album-card";
    const top = document.createElement("div");
    top.className = "album-card-top";

    const name = document.createElement("a");
    name.className = "album-card-name";
    name.href = `/event?c=${encodeURIComponent(album.code)}`;
    name.textContent = album.name || album.code;

    const status = document.createElement("span");
    const photos = album.photoCount || 0;
    status.className = album.paid ? "tag tag-paid" : "tag tag-free";
    status.textContent = `${planLabel(album)} · ${photos}${album.paid ? " photos" : "/25 photos"}`;
    top.append(name, status);

    const allowance = document.createElement("p");
    allowance.style.cssText = "margin:8px 0 2px;color:var(--ink-soft);font-size:.86rem";
    allowance.textContent = album.pro
      ? "Video allowance: up to 5 minutes per clip (300 MB max)."
      : album.paid
        ? "Video allowance: up to 1 minute per clip (100 MB max)."
        : "Video uploads unlock with Party or Pro.";

    const actions = document.createElement("div");
    actions.className = "album-card-actions";
    const open = document.createElement("a"); open.className = "btn btn-small"; open.href = `/event?c=${encodeURIComponent(album.code)}`; open.textContent = "Open"; actions.appendChild(open);
    const qr = document.createElement("a"); qr.className = "btn btn-small btn-outline"; qr.href = `/event?c=${encodeURIComponent(album.code)}#share`; qr.textContent = "QR & share"; actions.appendChild(qr);

    if (!album.paid) {
      const upgrade = document.createElement("a");
      upgrade.className = "btn btn-small btn-outline";
      upgrade.href = upgradeUrlFor(album.code);
      upgrade.target = "_blank";
      upgrade.rel = "noopener";
      upgrade.textContent = isMine ? "Party + video, $19.99" : "Gift Party, $19.99";
      upgrade.addEventListener("click", () => track("upgrade_click", { album: album.code, from: "albums-page" }));
      actions.appendChild(upgrade);
    }

    if (isMine) {
      const del = document.createElement("button");
      del.className = "mini-btn mini-danger";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        const sure = confirm(`Delete "${album.name || album.code}" for everyone? Guests lose access immediately. This can't be undone.`);
        if (!sure) return;
        del.disabled = true;
        try {
          await deleteDoc(doc(db, "events", album.code));
          forgetScoped(album.code, auth.currentUser?.uid);
          card.remove();
          location.reload();
        } catch (err) {
          console.error(err);
          del.disabled = false;
          alert("Couldn't delete it just now. Try again in a minute.");
        }
      });
      actions.appendChild(del);
    }

    card.append(top, allowance, actions);
    container.appendChild(card);
  }
}

function forgetScoped(code, uid) {
  if (!uid) return;
  for (const base of ["snapjar_albums", "snapjar_visited"]) {
    const key = scopedKey(base, uid);
    const list = readList(key).filter((a) => a.code !== code);
    writeList(key, list);
  }
}
