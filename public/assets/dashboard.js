// Snapjar HQ. Owner-only, redesigned dashboard. Reads the events collection
// (same data the old admin page used) and presents it Apple-Photos style.
// The Google email gate here is cosmetic; firestore.rules is the real lock.

import { auth, db } from "./firebase-init.js";
import { ADMIN_EMAIL } from "./config.js";
import {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let reports = [];

const PARTY_PRICE = 19.99;
const PRO_PRICE = 29.99;

// A Pro album paid the Pro price; a plain paid album paid the Party price.
function albumRevenue(a) {
  return a.pro ? PRO_PRICE : (a.paid ? PARTY_PRICE : 0);
}
const AVG_MB = 0.35; // rough compressed-photo size, for the storage estimate

const gateView = document.getElementById("gate-view");
const loadingView = document.getElementById("loading-view");
const hqView = document.getElementById("hq-view");
const gateError = document.getElementById("gate-error");

let albums = [];

onAuthStateChanged(auth, (user) => {
  if (location.hash === "#preview") return; // layout preview, ignore real auth
  if (user && user.email === ADMIN_EMAIL) {
    gateView.style.display = "none";
    document.getElementById("who").textContent = user.email;
    loadDashboard();
  } else {
    gateView.style.display = "grid";
    hqView.style.display = "none";
  }
});

document.getElementById("signin-btn").addEventListener("click", async () => {
  gateError.classList.remove("show");
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    if (result.user.email !== ADMIN_EMAIL) {
      await signOut(auth);
      gateError.textContent = "That Google account isn't the owner.";
      gateError.classList.add("show");
    }
  } catch (err) {
    console.error(err);
    gateError.textContent = "Sign-in didn't complete. Is Google sign-in enabled in Firebase?";
    gateError.classList.add("show");
  }
});

document.getElementById("signout-btn").addEventListener("click", () => signOut(auth));

// sidebar nav
for (const btn of document.querySelectorAll(".hq-nav[data-view]")) {
  btn.addEventListener("click", () => {
    for (const b of document.querySelectorAll(".hq-nav[data-view]")) b.classList.remove("active");
    btn.classList.add("active");
    const view = btn.dataset.view;
    for (const sec of document.querySelectorAll(".hq-view")) sec.hidden = sec.id !== `view-${view}`;
    document.getElementById("view-title").textContent =
      { overview: "Overview", albums: "Albums", reports: "Reports" }[view] || "Overview";
  });
}

async function loadDashboard() {
  loadingView.style.display = "grid";
  try {
    const snap = await getDocs(
      query(collection(db, "events"), orderBy("createdAt", "desc"), limit(1000))
    );
    albums = snap.docs.map((d) => ({ code: d.id, ...d.data() }));

    try {
      const rSnap = await getDocs(
        query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200))
      );
      reports = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error("reports load failed (deploy the reports rule?)", err);
      reports = [];
    }

    renderAll();
    loadingView.style.display = "none";
    hqView.style.display = "grid";
  } catch (err) {
    console.error(err);
    loadingView.style.display = "none";
    gateView.style.display = "grid";
    gateError.textContent = "Couldn't load albums. Deploy the latest firestore.rules and try again.";
    gateError.classList.add("show");
  }
}

function renderAll() {
  renderStats();
  renderChart();
  renderTop();
  renderRecent();
  renderTable();
  renderReports();
  const badge = document.getElementById("reports-badge");
  if (reports.length) { badge.hidden = false; badge.textContent = reports.length; }
  else badge.hidden = true;
  document.getElementById("updated").textContent = "Updated " + new Date().toLocaleString();
}

function toMillis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

function dayStart(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ---------- stat cards ----------

function renderStats() {
  const totalPhotos = albums.reduce((s, a) => s + (a.photoCount || 0), 0);
  const totalScans = albums.reduce((s, a) => s + (a.scanCount || 0), 0);
  const totalDownloads = albums.reduce((s, a) => s + (a.downloadCount || 0), 0);
  const paid = albums.filter((a) => a.paid).length;
  const proCount = albums.filter((a) => a.pro).length;
  const revenue = albums.reduce((s, a) => s + albumRevenue(a), 0);
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const weekCount = albums.filter((a) => toMillis(a.createdAt) > weekAgo).length;
  const storageGb = (totalPhotos * AVG_MB) / 1024;
  const conv = albums.length ? Math.round((paid / albums.length) * 100) : 0;

  const cards = [
    {
      label: "Albums",
      num: albums.length,
      sub: weekCount ? `<span class="delta">+${weekCount}</span> this week` : "No new albums this week"
    },
    {
      label: "Photos collected",
      num: totalPhotos.toLocaleString(),
      sub: `across ${albums.length} album${albums.length === 1 ? "" : "s"}`
    },
    {
      label: "Revenue",
      num: "$" + revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      sub: `${paid} paid${proCount ? ` &middot; ${proCount} Pro` : ""} &middot; ${conv}% of albums`
    },
    {
      label: "QR scans",
      num: totalScans.toLocaleString(),
      sub: "Guests who scanned a code"
    },
    {
      label: "Downloads",
      num: totalDownloads.toLocaleString(),
      sub: "Photos saved by guests"
    },
    {
      label: "Estimated storage",
      num: storageGb < 1 ? Math.round(storageGb * 1024) + " MB" : storageGb.toFixed(2) + " GB",
      sub: `~${AVG_MB} MB per photo`
    },
    {
      label: "Pending reports",
      num: reports.length,
      sub: reports.length ? "Needs your review" : "All clear"
    }
  ];

  document.getElementById("stat-cards").innerHTML = cards.map((c) => `
    <div class="scard">
      <div class="label">${c.label}</div>
      <div class="num">${c.num}</div>
      <div class="sub">${c.sub}</div>
    </div>`).join("");
}

// ---------- chart: new albums per day, 14 days ----------

function renderChart() {
  const days = 14;
  const today = dayStart(Date.now());
  const buckets = new Array(days).fill(0);
  for (const a of albums) {
    const ms = toMillis(a.createdAt);
    if (!ms) continue;
    const idx = days - 1 - Math.round((today - dayStart(ms)) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx]++;
  }

  const max = Math.max(1, ...buckets);
  const W = 640, H = 220, padL = 26, padR = 10, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const X = (i) => padL + (plotW * i) / (days - 1);
  const Y = (v) => padT + plotH - (plotH * v) / max;

  const linePts = buckets.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const areaPts = `${padL},${(padT + plotH).toFixed(1)} ${linePts} ${X(days - 1).toFixed(1)},${(padT + plotH).toFixed(1)}`;

  // horizontal gridlines at 0, mid, max
  const grid = [0, Math.round(max / 2), max].map((v) =>
    `<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W - padR}" y2="${Y(v).toFixed(1)}" stroke="#eef0f3" stroke-width="1"/>
     <text x="4" y="${(Y(v) + 3).toFixed(1)}" font-size="10" fill="#9aa1ac">${v}</text>`).join("");

  const dots = buckets.map((v, i) =>
    `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="#4f8ef7"/>`).join("");

  // x labels: first, middle, last dates
  const labelIdx = [0, Math.floor((days - 1) / 2), days - 1];
  const xlabels = labelIdx.map((i) => {
    const d = new Date(today - (days - 1 - i) * 86400000);
    const txt = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const anchor = i === 0 ? "start" : i === days - 1 ? "end" : "middle";
    return `<text x="${X(i).toFixed(1)}" y="${H - 6}" font-size="10" fill="#9aa1ac" text-anchor="${anchor}">${txt}</text>`;
  }).join("");

  document.getElementById("chart").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="New albums per day">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4f8ef7" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#4f8ef7" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <polygon points="${areaPts}" fill="url(#fade)"/>
      <polyline points="${linePts}" fill="none" stroke="#4f8ef7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xlabels}
    </svg>`;
}

// ---------- lists ----------

function initials(name) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  return ((parts[0][0] || "") + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function renderTop() {
  const top = [...albums].sort((a, b) => (b.photoCount || 0) - (a.photoCount || 0)).slice(0, 6);
  const max = Math.max(1, ...top.map((a) => a.photoCount || 0));
  const el = document.getElementById("top-list");

  if (!top.length || !(top[0].photoCount)) {
    el.innerHTML = `<div class="empty-line">No photos yet.</div>`;
    return;
  }

  el.innerHTML = top.map((a) => {
    const n = a.photoCount || 0;
    const name = a.name || "(unnamed)";
    return `<div class="rowitem">
      <div class="avatar">${initials(name)}</div>
      <div class="rmain">
        <div class="rname">${escapeHtml(name)}</div>
        <div class="minibar"><i style="width:${Math.round((n / max) * 100)}%"></i></div>
      </div>
      <div class="rval">${n}</div>
    </div>`;
  }).join("");
}

function renderRecent() {
  const recent = [...albums].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)).slice(0, 6);
  const el = document.getElementById("recent-list");

  if (!recent.length) {
    el.innerHTML = `<div class="empty-line">No albums yet.</div>`;
    return;
  }

  el.innerHTML = recent.map((a) => {
    const name = a.name || "(unnamed)";
    const when = toMillis(a.createdAt)
      ? new Date(toMillis(a.createdAt)).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "";
    const tag = a.paid ? `<span class="tag tag-paid">Paid</span>` : `<span class="tag tag-free">Free</span>`;
    return `<div class="rowitem">
      <div class="avatar">${initials(name)}</div>
      <div class="rmain">
        <div class="rname">${escapeHtml(name)}</div>
        <div class="rsub">${when} &middot; ${a.photoCount || 0} photos</div>
      </div>
      <div class="rval">${tag}</div>
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- reports ----------

function renderReports() {
  const el = document.getElementById("report-rows");
  el.textContent = "";

  if (!reports.length) {
    el.innerHTML = `<div class="empty-line">No reports. Nothing to review.</div>`;
    return;
  }

  for (const r of reports) {
    const row = document.createElement("div");
    row.className = "rowitem report-row";

    const thumb = document.createElement("a");
    thumb.href = r.photoUrl || "#";
    thumb.target = "_blank";
    thumb.rel = "noopener";
    thumb.className = "report-thumb";
    if (r.photoUrl) thumb.style.backgroundImage = `url("${r.photoUrl}")`;

    const main = document.createElement("div");
    main.className = "rmain";
    const when = toMillis(r.createdAt)
      ? new Date(toMillis(r.createdAt)).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "";
    main.innerHTML =
      `<div class="rname">${escapeHtml(r.reason || "Reported")}</div>` +
      `<div class="rsub">${escapeHtml(r.albumName || r.albumCode || "")} &middot; ${when}</div>`;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const del = document.createElement("button");
    del.className = "tbtn danger";
    del.textContent = "Delete photo";
    del.addEventListener("click", () => deleteReportedPhoto(r, del));

    const dismiss = document.createElement("button");
    dismiss.className = "tbtn";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => dismissReport(r, dismiss));

    actions.append(del, dismiss);
    row.append(thumb, main, actions);
    el.appendChild(row);
  }
}

async function dismissReport(report, btn) {
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "reports", report.id));
    reports = reports.filter((x) => x.id !== report.id);
    renderAll();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Couldn't dismiss: " + (err.code || err.message));
  }
}

async function deleteReportedPhoto(report, btn) {
  if (!confirm("Delete this photo from its album and clear the report?")) return;
  btn.disabled = true;
  try {
    if (report.albumCode && report.photoId) {
      await deleteDoc(doc(db, "events", report.albumCode, "photos", report.photoId));
      await updateDoc(doc(db, "events", report.albumCode), { photoCount: increment(-1) });
      const alb = albums.find((a) => a.code === report.albumCode);
      if (alb) alb.photoCount = Math.max(0, (alb.photoCount || 0) - 1);
    }
    await deleteDoc(doc(db, "reports", report.id));
    reports = reports.filter((x) => x.id !== report.id);
    renderAll();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Couldn't delete: " + (err.code || err.message));
  }
}

// ---------- album table ----------

function renderTable() {
  const tbody = document.getElementById("album-rows");
  tbody.textContent = "";

  for (const a of albums) {
    const tr = document.createElement("tr");

    const name = document.createElement("td");
    const link = document.createElement("a");
    link.href = `/event?c=${a.code}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = a.name || "(unnamed)";
    name.appendChild(link);
    if (a.hostName) {
      const sub = document.createElement("div");
      sub.className = "rsub";
      sub.style.color = "var(--faint)";
      sub.textContent = "host: " + a.hostName;
      name.appendChild(sub);
    }

    const codeCell = document.createElement("td");
    codeCell.className = "mono";
    codeCell.textContent = a.code;

    const photos = document.createElement("td");
    photos.textContent = a.photoCount || 0;

    const created = document.createElement("td");
    created.textContent = toMillis(a.createdAt)
      ? new Date(toMillis(a.createdAt)).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "";

    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = a.paid ? "tag tag-paid" : "tag tag-free";
    badge.textContent = a.paid ? "Paid" : "Free";
    status.appendChild(badge);

    const actions = document.createElement("td");
    actions.className = "cell-actions";

    const payBtn = document.createElement("button");
    payBtn.className = "tbtn";
    payBtn.textContent = a.paid ? "Mark free" : "Mark paid";
    payBtn.addEventListener("click", () => setPaid(a, !a.paid, payBtn));

    const proBtn = document.createElement("button");
    proBtn.className = "tbtn";
    proBtn.textContent = a.pro ? "Remove Pro" : "Mark Pro";
    proBtn.addEventListener("click", () => setPro(a, !a.pro, proBtn));

    const delBtn = document.createElement("button");
    delBtn.className = "tbtn danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => removeAlbum(a, delBtn));

    actions.append(payBtn, proBtn, delBtn);
    tr.append(name, codeCell, photos, created, status, actions);
    tbody.appendChild(tr);
  }
}

async function setPaid(album, paid, btn) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "events", album.code), { paid });
    album.paid = paid;
    renderAll();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Update failed: " + (err.code || err.message));
  }
}

// Pro ($29.99) includes Party benefits, so granting Pro also marks the album paid.
async function setPro(album, pro, btn) {
  btn.disabled = true;
  try {
    const patch = pro ? { pro: true, paid: true } : { pro: false };
    await updateDoc(doc(db, "events", album.code), patch);
    album.pro = pro;
    if (pro) album.paid = true;
    renderAll();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Update failed: " + (err.code || err.message));
  }
}

async function removeAlbum(album, btn) {
  if (!confirm(`Delete "${album.name}" (${album.code})? Guests lose access immediately.`)) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "events", album.code));
    albums = albums.filter((a) => a.code !== album.code);
    renderAll();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert("Delete failed: " + (err.code || err.message));
  }
}

// ---------- layout preview (no real data) ----------
// Renders sample numbers so the design can be eyeballed without signing in.
// Never touches the database. Remove the block below to disable.
if (location.hash === "#preview") {
  const mkTs = (daysAgo) => ({ toMillis: () => Date.now() - daysAgo * 86400000 });
  albums = [
    { code: "AAA111", name: "Emily & Jake's Wedding", photoCount: 427, paid: true, createdAt: mkTs(1), hostName: "Emily", scanCount: 512, downloadCount: 208 },
    { code: "BBB222", name: "Sarah's 30th", photoCount: 188, paid: true, createdAt: mkTs(2), hostName: "Sarah", scanCount: 240, downloadCount: 74 },
    { code: "CCC333", name: "Baby Ruiz Shower", photoCount: 96, paid: false, createdAt: mkTs(3), scanCount: 88, downloadCount: 18 },
    { code: "DDD444", name: "Office Summer Party", photoCount: 61, paid: false, createdAt: mkTs(5), scanCount: 143, downloadCount: 9 },
    { code: "EEE555", name: "Graduation 2026", photoCount: 44, paid: true, createdAt: mkTs(6), scanCount: 61, downloadCount: 31 },
    { code: "FFF666", name: "Mike & Dana", photoCount: 22, paid: false, createdAt: mkTs(9), scanCount: 40, downloadCount: 4 },
    { code: "GGG777", name: "Reunion", photoCount: 12, paid: false, createdAt: mkTs(12), scanCount: 19, downloadCount: 0 }
  ];
  reports = [
    { id: "r1", albumCode: "AAA111", albumName: "Emily & Jake's Wedding", reason: "Inappropriate content", photoId: "p1", photoUrl: "", createdAt: mkTs(0) },
    { id: "r2", albumCode: "BBB222", albumName: "Sarah's 30th", reason: "Poor quality", photoId: "p2", photoUrl: "", createdAt: mkTs(1) }
  ];
  gateView.style.display = "none";
  document.getElementById("who").textContent = "preview@snapjar";
  renderAll();
  hqView.style.display = "grid";
}
