// Table QR Manager (Pro feature). Lists tables, generates a QR sign for each
// one (tagged with the table label), and prints them all, one per page.

import { db, ensureSignedIn } from "./firebase-init.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { proUpgradeUrlFor, PRO_PRICE } from "./config.js";

const code = new URLSearchParams(location.search).get("c");
document.getElementById("back-btn").href = code ? `/event?c=${code}` : "/albums";

let eventData = null;
let tables = [];
let style = "ivory";
const qrCache = new Map();
let QRLib = null;

init();

async function init() {
  if (!code) return showUpsellOrError();
  try {
    await ensureSignedIn();
    const snap = await getDoc(doc(db, "events", code));
    if (!snap.exists()) return fail("We couldn't find that album.");
    eventData = snap.data();

    document.getElementById("loading").style.display = "none";

    if (!eventData.pro) {
      const btn = document.getElementById("upsell-btn");
      btn.href = proUpgradeUrlFor(code);
      btn.textContent = `Unlock Pro, $${PRO_PRICE} one time`;
      document.getElementById("upsell").style.display = "block";
      return;
    }

    // Pro: show the manager
    tables = Array.isArray(eventData.tables) ? eventData.tables.slice() : [];
    document.getElementById("album-line").textContent =
      `${eventData.name} · signs point to this album`;
    document.getElementById("manager").style.display = "block";
    document.getElementById("print-btn").hidden = false;
    wireControls();
    render();
  } catch (err) {
    console.error(err);
    fail("Something went wrong loading this album.");
  }
}

function fail(msg) {
  document.getElementById("loading").textContent = msg;
}
function showUpsellOrError() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("upsell").style.display = "block";
}

function wireControls() {
  document.getElementById("range-add").addEventListener("click", () => {
    const n = Math.min(200, Math.max(1, parseInt(document.getElementById("range-to").value, 10) || 0));
    for (let i = 1; i <= n; i++) addTable(`Table ${i}`, true);
    persistAndRender();
  });
  document.getElementById("custom-add").addEventListener("click", addCustom);
  document.getElementById("custom-label").addEventListener("keydown", (e) => { if (e.key === "Enter") addCustom(); });
  document.getElementById("style-select").addEventListener("change", (e) => { style = e.target.value; render(); });
  document.getElementById("print-btn").addEventListener("click", () => window.print());
}

function addCustom() {
  const input = document.getElementById("custom-label");
  const v = input.value.trim().slice(0, 30);
  if (!v) return;
  addTable(v, false);
  input.value = "";
  persistAndRender();
}

function addTable(label, quiet) {
  if (tables.some((t) => t.toLowerCase() === label.toLowerCase())) return;
  tables.push(label);
}

function removeTable(label) {
  tables = tables.filter((t) => t !== label);
  persistAndRender();
}

async function persistAndRender() {
  render();
  try { await updateDoc(doc(db, "events", code), { tables }); }
  catch (err) { console.error("couldn't save table list", err); }
}

// ---------- QR ----------

async function qrFor(label) {
  if (qrCache.has(label)) return qrCache.get(label);
  const url = `${location.origin}/event?c=${code}&t=${encodeURIComponent(label)}&s=qr`;
  let dataUrl;
  try {
    if (!QRLib) QRLib = (await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm")).default;
    dataUrl = await QRLib.toDataURL(url, { margin: 1, width: 500, errorCorrectionLevel: "M" });
  } catch (err) {
    console.error("qr failed", err);
    dataUrl = "https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=4&data=" + encodeURIComponent(url);
  }
  qrCache.set(label, dataUrl);
  return dataUrl;
}

// ---------- render ----------

function render() {
  renderChips();
  document.getElementById("tm-count").textContent =
    tables.length ? `${tables.length} sign${tables.length === 1 ? "" : "s"} ready to print` : "";
  renderCards();
}

function renderChips() {
  const wrap = document.getElementById("table-chips");
  wrap.textContent = "";
  if (!tables.length) {
    wrap.innerHTML = `<span class="tm-chip empty">No signs yet. Use Quick add above to start.</span>`;
    return;
  }
  for (const label of tables) {
    const chip = document.createElement("span");
    chip.className = "tm-chip";
    const txt = document.createElement("span");
    txt.textContent = label;
    const x = document.createElement("button");
    x.type = "button";
    x.innerHTML = "&times;";
    x.title = "Remove";
    x.addEventListener("click", () => removeTable(label));
    chip.append(txt, x);
    wrap.appendChild(chip);
  }
}

async function renderCards() {
  const grid = document.getElementById("tcards");
  grid.textContent = "";
  const name = eventData.name || "Our Celebration";

  for (const label of tables) {
    const card = document.createElement("div");
    card.className = "tcard " + style;
    card.innerHTML =
      `<div class="tc-head">${escapeHtml(name)}</div>` +
      `<div class="tc-mid">` +
        `<div class="tc-label">${escapeHtml(label)}</div>` +
        `<div class="tc-qr"><img alt="QR for ${escapeHtml(label)}"></div>` +
      `</div>` +
      `<div class="tc-scan">Scan to upload photos &amp; videos</div>`;
    grid.appendChild(card);
    // fill QR async
    qrFor(label).then((src) => { const img = card.querySelector("img"); if (img) img.src = src; });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
