// My albums. Local memory (this browser) plus, for signed-in accounts,
// every album their uid hosts anywhere, fetched from Firestore.

import { auth, db, track } from "./firebase-init.js";
import { upgradeUrlFor } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, deleteDoc, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let rendered = false;

onAuthStateChanged(auth, async (user) => {
  if (rendered) return;
  rendered = true;

  const localMine = JSON.parse(localStorage.getItem("snapjar_albums") || "[]");
  let mine = [...localMine];

  // Signed-in hosts get their albums from every device, not just this one.
  if (user && !user.isAnonymous) {
    try {
      const snap = await getDocs(
        query(collection(db, "events"), where("hostUid", "==", user.uid))
      );
      for (const d of snap.docs) {
        if (!mine.some((m) => m.code === d.id)) {
          mine.push({ code: d.id, name: d.data().name });
        }
      }
    } catch (err) {
      console.error("cloud album list failed", err);
    }
  }

  let joined = JSON.parse(localStorage.getItem("snapjar_visited") || "[]")
    .filter((v) => !mine.some((m) => m.code === v.code));

  // Drop albums that have been deleted, and forget them locally, so the list
  // only shows albums that still exist.
  mine = await keepExisting(mine);
  joined = await keepExisting(joined);

  if (!mine.length && !joined.length) {
    document.getElementById("empty-state").style.display = "block";
    return;
  }
  if (mine.length) renderSection("mine", mine, true);
  if (joined.length) renderSection("joined", joined, false);
});

async function keepExisting(list) {
  const out = [];
  for (const a of list) {
    try {
      const snap = await getDoc(doc(db, "events", a.code));
      if (snap.exists()) out.push({ ...a, name: snap.data().name || a.name });
      else forgetLocal(a.code);
    } catch {
      out.push(a); // offline: keep it rather than lose it
    }
  }
  return out;
}

function renderSection(prefix, list, isMine) {
  document.getElementById(`${prefix}-section`).style.display = "block";
  const container = document.getElementById(`${prefix}-list`);

  for (const album of list) {
    const card = document.createElement("div");
    card.className = "album-card";

    const top = document.createElement("div");
    top.className = "album-card-top";

    const name = document.createElement("a");
    name.className = "album-card-name";
    name.href = `/event?c=${album.code}`;
    name.textContent = album.name || album.code;

    const status = document.createElement("span");
    status.className = "tag tag-free";
    status.textContent = "checking...";

    top.append(name, status);

    const actions = document.createElement("div");
    actions.className = "album-card-actions";

    const open = document.createElement("a");
    open.className = "btn btn-small";
    open.href = `/event?c=${album.code}`;
    open.textContent = "Open";
    actions.appendChild(open);

    const qr = document.createElement("a");
    qr.className = "btn btn-small btn-outline";
    qr.href = `/event?c=${album.code}#share`;
    qr.textContent = "QR & share";
    actions.appendChild(qr);

    card.append(top, actions);
    container.appendChild(card);

    fillStatus(album, status, actions, card, isMine);
  }
}

async function fillStatus(album, statusEl, actionsEl, cardEl, isMine) {
  try {
    const snap = await getDoc(doc(db, "events", album.code));
    if (!snap.exists()) {
      statusEl.textContent = "deleted";
      return;
    }
    const data = snap.data();
    const photos = data.photoCount || 0;
    const ownedByMe = auth.currentUser && data.hostUid === auth.currentUser.uid;

    if (data.paid) {
      statusEl.className = "tag tag-paid";
      statusEl.textContent = `Paid · ${photos} photos`;
    } else {
      statusEl.className = "tag tag-free";
      statusEl.textContent = `Free · ${photos}/25 photos`;

      const upgrade = document.createElement("a");
      upgrade.className = "btn btn-small btn-outline";
      upgrade.href = upgradeUrlFor(album.code);
      upgrade.target = "_blank";
      upgrade.rel = "noopener";
      upgrade.textContent = isMine ? "Upgrade, $19.99" : "Gift unlimited, $19.99";
      upgrade.addEventListener("click", () =>
        track("upgrade_click", { album: album.code, from: "albums-page" }));
      actionsEl.appendChild(upgrade);
    }

    // Deleting is a host power, verified server-side by the rules.
    if (ownedByMe) {
      const del = document.createElement("button");
      del.className = "mini-btn mini-danger";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        const sure = confirm(
          `Delete "${album.name || album.code}" for everyone? Guests lose access immediately. This can't be undone.`
        );
        if (!sure) return;
        del.disabled = true;
        try {
          await deleteDoc(doc(db, "events", album.code));
          forgetLocal(album.code);
          cardEl.remove();
        } catch (err) {
          console.error(err);
          del.disabled = false;
          alert("Couldn't delete it just now. Try again in a minute.");
        }
      });
      actionsEl.appendChild(del);
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "offline";
  }
}

function forgetLocal(code) {
  for (const key of ["snapjar_albums", "snapjar_visited"]) {
    const list = JSON.parse(localStorage.getItem(key) || "[]").filter((a) => a.code !== code);
    localStorage.setItem(key, JSON.stringify(list));
  }
}
