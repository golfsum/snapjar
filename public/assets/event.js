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
      if (change.type === "added") addPhotoToGallery(change.doc.id, change.doc.data());
      if (change.type === "removed") {
        photoCache.delete(change.doc.id);
        const el = document.getElementById(`photo-${change.doc.id}`);
        if (el) el.remove();
      }
    }
    emptyGallery.style.display = snap.empty ? "block" : "none";
    // Keep the local count roughly in sync for the limit check
    eventData.photoCount = snap.size;
    refreshLimitUi();
    if (isHost) refreshGuestList();
  });
}

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

function addPhotoToGallery(id, data) {
  if (photoCache.has(id)) return;
  photoCache.set(id, data);

  const item = document.createElement("div");
  item.className = "gallery-item";
  item.id = `photo-${id}`;

  const img = document.createElement("img");
  img.src = data.url;
  img.loading = "lazy";
  img.alt = data.uploaderName ? `Photo by ${data.uploaderName}` : "Event photo";

  item.appendChild(img);

  if (data.uploaderName) {
    const credit = document.createElement("div");
    credit.className = "credit";
    credit.textContent = `by ${data.uploaderName}`;
    item.appendChild(credit);
  }

  item.addEventListener("click", () => openLightbox(id));

  // New photos go to the top so the room sees them appear live
  gallery.prepend(item);
}

// ---------- uploads ----------

uploadBtn.addEventListener("click", () => {
  if (atFreeLimit() && !isHost) {
    refreshLimitUi();
    limitNote.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  if (!files.length) return;

  let remaining = eventData.paid ? Infinity : FREE_PHOTO_LIMIT - (eventData.photoCount || 0);
  const toUpload = files.slice(0, Math.max(0, remaining));
  if (!toUpload.length) return refreshLimitUi();

  uploadBtn.disabled = true;
  let done = 0;

  for (const file of toUpload) {
    uploadStatus.textContent = `Adding photo ${done + 1} of ${toUpload.length}...`;
    try {
      await uploadOne(file);
      done++;
    } catch (err) {
      console.error("upload failed", err);
    }
  }

  if (done) track("photos_added", { album: code, count: done });

  uploadStatus.textContent = done
    ? (done === 1 ? "Added! It's in the album." : `Added ${done} photos!`)
    : "Those didn't go through. Check your connection and try again.";
  setTimeout(() => (uploadStatus.textContent = ""), 4000);

  uploadBtn.disabled = false;
  refreshLimitUi();
});

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
