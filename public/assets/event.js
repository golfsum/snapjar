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

    document.title = `${eventData.name} · Snapjar`;
    document.getElementById("event-title").textContent = eventData.name;
    document.getElementById("event-meta").textContent = eventData.hostName
      ? `Hosted by ${eventData.hostName}`
      : "Tap the button below to add yours";

    if (isHost) document.getElementById("host-bar").style.display = "block";

    rememberVisit(code, eventData.name);

    loadingState.style.display = "none";
    albumView.style.display = "block";

    if (isHost) setupRename();
    if (location.hash === "#share") openShare();

    watchPhotos();
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

function atFreeLimit() {
  return !eventData.paid && (eventData.photoCount || 0) >= FREE_PHOTO_LIMIT;
}

function refreshLimitUi() {
  limitNote.style.display = atFreeLimit() ? "block" : "none";
  document.getElementById("upgrade-link").href = upgradeUrlFor(code);

  // Hosts get the prominent upgrade button. Everyone else gets a quieter
  // link, because the host's other device and generous friends both count.
  document.getElementById("host-actions").style.display =
    isHost && !eventData.paid ? "block" : "none";
  document.getElementById("guest-upgrade").style.display =
    !isHost && !eventData.paid ? "block" : "none";
  document.getElementById("header-upgrade").href = upgradeUrlFor(code);
  document.getElementById("guest-upgrade-link").href = upgradeUrlFor(code);
  document.getElementById("paid-badge").style.display = eventData.paid ? "block" : "none";
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
    emptyGallery.style.display = photoCache.size ? "none" : "block";
    // Keep the local count roughly in sync for the limit check
    eventData.photoCount = snap.size;
    refreshLimitUi();
    if (isHost) refreshGuestList();
  });
}

function tsMillis(t) {
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

// Photos are grouped by who added them, newest activity on top,
// with the uploader's name labelled above their photos.
function renderGallery() {
  const groups = new Map();
  for (const [id, data] of photoCache) {
    const key = data.uploaderName || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([id, data]);
  }

  const sorted = [...groups.entries()].map(([key, photos]) => {
    photos.sort((a, b) => tsMillis(b[1].createdAt) - tsMillis(a[1].createdAt));
    return { key, photos, latest: tsMillis(photos[0][1].createdAt) };
  }).sort((a, b) => b.latest - a.latest);

  gallery.textContent = "";

  for (const g of sorted) {
    const wrap = document.createElement("div");
    wrap.className = "gallery-group";

    const label = document.createElement("h3");
    label.className = "group-label";
    label.textContent = g.key || "No name given";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = ` · ${g.photos.length} photo${g.photos.length === 1 ? "" : "s"}`;
    label.appendChild(count);

    const grid = document.createElement("div");
    grid.className = "gallery";

    for (const [id, data] of g.photos) {
      const item = document.createElement("div");
      item.className = "gallery-item";
      if (canDelete(data)) item.classList.add("deletable");
      if (selected.has(id)) item.classList.add("checked");

      const img = document.createElement("img");
      img.src = data.url;
      img.loading = "lazy";
      img.alt = data.uploaderName ? `Photo by ${data.uploaderName}` : "Event photo";
      item.appendChild(img);

      const pick = document.createElement("span");
      pick.className = "pick";
      item.appendChild(pick);

      item.addEventListener("click", () => {
        if (selectMode) toggleSelect(id, data, item);
        else openLightbox(id);
      });
      grid.appendChild(item);
    }

    wrap.append(label, grid);
    gallery.appendChild(wrap);
  }

  gallery.classList.toggle("selecting", selectMode);
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

// Hosts see who's been contributing, built from the names on the photos.
function refreshGuestList() {
  const names = new Set();
  let anonymous = 0;
  for (const data of photoCache.values()) {
    if (data.uploaderName) names.add(data.uploaderName);
    else anonymous++;
  }
  const el = document.getElementById("host-guests");
  if (!names.size && !anonymous) { el.textContent = ""; return; }
  const parts = [...names];
  if (anonymous) parts.push(`${anonymous} unnamed`);
  el.textContent = ` Photos from: ${parts.join(", ")}.`;
}

// ---------- uploads ----------

uploadBtn.addEventListener("click", () => {
  if (atFreeLimit()) {
    refreshLimitUi();
    openLimitModal();
    return;
  }
  fileInput.click();
});

// The paywall. Hosts get the pitch, guests get the explanation
// (and a chance to be the hero).
const limitModal = document.getElementById("limit-modal");

function openLimitModal() {
  document.getElementById("limit-title").textContent =
    isHost ? "Your album is full" : "This album is full";
  document.getElementById("limit-copy").textContent = isHost
    ? "Free albums hold 25 photos and yours just hit the ceiling. Unlock unlimited photos and a full year of gallery time for $19, one time."
    : "Free albums hold 25 photos and this one is maxed out. The host can unlock unlimited photos for $19, or you can be the hero and do it for them.";

  const up = document.getElementById("limit-upgrade");
  up.href = upgradeUrlFor(code);
  up.textContent = isHost ? "Unlock unlimited, $19" : "Unlock it, $19";

  limitModal.classList.add("open");
  track("paywall_shown", { album: code, role: isHost ? "host" : "guest" });
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
  if (String(err.message).includes("too large")) {
    return "that photo is too large (10 MB max).";
  }
  return `something failed (${code || err.message}).`;
}

async function uploadOne(file) {
  const blob = await compressImage(file);
  const id = crypto.randomUUID();
  const path = `events/${code}/${id}.jpg`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const url = await getDownloadURL(storageRef);

  const uploaderName = guestNameInput.value.trim().slice(0, 30) || null;

  await addDoc(collection(db, "events", code, "photos"), {
    url,
    path,
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
const lbDownload = document.getElementById("lb-download");
const lbDelete = document.getElementById("lb-delete");
let lightboxPhotoId = null;

function openLightbox(id) {
  const data = photoCache.get(id);
  if (!data) return;
  lightboxPhotoId = id;
  lbImg.src = data.url;
  lbDownload.href = data.url;
  lbDelete.style.display = isHost || data.uploaderUid === currentUser.uid ? "inline-block" : "none";
  lightbox.classList.add("open");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lbImg.src = "";
  lightboxPhotoId = null;
}

document.getElementById("lb-close").addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

// ---------- host: rename ----------

function setupRename() {
  const btn = document.getElementById("rename-btn");
  btn.style.display = "inline-block";
  btn.addEventListener("click", async () => {
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
  });
}

// ---------- share modal ----------

const shareModal = document.getElementById("share-modal");

function albumLink() {
  return `${location.origin}/event?c=${code}`;
}

function openShare() {
  const url = albumLink();
  document.getElementById("share-qr").src =
    "https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=2&color=211c15&bgcolor=ffffff&data=" +
    encodeURIComponent(url);
  document.getElementById("share-caption").textContent = eventData.name;
  document.getElementById("share-domain").textContent = location.host;
  document.getElementById("share-url").value = url;
  shareModal.classList.add("open");
  track("share_open", { album: code });
}

document.getElementById("share-btn").addEventListener("click", openShare);
document.getElementById("share-close").addEventListener("click", () => shareModal.classList.remove("open"));
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

for (const id of ["header-upgrade", "upgrade-link", "guest-upgrade-link"]) {
  document.getElementById(id).addEventListener("click", () => {
    track("upgrade_click", { album: code, from: id });
  });
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
