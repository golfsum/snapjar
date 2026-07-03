// Snapjar sign designer. Drag-and-drop editor for printable QR table cards.
// Text sizes use cqw units (1% of the card width) so everything scales cleanly
// when the card is printed at 5in or exported at high resolution.

import { db, ensureSignedIn } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const code = new URLSearchParams(location.search).get("c");
const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");

// ---------- templates ----------
// sizes are in cqw (% of card width); positions x/y are % of the card.
const TEMPLATES = {
  rustic: {
    name: "Rustic", tag: "Warm & handwritten", bg: "#f7f3ec",
    heading: { text: "Richard & Claudia", font: "'Great Vibes', cursive", color: "#8a6d4b", size: 17, x: 50, y: 20 },
    label:   { text: "Table 17", font: "'Cormorant Garamond', serif", color: "#2f2a24", size: 13, x: 50, y: 42, bold: true },
    sub:     { text: "Scan to upload photos & videos", font: "'Cormorant Garamond', serif", color: "#8a6d4b", size: 4.4, x: 50, y: 90, caps: true },
    qr: { x: 50, y: 67, size: 44 }
  },
  modern: {
    name: "Modern", tag: "Clean & minimal", bg: "#ffffff",
    heading: { text: "EMILY & JAKE", font: "'Inter', sans-serif", color: "#111111", size: 6.5, x: 50, y: 16, bold: true, caps: true },
    label:   { text: "Table 04", font: "'Inter', sans-serif", color: "#111111", size: 13, x: 50, y: 33, bold: true },
    sub:     { text: "Scan to upload photos & videos", font: "'Inter', sans-serif", color: "#8a8a8a", size: 3.4, x: 50, y: 90, caps: true },
    qr: { x: 50, y: 63, size: 44 }
  },
  classic: {
    name: "Classic", tag: "Timeless serif", bg: "#fbfaf7",
    heading: { text: "The Wedding of", font: "'Cormorant Garamond', serif", color: "#1a1a1a", size: 5.6, x: 50, y: 15, caps: true },
    label:   { text: "Emily & Jake", font: "'Playfair Display', serif", color: "#1a1a1a", size: 11, x: 50, y: 27, bold: true },
    sub:     { text: "Scan to upload photos & videos", font: "'Playfair Display', serif", color: "#555555", size: 3.8, x: 50, y: 90, caps: true },
    qr: { x: 50, y: 63, size: 46 }
  },
  blacktie: {
    name: "Black Tie", tag: "Elegant & dark", bg: "#141b2e",
    heading: { text: "Celebrate", font: "'Great Vibes', cursive", color: "#e7c98a", size: 16, x: 50, y: 19 },
    label:   { text: "Table 4", font: "'Playfair Display', serif", color: "#ffffff", size: 12, x: 50, y: 41, bold: true },
    sub:     { text: "Scan to upload photos & videos", font: "'Inter', sans-serif", color: "#c8cede", size: 3.8, x: 50, y: 90, caps: true },
    qr: { x: 50, y: 66, size: 44 }
  },
  garden: {
    name: "Garden", tag: "Fresh & botanical", bg: "#eef3ea",
    heading: { text: "In Full Bloom", font: "'Great Vibes', cursive", color: "#5f7350", size: 16, x: 50, y: 20 },
    label:   { text: "Table 8", font: "'Cormorant Garamond', serif", color: "#354a2c", size: 12, x: 50, y: 42, bold: true },
    sub:     { text: "Scan to upload photos & videos", font: "'Cormorant Garamond', serif", color: "#5f7350", size: 4.2, x: 50, y: 90, caps: true },
    qr: { x: 50, y: 67, size: 44 }
  },
  coastal: {
    name: "Coastal", tag: "Soft & seaside", bg: "#eef3f7",
    heading: { text: "By the Sea", font: "'Great Vibes', cursive", color: "#3a6b8a", size: 16, x: 50, y: 20 },
    label:   { text: "Table 6", font: "'Cormorant Garamond', serif", color: "#243d4e", size: 12, x: 50, y: 42, bold: true },
    sub:     { text: "Scan to upload photos & videos", font: "'Cormorant Garamond', serif", color: "#3a6b8a", size: 4.2, x: 50, y: 90, caps: true },
    qr: { x: 50, y: 67, size: 44 }
  }
};

let els = [];              // active elements
let selected = null;       // selected element object
let bgImage = null;        // data URL of background photo, or null
let qrDataUrl = "";        // generated QR image
let albumUrl = code ? `${location.origin}/event?c=${code}` : `${location.origin}`;

// ---------- element rendering ----------

function applyEl(el) {
  const node = el.node;
  node.style.left = el.x + "%";
  node.style.top = el.y + "%";
  if (el.type === "text") {
    node.style.fontSize = el.size + "cqw";
    node.style.color = el.color;
    node.style.fontFamily = el.font;
    node.style.fontWeight = el.bold ? "700" : "400";
    node.style.fontStyle = el.italic ? "italic" : "normal";
    node.style.textTransform = el.caps ? "uppercase" : "none";
    node.style.letterSpacing = el.caps ? "0.12em" : "normal";
    node.style.textAlign = "center";
    if (node.firstChild?.nodeType !== 3 || node.textContent !== el.text) {
      if (document.activeElement !== node) node.textContent = el.text;
    }
  } else if (el.type === "qr") {
    node.style.width = el.size + "%";
  }
}

function makeNode(el) {
  const node = document.createElement("div");
  node.className = "el " + el.type;
  if (el.type === "text") {
    node.textContent = el.text;
  } else {
    const img = document.createElement("img");
    img.id = "qr-img";
    img.alt = "QR code";
    if (qrDataUrl) img.src = qrDataUrl;
    node.appendChild(img);
  }
  const handle = document.createElement("div");
  handle.className = "handle";
  node.appendChild(handle);

  el.node = node;
  canvas.appendChild(node);
  applyEl(el);
  wireElement(el, handle);
  return node;
}

function addTextEl(props) {
  const el = { type: "text", x: 50, y: 50, size: 6, color: "#333", font: "'Inter', sans-serif",
    bold: false, italic: false, caps: false, text: "New text", ...props };
  makeNode(el);
  els.push(el);
  return el;
}

// ---------- drag + resize ----------

function wireElement(el, handle) {
  const node = el.node;

  node.addEventListener("pointerdown", (e) => {
    if (e.target === handle) return;
    if (node.isContentEditable) return;
    e.preventDefault();
    const wasSelected = selected === el;
    selectEl(el);
    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const ox = el.x, oy = el.y;
    let moved = false;
    node.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
      el.x = clamp(ox + ((ev.clientX - startX) / rect.width) * 100, 2, 98);
      el.y = clamp(oy + ((ev.clientY - startY) / rect.height) * 100, 2, 98);
      applyEl(el);
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      // A click (no drag) on an already-selected text line opens it for editing.
      if (!moved && wasSelected && el.type === "text") startEditing(node);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
  });

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    selectEl(el);
    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const oSize = el.size;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const deltaPct = ((ev.clientX - startX) / rect.width) * 100;
      if (el.type === "text") el.size = clamp(oSize + deltaPct * 0.6, 2, 60);
      else el.size = clamp(oSize + deltaPct, 12, 90);
      applyEl(el);
      if (el === selected) syncControls();
    };
    const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });

  if (el.type === "text") {
    node.addEventListener("dblclick", () => startEditing(node));
    node.addEventListener("blur", () => {
      node.contentEditable = "false";
      el.text = node.textContent.trim();
      if (el.core === "heading") document.getElementById("f-heading").value = el.text;
      if (el.core === "label") { document.getElementById("f-label").value = el.text; regenQr(); }
      if (el.core === "sub") document.getElementById("f-sub").value = el.text;
    });
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function startEditing(node) {
  node.contentEditable = "true";
  node.focus();
  try { document.execCommand("selectAll", false, null); } catch { /* ignore */ }
}

// ---------- preview toolbar: zoom, center, grid ----------

const BASE_W = 520;
let zoom = 1;
const stageEl = document.getElementById("stage");

function applyZoom() {
  canvas.style.width = Math.round(BASE_W * zoom) + "px";
  document.getElementById("zoom-level").textContent = Math.round(zoom * 100) + "%";
}
function centerStage() {
  stageEl.scrollLeft = Math.max(0, (canvas.offsetWidth - stageEl.clientWidth) / 2);
  stageEl.scrollTop = 0;
}
document.getElementById("zoom-in").addEventListener("click", () => { zoom = clamp(zoom + 0.1, 0.4, 2); applyZoom(); });
document.getElementById("zoom-out").addEventListener("click", () => { zoom = clamp(zoom - 0.1, 0.4, 2); applyZoom(); });
document.getElementById("zoom-reset").addEventListener("click", () => { zoom = 1; applyZoom(); centerStage(); });
document.getElementById("zoom-center").addEventListener("click", centerStage);
document.getElementById("grid-toggle").addEventListener("click", (e) => {
  stageEl.classList.toggle("grid-on");
  e.currentTarget.classList.toggle("on");
});
applyZoom();

// ---------- selection + controls ----------

const elControls = document.getElementById("el-controls");
const sizeRange = document.getElementById("size-range");

function selectEl(el) {
  selected = el;
  for (const e of els) e.node.classList.toggle("selected", e === el);
  elControls.classList.remove("hidden");
  document.getElementById("text-only").style.display = el.type === "text" ? "block" : "none";
  document.getElementById("size-label").textContent = el.type === "text" ? "Font" : "QR size";
  syncControls();
}

function deselect() {
  selected = null;
  for (const e of els) e.node.classList.remove("selected");
  elControls.classList.add("hidden");
}

function syncControls() {
  if (!selected) return;
  sizeRange.value = Math.round(selected.type === "text" ? selected.size * 4 : selected.size);
  sizeRange.min = selected.type === "text" ? 8 : 12;
  sizeRange.max = selected.type === "text" ? 240 : 90;
  if (selected.type === "text") {
    document.getElementById("text-color").value = toHex(selected.color);
    document.getElementById("font-select").value = selected.font;
    document.getElementById("tg-bold").classList.toggle("on", selected.bold);
    document.getElementById("tg-italic").classList.toggle("on", selected.italic);
    document.getElementById("tg-caps").classList.toggle("on", selected.caps);
  }
}

function toHex(c) { return c && c[0] === "#" ? c : "#333333"; }

sizeRange.addEventListener("input", () => {
  if (!selected) return;
  selected.size = selected.type === "text" ? +sizeRange.value / 4 : +sizeRange.value;
  applyEl(selected);
});
document.getElementById("text-color").addEventListener("input", (e) => { if (selected) { selected.color = e.target.value; applyEl(selected); } });
document.getElementById("font-select").addEventListener("change", (e) => { if (selected) { selected.font = e.target.value; applyEl(selected); } });
document.getElementById("tg-bold").addEventListener("click", () => toggleStyle("bold"));
document.getElementById("tg-italic").addEventListener("click", () => toggleStyle("italic"));
document.getElementById("tg-caps").addEventListener("click", () => toggleStyle("caps"));
function toggleStyle(k) { if (!selected) return; selected[k] = !selected[k]; applyEl(selected); syncControls(); }

document.getElementById("del-el-btn").addEventListener("click", () => {
  if (!selected) return;
  if (selected.core) { alert("This is one of your main lines. Clear its text in the field on the left instead."); return; }
  selected.node.remove();
  els = els.filter((e) => e !== selected);
  deselect();
});

canvas.addEventListener("pointerdown", (e) => { if (e.target === canvas || e.target === overlay) deselect(); });

// ---------- panel field bindings ----------

const coreOf = (name) => els.find((e) => e.core === name);

document.getElementById("f-heading").addEventListener("input", (e) => { const el = coreOf("heading"); if (el) { el.text = e.target.value; applyEl(el); } });
document.getElementById("f-label").addEventListener("input", (e) => { const el = coreOf("label"); if (el) { el.text = e.target.value; applyEl(el); } regenQr(); });
document.getElementById("f-sub").addEventListener("input", (e) => { const el = coreOf("sub"); if (el) { el.text = e.target.value; applyEl(el); } });

// background
document.getElementById("bg-color").addEventListener("input", (e) => { if (!bgImage) canvas.style.background = e.target.value; canvas.dataset.color = e.target.value; });
document.getElementById("bg-photo-btn").addEventListener("click", () => document.getElementById("bg-file").click());
document.getElementById("bg-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { bgImage = reader.result; canvas.style.backgroundImage = `url("${bgImage}")`; document.getElementById("overlay-row").style.display = "flex"; applyFade(); };
  reader.readAsDataURL(file);
});
document.getElementById("bg-clear-btn").addEventListener("click", () => {
  bgImage = null;
  canvas.style.backgroundImage = "";
  canvas.style.background = document.getElementById("bg-color").value;
  overlay.style.background = "transparent";
  document.getElementById("overlay-row").style.display = "none";
});
document.getElementById("bg-fade").addEventListener("input", applyFade);
function applyFade() {
  const v = +document.getElementById("bg-fade").value / 100;
  overlay.style.background = `rgba(255,255,255,${v})`;
}

document.getElementById("add-text-btn").addEventListener("click", () => {
  const el = addTextEl({ text: "Your text", x: 50, y: 55, size: 6, color: "#333", font: "'Inter', sans-serif" });
  selectEl(el);
});

// ---------- QR ----------

let QRLib = null;
async function regenQr() {
  const label = document.getElementById("f-label").value.trim();
  const url = albumUrl + (label ? `&t=${encodeURIComponent(label)}` : "") + "&s=qr";
  try {
    if (!QRLib) QRLib = (await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm")).default;
    qrDataUrl = await QRLib.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: "M" });
  } catch (err) {
    console.error("QR gen failed, using fallback", err);
    qrDataUrl = "https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=4&data=" + encodeURIComponent(url);
  }
  const img = document.getElementById("qr-img");
  if (img) img.src = qrDataUrl;
}

// ---------- templates ----------

function buildTemplate(id) {
  // clear existing
  for (const e of els) e.node.remove();
  els = [];
  deselect();

  const t = TEMPLATES[id];
  canvas.dataset.tpl = id;
  bgImage = null;
  canvas.style.backgroundImage = "";
  canvas.style.background = t.bg;
  document.getElementById("card-footer").style.color = t.sub.color;
  document.getElementById("bg-color").value = t.bg.length === 7 ? t.bg : "#f7f3ec";
  overlay.style.background = "transparent";
  document.getElementById("overlay-row").style.display = "none";

  const heading = { core: "heading", type: "text", ...t.heading };
  const label = { core: "label", type: "text", ...t.label };
  const sub = { core: "sub", type: "text", ...t.sub };
  const qr = { core: "qr", type: "qr", x: t.qr.x, y: t.qr.y, size: t.qr.size };

  for (const el of [heading, label, sub]) { makeNode(el); els.push(el); }
  makeNode(qr); els.push(qr);

  document.getElementById("f-heading").value = heading.text;
  document.getElementById("f-label").value = label.text;
  document.getElementById("f-sub").value = sub.text;

  for (const b of document.querySelectorAll(".tpl")) b.classList.toggle("active", b.dataset.tpl === id);
  regenQr();
}

// template picker
const tplGrid = document.getElementById("tpl-grid");
for (const [id, t] of Object.entries(TEMPLATES)) {
  const b = document.createElement("div");
  b.className = "tpl";
  b.dataset.tpl = id;
  b.style.background = t.bg;
  b.style.color = t.label.color;
  b.innerHTML = `<span class="tpl-name" style="font-family:${t.heading.font}">${t.name}</span><span class="tpl-tag">${t.tag}</span>`;
  b.addEventListener("click", () => buildTemplate(id));
  tplGrid.appendChild(b);
}

// ---------- print + export ----------

document.getElementById("print-btn").addEventListener("click", () => { deselect(); setTimeout(() => window.print(), 60); });

document.getElementById("download-btn").addEventListener("click", async () => {
  deselect();
  const btn = document.getElementById("download-btn");
  const old = btn.textContent; btn.textContent = "Rendering...";
  try {
    const h2c = (await import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm")).default;
    const out = await h2c(canvas, { scale: 3, backgroundColor: null, useCORS: true, logging: false });
    const link = document.createElement("a");
    link.download = `snapjar-sign-${(document.getElementById("f-label").value || "card").replace(/[^a-z0-9]+/gi, "-")}.png`;
    link.href = out.toDataURL("image/png");
    document.body.appendChild(link); link.click(); link.remove();
  } catch (err) {
    console.error("export failed", err);
    alert("Couldn't build the image. You can still use Print and choose Save as PDF.");
  }
  btn.textContent = old;
});

// ---------- init ----------

document.getElementById("back-btn").href = code ? `/event?c=${code}` : "/albums";

(async function init() {
  buildTemplate("rustic");
  try {
    await ensureSignedIn();
    if (code) {
      const snap = await getDoc(doc(db, "events", code));
      if (snap.exists()) {
        const data = snap.data();
        const heading = coreOf("heading");
        if (heading && data.name) { heading.text = data.name; applyEl(heading); document.getElementById("f-heading").value = data.name; }
        // Paid albums get watermark-free signs.
        if (data.paid) document.getElementById("card-footer").classList.add("hidden");
      }
    }
  } catch (err) { console.error(err); }
  regenQr();
})();
