// The album page. Guests land here from the QR code.

import { db, storage, ensureSignedIn } from "./firebase-init.js";
import {
  doc, getDoc, updateDoc, increment, deleteDoc,
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { upgradeUrlFor } from "./config.js";
import { track } from "./firebase-init.js";

const FREE_PHOTO_LIMIT = 25;

const code = new URLSearchParams(location.search).get("c");

const loadingState = document.getElementById("loading-state");
const missingState = document.getElementById("missing-state");
const albumView = document.getElementById("album-view");
const gallery = document.getElementById("gallery");
const emptyGallery = document.getElementById("empty-gallery");
const uploadStatus = document.getElementById("upload-status");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const guestNameInput = document.getElementById("guest-name");
const limitNote = document.getElementById("limit-note");

let eventData = null;
let currentUser = null;
let isHost = false;
let photoCache = new Map();

guestNameInput.value = localStorage.getItem("snapjar_guest_name") || "";
guestNameInput.addEventListener("change", () => {
  localStorage.setItem("snapjar_guest_name", guestNameInput.value.trim());
});

init();

async function init() {
  if (!code) return showMissing();

  try {
    currentUser = await ensureSignedIn();
    const snap = await getDoc(doc(db, "events", code));
    if (!snap.exists()) return showMissing();

    eventData = snap.data();
    isHost = eventData.hostUid === currentUser.uid;

    // A sign can carry a table label (?t=Table 17). Photos scanned from that
    // sign are tagged with it by default; guests can still rename in Settings.
    const tableLabel = new URLSearchParams(location.search).get("t");
    if (tableLabel) {
      const clean = tableLabel.slice(0, 30);
      guestNameInput.value = clean;
      try { localStorage.setItem("snapjar_guest_name", clean); } catch { /* ignore */ }
    }

    document.title = `${eventData.name} · Snapjar`;
    document.getElementById("event-title").textContent = eventData.name;
    document.getElementById("album-sub").textContent =
      `${formatAlbumDate(eventData.createdAt)} · Private Album`;
    updateHero();
    updateUserChips();
    setupRail();

    rememberVisit(code, eventData.name);
    countScanIfQr();
    countView();

    loadingState.style.display = "none";
    albumView.style.display = "grid";

    setupTabs();
    setupSettingsTab();
    if (isHost) {
      const pencil = document.getElementById("rename-pencil");
      pencil.hidden = false;
      pencil.addEventListener("click", doRename);
    }
    if (location.hash === "#share") openShare();

    watchPhotos();
    watchMessages();
  } catch (err) {
    console.error(err);
    showMissing();
  }
}

function showMissing() {
  loadingState.style.display = "none";
  missingState.style.display = "block";
}

// Albums you open show up on the My Albums page, so guests and hosts on a
// second device can always find their way back.
function rememberVisit(albumCode, name) {
  try {
    const list = JSON.parse(localStorage.getItem("snapjar_visited") || "[]")
      .filter((v) => v.code !== albumCode);
    list.unshift({ code: albumCode, name, at: new Date().toISOString() });
    localStorage.setItem("snapjar_visited", JSON.stringify(list.slice(0, 20)));
  } catch { /* private browsing, fine */ }
}

// The QR code encodes ...&s=qr, so a scan is distinguishable from a shared
// link. Count it once, then strip the marker so a reload doesn't recount.
function countScanIfQr() {
  const params = new URLSearchParams(location.search);
  if (params.get("s") !== "qr") return;
  updateDoc(doc(db, "events", code), { scanCount: increment(1) }).catch(() => {});
  track("qr_scan", { album: code });
  params.delete("s");
  const clean = `${location.pathname}?${params.toString()}`.replace(/\?$/, "");
  history.replaceState(null, "", clean + location.hash);
}

// Fire-and-forget download tally for the dashboard.
function bumpDownloads(n) {
  if (!n) return;
  updateDoc(doc(db, "events", code), { downloadCount: increment(n) }).catch(() => {});
}

// Count a view once per browser session (so a reload isn't a new view).
function countView() {
  try {
    const key = "snapjar_viewed_" + code;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* ignore */ }
  updateDoc(doc(db, "events", code), { viewCount: increment(1) }).catch(() => {});
  eventData.viewCount = (eventData.viewCount || 0) + 1;
}

function formatAlbumDate(ts) {
  const ms = tsMillis(ts);
  if (!ms) return "New album";
  return new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function updateUserChips() {
  const signedIn = currentUser && !currentUser.isAnonymous;
  const name = signedIn ? (currentUser.displayName || (currentUser.email || "").split("@")[0] || "You") : "Guest";
  const mail = signedIn ? currentUser.email : "Not signed in";
  const initial = name.trim()[0].toUpperCase();
  for (const id of ["user-av-side", "user-av-top"]) { const el = document.getElementById(id); if (el) el.textContent = initial; }
  for (const id of ["user-name-side", "user-name-top"]) { const el = document.getElementById(id); if (el) el.textContent = name; }
  const mailEl = document.getElementById("user-mail-side"); if (mailEl) mailEl.textContent = mail;
}

function atFreeLimit() {
  return !eventData.paid && (eventData.photoCount || 0) >= FREE_PHOTO_LIMIT;
}

function refreshLimitUi() {
  limitNote.style.display = atFreeLimit() ? "block" : "none";
  document.getElementById("upgrade-link").href = upgradeUrlFor(code);

  // Banner nudge for guests on an unpaid album (it's the <a> itself now).
  const guestBanner = document.getElementById("guest-upgrade");
  guestBanner.style.display = !isHost && !eventData.paid ? "block" : "none";
  guestBanner.href = upgradeUrlFor(code);

  // The Settings tab holds the host's upgrade action and the paid badge.
  const setUpgrade = document.getElementById("set-upgrade");
  const setPaid = document.getElementById("set-paid");
  setUpgrade.href = upgradeUrlFor(code);
  setUpgrade.hidden = eventData.paid;
  setPaid.hidden = !eventData.paid;

  document.getElementById("st-upgrade").href = eventData.paid ? "/albums" : upgradeUrlFor(code);
}

// ---------- favorites (local, per device) ----------

const favKey = "snapjar_fav_" + code;
let favorites = new Set(JSON.parse(localStorage.getItem(favKey) || "[]"));

function isFav(id) { return favorites.has(id); }
function toggleFav(id) {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  localStorage.setItem(favKey, JSON.stringify([...favorites]));
  updateChipCounts();
  renderGallery();
}

// ---------- chip counts ----------

function countFor(filter) {
  let n = 0;
  for (const [id, d] of photoCache) { if (photoPasses(filter, id, d)) n++; }
  return n;
}

function updateChipCounts() {
  const labels = { all: "All", photos: "Photos", videos: "Videos", favorites: "Favorites", mine: "Mine" };
  for (const chip of document.querySelectorAll(".chip")) {
    const f = chip.dataset.filter;
    chip.textContent = `${labels[f]} (${countFor(f)})`;
  }
}

// ---------- stats + contributors (rail and analytics tab) ----------

function statCells() {
  const photos = photoCache.size || eventData.photoCount || 0;
  const mb = photos * 0.35;
  const storage = mb < 1000 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
  return [
    { ico: "&#128065;", num: (eventData.viewCount || 0).toLocaleString(), lbl: "Total Views" },
    { ico: "&#128247;", num: photos, lbl: "Photos" },
    { ico: "&#128101;", num: guestCount(), lbl: "Guests" },
    { ico: "&#128190;", num: storage, lbl: "Storage" }
  ];
}

function renderStats() {
  const html = statCells().map((c) =>
    `<div class="stat-cell"><span class="sc-ico">${c.ico}</span><span><span class="sc-num">${c.num}</span><span class="sc-lbl">${c.lbl}</span></span></div>`).join("");
  for (const id of ["rail-stats", "an-stats"]) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
}

function contributorRows() {
  const map = new Map();
  for (const d of photoCache.values()) {
    const key = d.uploaderName || "";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function renderContributors() {
  const rows = contributorRows();
  const html = rows.length ? rows.map(([name, n], i) => {
    const label = name || "No name given";
    const crown = i === 0 ? " &#128081;" : "";
    return `<div class="contrib-row"><span class="cav">${(name ? name.trim()[0] : "?").toUpperCase()}</span>` +
      `<span class="cmain"><span class="cname">${escapeMoment(label)}${crown}</span><span class="csub">${n} photo${n === 1 ? "" : "s"}</span></span></div>`;
  }).join("") : `<div class="empty-line" style="color:var(--faint);padding:10px 2px">No contributors yet.</div>`;
  for (const id of ["rail-contrib", "an-contrib"]) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
}

// ---------- share rail ----------

function setupRail() {
  const url = `${location.origin}/event?c=${code}`;
  document.getElementById("rail-qr").src =
    "https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=1&color=101828&bgcolor=ffffff&data=" +
    encodeURIComponent(url + "&s=qr");
  document.getElementById("rail-link").value = url;
  document.getElementById("rail-copy").addEventListener("click", () => copyText(url, "rail-copy"));
  document.getElementById("rail-sharelink").addEventListener("click", () => nativeShare(url));
  document.getElementById("rail-download-qr").addEventListener("click", downloadQr);
  document.getElementById("rail-print").addEventListener("click", () => { location.href = `/design?c=${code}`; });
  document.getElementById("rail-viewall").addEventListener("click", () => switchTab("guests"));
  document.getElementById("lm-viewall").addEventListener("click", () => switchTab("guests"));
}

async function copyText(text, btnId) {
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  const b = document.getElementById(btnId);
  const old = b.textContent; b.textContent = "Copied!";
  setTimeout(() => (b.textContent = old), 1500);
}

async function nativeShare(url) {
  if (navigator.share) { try { await navigator.share({ title: eventData.name, url }); } catch { /* cancelled */ } }
  else copyText(url, "rail-sharelink");
}

function downloadQr() {
  const a = document.createElement("a");
  a.href = document.getElementById("rail-qr").src;
  a.download = `${safeName(eventData.name)}-qr.png`;
  a.target = "_blank";
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- live gallery ----------

function watchPhotos() {
  const q = query(collection(db, "events", code, "photos"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === "added" || change.type === "modified") {
        photoCache.set(change.doc.id, change.doc.data({ serverTimestamps: "estimate" }));
      }
      if (change.type === "removed") photoCache.delete(change.doc.id);
    }
    renderGallery();
    renderMoments();
    renderGuests();
    updateHero();
    updateChipCounts();
    renderStats();
    renderContributors();
    emptyGallery.style.display = "none"; // filter/empty handled inside renderGallery
    // Keep the local count roughly in sync for the limit check
    eventData.photoCount = snap.size;
    refreshLimitUi();
  });
}

// Distinct contributors (named + one bucket for the unnamed).
function guestCount() {
  const names = new Set();
  let hasUnnamed = false;
  for (const d of photoCache.values()) {
    if (d.uploaderName) names.add(d.uploaderName); else hasUnnamed = true;
  }
  return names.size + (hasUnnamed ? 1 : 0);
}

// Album header: cover image, "N Photos / N Guests / N Views", avatar stack.
function updateHero() {
  const photos = photoCache.size || eventData.photoCount || 0;
  const guests = guestCount();
  const views = eventData.viewCount || 0;
  let firstUrl = null;
  for (const d of photoCache.values()) { firstUrl = d.url; break; }

  document.getElementById("event-meta").innerHTML =
    `<span class="ahead-stat">&#128247; <b>${photos}</b> Photo${photos === 1 ? "" : "s"}</span>` +
    `<span class="ahead-stat">&#128101; <b>${guests}</b> Guest${guests === 1 ? "" : "s"}</span>` +
    `<span class="ahead-stat">&#128065; <b>${views.toLocaleString()}</b> View${views === 1 ? "" : "s"}</span>`;

  const av = document.getElementById("hero-avatar");
  if (firstUrl) { av.style.backgroundImage = `url("${firstUrl}")`; av.textContent = ""; }
  else { av.style.backgroundImage = ""; av.textContent = (eventData.name || "?").trim()[0].toUpperCase(); }

  renderAvatarStack();
  updateStorage(photos);
}

function renderAvatarStack() {
  const stack = document.getElementById("astack");
  if (!stack) return;
  const urls = [];
  const seen = new Set();
  for (const d of photoCache.values()) {
    const k = d.uploaderName || d.uploaderUid;
    if (seen.has(k)) continue;
    seen.add(k);
    urls.push(d.url);
    if (urls.length >= 3) break;
  }
  const total = guestCount();
  stack.innerHTML = urls.map((u) => `<span class="sa" style="background-image:url('${u}')"></span>`).join("") +
    (total > urls.length ? `<span class="sa more">+${total - urls.length}</span>` : "");
}

function updateStorage(photos) {
  const mb = photos * 0.35;
  const numEl = document.getElementById("storage-num");
  const barEl = document.getElementById("storage-bar");
  const pctEl = document.getElementById("storage-pct");
  if (!numEl) return;
  const shown = mb < 1000 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
  numEl.innerHTML = `${shown} <small>of 50 GB</small>`;
  const pct = Math.min(100, (mb / 1024 / 50) * 100);
  barEl.style.width = pct.toFixed(1) + "%";
  pctEl.textContent = Math.max(1, Math.round(pct)) + "%";
}

// ---------- live moments ----------

function relTime(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

// Builds a short activity feed by grouping recent uploads into "moments":
// same person, uploads close together, become one line.
function renderMoments() {
  const strip = document.getElementById("live-moments");
  const list = document.getElementById("lm-list");

  const photos = [...photoCache.values()]
    .map((d) => ({ name: d.uploaderName || null, ts: tsMillis(d.createdAt), url: d.url }))
    .filter((p) => p.ts)
    .sort((a, b) => b.ts - a.ts);

  if (!photos.length) { strip.style.display = "none"; return; }

  const moments = [];
  for (const p of photos) {
    const last = moments[moments.length - 1];
    if (last && last.name === p.name && last.ts - p.ts < 10 * 60 * 1000) {
      last.count++;
      last.thumbs.push(p.url);
    } else {
      moments.push({ name: p.name, count: 1, ts: p.ts, thumbs: [p.url] });
    }
    if (moments.length >= 4) break;
  }

  list.textContent = "";
  for (const m of moments.slice(0, 3)) {
    const who = m.name || "A guest";
    const what = m.count === 1 ? "added a photo" : `added ${m.count} photos`;
    const row = document.createElement("div");
    row.className = "lm-item";
    const av = document.createElement("span");
    av.className = "lm-av";
    if (m.thumbs[0]) av.style.backgroundImage = `url("${m.thumbs[0]}")`;
    else av.textContent = (m.name ? m.name.trim()[0] : "?").toUpperCase();
    const txt = document.createElement("span");
    txt.className = "lm-txt";
    txt.innerHTML = `<strong>${escapeMoment(who)}</strong> ${what}<span class="lm-time">${relTime(m.ts)}</span>`;
    row.append(av, txt);
    if (m.thumbs.length > 1) {
      const thumbs = document.createElement("span");
      thumbs.className = "lm-thumbs";
      thumbs.innerHTML = m.thumbs.slice(0, 3).map((u) => `<img src="${u}" loading="lazy" alt="">`).join("");
      row.append(thumbs);
    }
    list.appendChild(row);
  }
  strip.style.display = "block";
}

function escapeMoment(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Keep the "12 sec ago" labels honest without a re-fetch.
setInterval(() => { if (photoCache.size) renderMoments(); }, 30000);

function tsMillis(t) {
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

let activeFilter = "all";
let sortOrder = "new";
let searchTerm = "";

// One source of truth for whether a photo shows under a given filter.
function photoPasses(filter, id, data) {
  if (filter === "videos") return data.type === "video";
  if (filter === "photos") return data.type !== "video";
  if (filter === "favorites") return favorites.has(id);
  if (filter === "guest") return (data.uploaderName || "") === (guestNameFilter || "");
  if (filter === "mine") return data.uploaderUid === currentUser.uid;
  if (filter === "today") {
    const ms = tsMillis(data.createdAt);
    if (!ms) return false;
    const d = new Date(ms), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  return true; // all, photos
}

function passesFilter(id, data) {
  if (!photoPasses(activeFilter, id, data)) return false;
  if (searchTerm) return (data.uploaderName || "").toLowerCase().includes(searchTerm);
  return true;
}

const EMPTY_STATES = {
  videos: "No videos yet. Video upload is coming soon.",
  favorites: "No favorites yet. Open a photo and tap the star to save it here.",
  mine: "You haven't added any photos yet.",
  today: "Nothing added today, yet.",
  guest: "No photos from this guest."
};

// Photos are grouped by who added them, newest activity on top,
// with the uploader's name labelled above their photos.
function renderGallery() {
  const groups = new Map();
  for (const [id, data] of photoCache) {
    if (!passesFilter(id, data)) continue;
    const key = data.uploaderName || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([id, data]);
  }

  const dir = sortOrder === "old" ? 1 : -1;
  const sorted = [...groups.entries()].map(([key, photos]) => {
    photos.sort((a, b) => dir * (tsMillis(b[1].createdAt) - tsMillis(a[1].createdAt)));
    return { key, photos, latest: tsMillis(photos[0][1].createdAt) };
  }).sort((a, b) => dir * (b.latest - a.latest));

  gallery.textContent = "";

  if (!sorted.length) {
    const box = document.createElement("div");
    box.className = "empty-pic";
    const msg = searchTerm ? "No photos match that name."
      : (EMPTY_STATES[activeFilter] || "No photos yet. Tap Add Photos to start the album.");
    box.innerHTML = `<div class="frame">&#128247;</div><p>${msg}</p>`;
    gallery.appendChild(box);
    document.getElementById("gallery-toolbar").style.display = photoCache.size ? "flex" : "none";
    refreshSelectUi();
    return;
  }

  for (const g of sorted) {
    const wrap = document.createElement("div");
    wrap.className = "gallery-group";

    const header = document.createElement("div");
    header.className = "group-header";

    const label = document.createElement("h3");
    label.className = "group-label";
    label.textContent = g.key || "No name given";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = ` · ${g.photos.length} photo${g.photos.length === 1 ? "" : "s"}`;
    label.appendChild(count);

    const groupDl = document.createElement("button");
    groupDl.className = "mini-btn group-dl";
    groupDl.type = "button";
    groupDl.textContent = "Download";
    groupDl.addEventListener("click", () =>
      downloadMany(g.photos, `${safeName(g.key || "no-name")}-photos.zip`));

    header.append(label, groupDl);

    const grid = document.createElement("div");
    grid.className = "gallery";

    for (const [id, data] of g.photos) {
      const item = document.createElement("div");
      item.className = "gallery-item";
      if (canDelete(data)) item.classList.add("deletable");
      if (selected.has(id)) item.classList.add("checked");

      if (data.type === "video") {
        const vid = document.createElement("video");
        vid.src = data.url;
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = "metadata";
        item.appendChild(vid);
        const play = document.createElement("span");
        play.className = "play-badge";
        play.innerHTML = "&#9654;";
        item.appendChild(play);
      } else {
        const img = document.createElement("img");
        img.src = data.url;
        img.loading = "lazy";
        img.alt = data.uploaderName ? `Photo by ${data.uploaderName}` : "Event photo";
        item.appendChild(img);
      }

      const pick = document.createElement("span");
      pick.className = "pick";
      item.appendChild(pick);

      item.addEventListener("click", () => {
        if (selectMode) toggleSelect(id, data, item);
        else openLightbox(id);
      });
      grid.appendChild(item);
    }

    wrap.append(header, grid);
    gallery.appendChild(wrap);
  }

  gallery.classList.toggle("selecting", selectMode);
  document.getElementById("gallery-toolbar").style.display = photoCache.size ? "flex" : "none";
  refreshSelectUi();
}

// ---------- select mode (multi-delete) ----------

let selectMode = false;
const selected = new Set();
const selectBar = document.getElementById("select-bar");
const selectBtn = document.getElementById("select-btn");

function canDelete(data) {
  return isHost || data.uploaderUid === currentUser.uid;
}

function toggleSelect(id, data, item) {
  if (!canDelete(data)) return;
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  item.classList.toggle("checked", selected.has(id));
  refreshSelectUi();
}

function refreshSelectUi() {
  // Drop selections for photos that no longer exist
  for (const id of selected) if (!photoCache.has(id)) selected.delete(id);

  const anyDeletable = [...photoCache.values()].some(canDelete);
  selectBtn.style.display = anyDeletable ? "inline-block" : "none";
  selectBtn.textContent = selectMode ? "Done" : "Select";

  selectBar.classList.toggle("show", selectMode);
  document.getElementById("select-count").textContent =
    `${selected.size} selected`;
  document.getElementById("select-delete").disabled = !selected.size;
  document.getElementById("select-download").disabled = !selected.size;
}

function setSelectMode(on) {
  selectMode = on;
  if (!on) selected.clear();
  renderGallery();
}

selectBtn.addEventListener("click", () => setSelectMode(!selectMode));
document.getElementById("select-cancel").addEventListener("click", () => setSelectMode(false));

document.getElementById("select-delete").addEventListener("click", async () => {
  if (!selected.size) return;
  const n = selected.size;
  const sure = confirm(`Delete ${n} photo${n === 1 ? "" : "s"}? This can't be undone.`);
  if (!sure) return;

  const btn = document.getElementById("select-delete");
  btn.disabled = true;
  let removed = 0;

  for (const id of [...selected]) {
    const data = photoCache.get(id);
    if (!data || !canDelete(data)) continue;
    btn.textContent = `Deleting ${removed + 1} of ${n}...`;
    try {
      await deleteDoc(doc(db, "events", code, "photos", id));
      if (data.path) await deleteObject(ref(storage, data.path)).catch(() => {});
      await updateDoc(doc(db, "events", code), { photoCount: increment(-1) });
      removed++;
    } catch (err) {
      console.error("bulk delete failed for", id, err);
    }
  }

  btn.textContent = "Delete";
  track("photos_deleted", { album: code, count: removed });
  setSelectMode(false);
});

document.getElementById("select-download").addEventListener("click", () => {
  const entries = [...selected].map((id) => [id, photoCache.get(id)]);
  downloadMany(entries, `snapjar-${safeName(eventData.name)}-selected.zip`);
});

// ---------- downloads ----------

function setStatus(msg) {
  uploadStatus.classList.remove("upload-error");
  uploadStatus.textContent = msg;
}

function safeName(s) {
  return (s || "guest").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "guest";
}

async function fetchAsBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("http " + res.status);
  return res.blob();
}

function saveBlob(blob, filename) {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
}

function extOf(data) {
  const m = (data.path || "").match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : (data.type === "video" ? "mp4" : "jpg");
}

async function downloadOne(id) {
  const data = photoCache.get(id);
  if (!data) return false;
  try {
    const blob = await fetchAsBlob(data.url);
    saveBlob(blob, `${safeName(data.uploaderName)}.${extOf(data)}`);
    return true;
  } catch (err) {
    console.error("download failed, opening in a tab instead", err);
    window.open(data.url, "_blank", "noopener");
    return false;
  }
}

// JSZip is only pulled in when someone actually downloads a batch.
let jsZipPromise = null;
function getJSZip() {
  if (!jsZipPromise) {
    jsZipPromise = import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")
      .then((m) => m.default || m);
  }
  return jsZipPromise;
}

async function downloadMany(entries, zipName) {
  entries = entries.filter((e) => e && e[1]);
  if (!entries.length) return;

  if (entries.length === 1) {
    setStatus("Downloading photo...");
    const done = await downloadOne(entries[0][0]);
    if (done) bumpDownloads(1);
    setStatus("");
    return;
  }

  setStatus("Getting the photos ready...");
  let JSZip;
  try {
    JSZip = await getJSZip();
  } catch (err) {
    console.error("zip library failed to load", err);
    setStatus("Couldn't zip them. Downloading one at a time instead...");
    for (const [id] of entries) await downloadOne(id);
    setStatus("");
    return;
  }

  const zip = new JSZip();
  const used = {};
  let ok = 0;
  for (const [i, [, data]] of entries.entries()) {
    setStatus(`Getting photo ${i + 1} of ${entries.length}...`);
    try {
      const blob = await fetchAsBlob(data.url);
      const base = safeName(data.uploaderName);
      used[base] = (used[base] || 0) + 1;
      zip.file(`${base}-${used[base]}.${extOf(data)}`, blob);
      ok++;
    } catch (err) {
      console.error("skipping a photo in the zip", err);
    }
  }

  if (!ok) {
    uploadStatus.classList.add("upload-error");
    uploadStatus.textContent = "Those wouldn't download. Check your connection and try again.";
    return;
  }

  setStatus("Zipping it all up...");
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, zipName);
  bumpDownloads(ok);
  track("download_zip", { album: code, count: ok });
  setStatus(ok === entries.length ? "Downloaded!" : `Downloaded ${ok} of ${entries.length}.`);
  setTimeout(() => setStatus(""), 4000);
}

// "Download everything" is the Party perk the pricing page promises.
document.getElementById("download-all-btn").addEventListener("click", () => {
  if (!eventData.paid) {
    openLimitModal("download");
    return;
  }
  downloadMany([...photoCache], `snapjar-${safeName(eventData.name)}.zip`);
  track("download_all", { album: code, count: photoCache.size });
});

// Hosts see who's been contributing, built from the names on the photos.
// Guests tab: one row per contributor, tap to see just their photos.
function renderGuests() {
  const counts = new Map(); // name -> count, "" bucket = unnamed
  for (const data of photoCache.values()) {
    const key = data.uploaderName || "";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const named = [...counts.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]);
  const unnamed = counts.get("") || 0;

  const list = document.getElementById("guests-list");
  const countEl = document.getElementById("guests-count");
  countEl.textContent = `Guests (${named.length}${unnamed ? " + unnamed" : ""})`;

  list.textContent = "";

  if (!counts.size) {
    list.innerHTML = `<p class="filter-empty">No one has added photos yet.</p>`;
    return;
  }

  const addRow = (name, count, filterName) => {
    const row = document.createElement("button");
    row.className = "guest-row";
    row.type = "button";
    const av = document.createElement("span");
    av.className = "guest-av";
    av.textContent = name ? name.trim()[0].toUpperCase() : "?";
    const main = document.createElement("span");
    main.className = "guest-main";
    main.innerHTML = `<span class="guest-name">${escapeMoment(name || "No name given")}</span>
      <span class="guest-sub">${count} photo${count === 1 ? "" : "s"}</span>`;
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.innerHTML = "&#8250;";
    row.append(av, main, chev);
    row.addEventListener("click", () => showGuestPhotos(filterName));
    list.appendChild(row);
  };

  for (const [name, count] of named) addRow(name, count, name);
  if (unnamed) addRow("", unnamed, "");
}

// Jump to the Album tab filtered to one guest's photos.
let guestNameFilter = null;
function showGuestPhotos(name) {
  guestNameFilter = name;
  activeFilter = "guest";
  for (const c of document.querySelectorAll(".chip")) c.classList.remove("active");
  switchTab("album");
  renderGallery();
}

// ---------- uploads ----------

function onAddPhotos() {
  if (atFreeLimit()) {
    refreshLimitUi();
    openLimitModal();
    return;
  }
  fileInput.click();
}
uploadBtn.addEventListener("click", onAddPhotos);
document.getElementById("fab-add").addEventListener("click", onAddPhotos);

// The paywall. Hosts get the pitch, guests get the explanation
// (and a chance to be the hero).
const limitModal = document.getElementById("limit-modal");

function openLimitModal(reason) {
  const title = document.getElementById("limit-title");
  const copy = document.getElementById("limit-copy");

  if (reason === "download") {
    title.textContent = "Download all is a Party perk";
    copy.textContent = isHost
      ? "Grab every photo in one zip when you unlock this album for $19, one time. You can still download photos one by one for free."
      : "Downloading the whole album at once is a Party perk. The host can unlock it for $19, or you can. Single photos are always free to save.";
  } else {
    title.textContent = isHost ? "Your album is full" : "This album is full";
    copy.textContent = isHost
      ? "Free albums hold 25 photos and yours just hit the ceiling. Unlock unlimited photos and a full year of gallery time for $19, one time."
      : "Free albums hold 25 photos and this one is maxed out. The host can unlock unlimited photos for $19, or you can be the hero and do it for them.";
  }

  const up = document.getElementById("limit-upgrade");
  up.href = upgradeUrlFor(code);
  up.textContent = isHost ? "Unlock unlimited, $19" : "Unlock it, $19";

  limitModal.classList.add("open");
  track("paywall_shown", { album: code, role: isHost ? "host" : "guest", reason: reason || "full" });
}

document.getElementById("limit-close").addEventListener("click", () => limitModal.classList.remove("open"));
limitModal.addEventListener("click", (e) => {
  if (e.target === limitModal) limitModal.classList.remove("open");
});
document.getElementById("limit-upgrade").addEventListener("click", () => {
  track("upgrade_click", { album: code, from: "paywall" });
});

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  if (!files.length) return;

  let remaining = eventData.paid ? Infinity : FREE_PHOTO_LIMIT - (eventData.photoCount || 0);
  const toUpload = files.slice(0, Math.max(0, remaining));
  const truncated = toUpload.length < files.length;
  if (!toUpload.length) {
    refreshLimitUi();
    openLimitModal();
    return;
  }

  uploadBtn.disabled = true;
  uploadStatus.classList.remove("upload-error");
  let done = 0;
  let lastError = null;

  for (const [i, file] of toUpload.entries()) {
    uploadStatus.textContent = `Adding photo ${i + 1} of ${toUpload.length}...`;
    try {
      await uploadOne(file);
      done++;
    } catch (err) {
      console.error("upload failed:", file.name, err);
      lastError = err;
      // First photo failing means something is broken, not flaky.
      // Stop instead of grinding through the whole batch.
      if (done === 0) break;
    }
  }

  uploadBtn.disabled = false;
  refreshLimitUi();
  if (done) track("photos_added", { album: code, count: done });

  if (!lastError) {
    if (truncated) {
      // Part of the selection didn't fit in the free 25. Say so, then pitch.
      uploadStatus.textContent =
        `Added ${done}. The other ${files.length - done} didn't fit, the album is at its 25 free photos.`;
      openLimitModal();
    } else {
      uploadStatus.textContent = done === 1 ? "Added! It's in the album." : `Added ${done} photos!`;
      setTimeout(() => (uploadStatus.textContent = ""), 4000);
    }
  } else {
    const prefix = done ? `Added ${done}, then it stopped: ` : "That didn't work: ";
    uploadStatus.textContent = prefix + describeUploadError(lastError) + " Tap Add photos to retry.";
    uploadStatus.classList.add("upload-error");
    track("upload_failed", { album: code, error: lastError.code || String(lastError.message).slice(0, 60) });
  }
});

function describeUploadError(err) {
  const code = err.code || "";
  if (code.includes("storage/unauthorized") || code.includes("permission-denied")) {
    return "the album refused it (it may be full, or the file type isn't a photo).";
  }
  if (code.includes("storage/retry-limit-exceeded") || code.includes("unavailable") || String(err.message).includes("network")) {
    return "the connection dropped mid-upload.";
  }
  if (String(err.message).includes("video too large")) {
    return "that video is too big (100 MB max). Try a shorter clip.";
  }
  if (String(err.message).includes("too large")) {
    return "that photo is too large (10 MB max).";
  }
  return `something failed (${code || err.message}).`;
}

async function uploadOne(file) {
  const isVideo = (file.type || "").startsWith("video/");
  let blob, contentType, ext, type;

  if (isVideo) {
    if (file.size > 100 * 1024 * 1024) throw new Error("video too large");
    blob = file;
    contentType = file.type || "video/mp4";
    ext = (file.name.split(".").pop() || "mp4").toLowerCase().slice(0, 5);
    type = "video";
  } else {
    blob = await compressImage(file);
    contentType = "image/jpeg";
    ext = "jpg";
    type = "image";
  }

  const id = crypto.randomUUID();
  const path = `events/${code}/${id}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, { contentType });
  const url = await getDownloadURL(storageRef);

  const uploaderName = guestNameInput.value.trim().slice(0, 30) || null;

  await addDoc(collection(db, "events", code, "photos"), {
    url,
    path,
    type,
    uploaderName,
    uploaderUid: currentUser.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db, "events", code), { photoCount: increment(1) });
  eventData.photoCount = (eventData.photoCount || 0) + 1;
}

// Shrink to a sane size before upload. Keeps quality high enough to print,
// keeps your storage bill at zero.
async function compressImage(file) {
  const MAX_EDGE = 1920;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (blob) return blob;
  } catch {
    // Some formats won't decode in the browser. Send the original.
  }
  if (file.size > 9.5 * 1024 * 1024) {
    // Couldn't compress it and the rules cap uploads at 10 MB.
    throw new Error("too large");
  }
  return file;
}

// ---------- lightbox ----------

const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbVideo = document.getElementById("lb-video");
const lbDownload = document.getElementById("lb-download");
const lbDelete = document.getElementById("lb-delete");
let lightboxPhotoId = null;

function openLightbox(id) {
  const data = photoCache.get(id);
  if (!data) return;
  lightboxPhotoId = id;
  if (data.type === "video") {
    lbVideo.src = data.url;
    lbVideo.hidden = false;
    lbImg.hidden = true;
    lbImg.src = "";
  } else {
    lbImg.src = data.url;
    lbImg.hidden = false;
    lbVideo.hidden = true;
    lbVideo.removeAttribute("src");
  }
  lbDownload.href = data.url;
  lbDelete.style.display = isHost || data.uploaderUid === currentUser.uid ? "inline-block" : "none";
  updateFavBtn();
  lightbox.classList.add("open");
}

function updateFavBtn() {
  const btn = document.getElementById("lb-fav");
  btn.innerHTML = isFav(lightboxPhotoId) ? "&#9733; Favorited" : "&#9734; Favorite";
}

document.getElementById("lb-fav").addEventListener("click", () => {
  if (!lightboxPhotoId) return;
  toggleFav(lightboxPhotoId);
  updateFavBtn();
});

function closeLightbox() {
  lightbox.classList.remove("open");
  lbImg.src = "";
  try { lbVideo.pause(); } catch { /* ignore */ }
  lbVideo.removeAttribute("src");
  lightboxPhotoId = null;
}

document.getElementById("lb-close").addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeLightbox(); reportModal.classList.remove("open"); }
});

// ---------- report a photo ----------

const reportModal = document.getElementById("report-modal");
let reportPhotoId = null;

document.getElementById("lb-report").addEventListener("click", () => {
  reportPhotoId = lightboxPhotoId;
  reportModal.classList.add("open");
});

document.getElementById("report-cancel").addEventListener("click", () => reportModal.classList.remove("open"));
reportModal.addEventListener("click", (e) => {
  if (e.target === reportModal) reportModal.classList.remove("open");
});

for (const btn of document.querySelectorAll("#report-reasons button")) {
  btn.addEventListener("click", async () => {
    const reason = btn.dataset.reason;
    const id = reportPhotoId;
    const data = photoCache.get(id);
    reportModal.classList.remove("open");
    closeLightbox();
    if (!id || !data) return;
    try {
      await addDoc(collection(db, "reports"), {
        albumCode: code,
        albumName: eventData.name || null,
        photoId: id,
        photoUrl: data.url,
        uploaderName: data.uploaderName || null,
        reason,
        reporterUid: currentUser.uid,
        createdAt: serverTimestamp()
      });
      track("photo_reported", { album: code, reason });
      uploadStatus.classList.remove("upload-error");
      uploadStatus.textContent = "Thanks, the host will take a look.";
      setTimeout(() => (uploadStatus.textContent = ""), 4000);
    } catch (err) {
      console.error("report failed", err);
    }
  });
}

// ---------- host: rename ----------

async function doRename() {
  const next = prompt("Album name:", eventData.name);
  if (!next || !next.trim() || next.trim() === eventData.name) return;
  const name = next.trim().slice(0, 60);
  try {
    await updateDoc(doc(db, "events", code), { name });
    eventData.name = name;
    document.getElementById("event-title").textContent = name;
    document.title = `${name} · Snapjar`;
  } catch (err) {
    console.error(err);
    alert("Couldn't rename just now. Try again in a minute.");
  }
}

// ---------- tabs, chips, settings ----------

function switchTab(tab) {
  for (const b of document.querySelectorAll(".tabbar-btn, .snav")) b.classList.toggle("active", b.dataset.tab === tab);
  for (const p of document.querySelectorAll(".tab-panel")) p.hidden = p.id !== `tab-${tab}`;
  // The right rail (share/stats) only belongs alongside the Album view.
  const rail = document.getElementById("rail");
  if (rail) rail.style.visibility = tab === "album" ? "visible" : "hidden";
  if (tab === "messages") clearMsgDot();
  if (tab === "analytics") { renderStats(); renderContributors(); }
  window.scrollTo({ top: 0 });
}

function setupTabs() {
  for (const b of document.querySelectorAll(".tabbar-btn, .snav")) {
    if (b.dataset.tab) b.addEventListener("click", () => switchTab(b.dataset.tab));
  }
  // The bell and the user chips stay inside the app instead of leaving for the
  // separate account page.
  for (const b of document.querySelectorAll("[data-goto]")) {
    b.addEventListener("click", () => switchTab(b.dataset.goto));
  }
  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("click", () => {
      for (const c of document.querySelectorAll(".chip")) c.classList.remove("active");
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      guestNameFilter = null;
      renderGallery();
    });
  }
  const search = document.getElementById("photo-search");
  search.addEventListener("input", () => { searchTerm = search.value.trim().toLowerCase(); renderGallery(); });
  const sort = document.getElementById("sort-select");
  sort.addEventListener("change", () => { sortOrder = sort.value; renderGallery(); });
}

function setupSettingsTab() {
  document.getElementById("set-share").addEventListener("click", openShare);
  document.getElementById("set-download").addEventListener("click", () => {
    if (!eventData.paid) { openLimitModal("download"); return; }
    downloadMany([...photoCache], `snapjar-${safeName(eventData.name)}.zip`);
  });
  document.getElementById("set-tables").href = `/tables?c=${code}`;
  const rename = document.getElementById("set-rename");
  if (isHost) { rename.hidden = false; rename.addEventListener("click", doRename); }
}

// ---------- messages (guestbook) ----------

let msgCache = [];
let msgSeeded = false;

function isOnMessagesTab() {
  return !document.getElementById("tab-messages").hidden;
}

function clearMsgDot() { document.getElementById("msg-dot").hidden = true; }

function watchMessages() {
  const q = query(collection(db, "events", code, "messages"), orderBy("createdAt", "asc"));
  onSnapshot(q, (snap) => {
    let hasNewFromOthers = false;
    for (const change of snap.docChanges()) {
      if (change.type === "added" && msgSeeded && change.doc.data().authorUid !== currentUser.uid) {
        hasNewFromOthers = true;
      }
    }
    msgCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    msgSeeded = true;
    renderMessages();
    if (hasNewFromOthers && !isOnMessagesTab()) document.getElementById("msg-dot").hidden = false;
  });
}

function renderMessages() {
  const list = document.getElementById("msg-list");
  document.getElementById("msg-empty").style.display = msgCache.length ? "none" : "block";
  const badge = document.getElementById("msg-count-badge");
  if (badge) { badge.hidden = !msgCache.length; badge.textContent = msgCache.length; }
  list.textContent = "";

  for (const m of msgCache) {
    const mine = m.authorUid === currentUser.uid;
    const row = document.createElement("div");
    row.className = "msg" + (mine ? " mine" : "");

    const av = document.createElement("span");
    av.className = "msg-av";
    av.textContent = m.authorName ? m.authorName.trim()[0].toUpperCase() : "?";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    const who = document.createElement("span");
    who.className = "msg-who";
    who.textContent = m.authorName || "Guest";
    const txt = document.createElement("span");
    txt.className = "msg-text";
    txt.textContent = m.text;
    bubble.append(who, txt);

    if (isHost || mine) {
      const del = document.createElement("button");
      del.className = "msg-del";
      del.type = "button";
      del.innerHTML = "&times;";
      del.title = "Delete";
      del.addEventListener("click", async () => {
        try { await deleteDoc(doc(db, "events", code, "messages", m.id)); }
        catch (err) { console.error(err); }
      });
      bubble.appendChild(del);
    }

    if (mine) row.append(bubble, av);
    else row.append(av, bubble);
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim().slice(0, 500);
  if (!text) return;
  input.value = "";
  try {
    await addDoc(collection(db, "events", code, "messages"), {
      text,
      authorName: guestNameInput.value.trim().slice(0, 30) || null,
      authorUid: currentUser.uid,
      createdAt: serverTimestamp()
    });
    track("message_sent", { album: code });
  } catch (err) {
    console.error("message failed", err);
    input.value = text;
    alert("Message didn't send. Try again in a second.");
  }
}

document.getElementById("msg-send").addEventListener("click", sendMessage);
document.getElementById("msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
});

// ---------- share modal ----------

const shareModal = document.getElementById("share-modal");

function albumLink() {
  return `${location.origin}/event?c=${code}`;
}

function openShare() {
  const url = albumLink();
  // The QR carries the scan marker; the copyable link stays clean so shared
  // links aren't miscounted as scans.
  document.getElementById("share-qr").src =
    "https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=2&color=211c15&bgcolor=ffffff&data=" +
    encodeURIComponent(url + "&s=qr");
  document.getElementById("share-caption").textContent = eventData.name;
  document.getElementById("share-domain").textContent = location.host;
  document.getElementById("share-url").value = url;
  shareModal.classList.add("open");
  track("share_open", { album: code });
}

document.getElementById("share-btn").addEventListener("click", openShare);
document.getElementById("share-design").addEventListener("click", () => { location.href = `/design?c=${code}`; });
for (const id of ["share-close", "share-close-bottom"]) {
  document.getElementById(id).addEventListener("click", () => shareModal.classList.remove("open"));
}
shareModal.addEventListener("click", (e) => {
  if (e.target === shareModal) shareModal.classList.remove("open");
});

document.getElementById("share-copy").addEventListener("click", async () => {
  const input = document.getElementById("share-url");
  try { await navigator.clipboard.writeText(input.value); }
  catch { input.select(); document.execCommand("copy"); }
  const btn = document.getElementById("share-copy");
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

document.getElementById("share-native").addEventListener("click", async () => {
  const url = albumLink();
  if (navigator.share) {
    try { await navigator.share({ title: eventData.name, text: `Add your photos to ${eventData.name}`, url }); } catch { /* cancelled */ }
  } else {
    try { await navigator.clipboard.writeText(url); alert("Link copied. Paste it anywhere."); } catch { /* ignore */ }
  }
});

document.getElementById("share-download-qr").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = document.getElementById("share-qr").src;
  a.download = `${safeName(eventData.name)}-qr.png`;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
});

for (const id of ["upgrade-link", "guest-upgrade", "st-upgrade"]) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => track("upgrade_click", { album: code, from: id }));
}

lbDelete.addEventListener("click", async () => {
  if (!lightboxPhotoId) return;
  const id = lightboxPhotoId;
  const data = photoCache.get(id);
  closeLightbox();

  try {
    await deleteDoc(doc(db, "events", code, "photos", id));
    if (data?.path) await deleteObject(ref(storage, data.path)).catch(() => {});
    await updateDoc(doc(db, "events", code), { photoCount: increment(-1) });
  } catch (err) {
    console.error("delete failed", err);
  }
});
