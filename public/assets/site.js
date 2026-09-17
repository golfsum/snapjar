(async function () {
  "use strict";

  const MEASUREMENT_ID = "G-V22WH9DVT5";
  const path = window.location.pathname.replace(/\.html$/, "") || "/";
  let currentEventPlan = null;

  // Keep owner-only dashboard activity out of acquisition and conversion data.
  if (path === "/dashboard-q7x2m9" || path === "/admin-q7x2m9") return;

  // Keep the homepage plan cards aligned with the product limits.
  if (path === "/") {
    const lede = document.querySelector(".hero .lede");
    if (lede) lede.textContent = "Snapjar fixes that. Put a QR code on the tables, guests scan it, and every photo they take lands in one shared album. Paid albums can collect videos too. Nobody downloads an app. Works on every phone.";
    const strip = document.querySelector(".strip p");
    if (strip) strip.innerHTML = "No app to install &nbsp;·&nbsp; No accounts for guests &nbsp;·&nbsp; Photos + paid video sharing &nbsp;·&nbsp; You keep everything";
    const planEls = [...document.querySelectorAll("#pricing .plan")];
    for (const plan of planEls) {
      const name = plan.querySelector("h3")?.textContent?.trim();
      const list = plan.querySelector("ul");
      if (!list) continue;
      if (name === "Free") list.innerHTML = "<li>1 event album</li><li>Up to 25 photos</li><li>Photos only</li><li>QR code included</li><li>Gallery stays up 7 days</li>";
      if (name === "Party") list.innerHTML = "<li>Unlimited photos</li><li>Videos up to 1 minute each</li><li>Unlimited guests</li><li>Gallery stays up 1 year</li><li>Download everything in one click</li><li>Printable QR sign designer</li>";
      if (name === "Pro") list.innerHTML = "<li>Everything in Party</li><li>Videos up to 5 minutes each</li><li>Table QR Manager</li><li>A personalized QR sign for every table</li><li>Print all your table signs at once</li><li>Photos auto-tagged by table</li>";
    }
  }

  // Album pages resolve the real Firebase identity before analytics or access
  // history. A successfully opened album is remembered only for that uid.
  if (path === "/event") {
    const initialParams = new URLSearchParams(location.search);
    const initialCode = initialParams.get("c") || "";
    const qrZone = (initialParams.get("t") || "").trim().slice(0, 60);

    // Preserve table/zone separately from the guest profile. Older event.js
    // treated ?t=Table 7 as the uploader name. Strip it before that module runs
    // and keep the zone for metadata tagging below.
    if (initialCode && qrZone) {
      try { sessionStorage.setItem(`snapjar_zone:${initialCode}`, qrZone); } catch { /* ignore */ }
      initialParams.delete("t");
      const qs = initialParams.toString();
      history.replaceState(null, "", `${location.pathname}${qs ? "?" + qs : ""}${location.hash}`);
    }

    try {
      const [{ auth, db, ensureSignedIn }, { isAdminUser }, firestore] = await Promise.all([
        import("./firebase-init.js"),
        import("./config.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
      ]);
      const user = await ensureSignedIn();
      if (isAdminUser(user)) return;

      const code = initialCode || new URLSearchParams(location.search).get("c");
      let eventZone = qrZone;
      if (!eventZone && code) {
        try { eventZone = sessionStorage.getItem(`snapjar_zone:${code}`) || ""; } catch { eventZone = ""; }
      }

      if (code) {
        const snap = await firestore.getDoc(firestore.doc(db, "events", code));
        if (snap.exists()) {
          currentEventPlan = snap.data();
          const key = `snapjar_visited:${user.uid}`;
          let list = [];
          try {
            const value = JSON.parse(localStorage.getItem(key) || "[]");
            list = Array.isArray(value) ? value : [];
          } catch { list = []; }
          list = list.filter((item) => item?.code !== code);
          list.unshift({ code, name: snap.data().name || code, at: new Date().toISOString() });
          try { localStorage.setItem(key, JSON.stringify(list.slice(0, 30))); } catch { /* private mode */ }

          setupAlbumFilters({ user, db, firestore, code, eventZone, eventData: snap.data() });
        }
      }
    } catch { return; }

    // Intercept video selections before event.js uploads them. Photos pass
    // through untouched. Valid videos are re-dispatched to the normal uploader.
    document.addEventListener("change", async function videoPlanGuard(event) {
      const input = event.target;
      if (!input || input.id !== "file-input") return;
      if (input.dataset.videoValidated === "1") {
        delete input.dataset.videoValidated;
        return;
      }

      const files = [...(input.files || [])];
      const videos = files.filter((file) => (file.type || "").startsWith("video/"));
      if (!videos.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!currentEventPlan?.paid) {
        input.value = "";
        alert("Video uploads are available on paid Snapjar albums. Party supports clips up to 1 minute and Pro supports clips up to 5 minutes.");
        return;
      }

      const isPro = !!currentEventPlan.pro;
      const maxSeconds = isPro ? 300 : 60;
      const maxBytes = (isPro ? 300 : 100) * 1024 * 1024;

      try {
        for (const file of videos) {
          if (file.size > maxBytes) {
            throw new Error(`${isPro ? "Pro" : "Party"} videos must be under ${isPro ? 300 : 100} MB each.`);
          }
          const duration = await videoDuration(file);
          if (!Number.isFinite(duration) || duration <= 0) throw new Error("We couldn't read that video's duration. Try a standard MP4 or MOV file.");
          if (duration > maxSeconds + 0.5) {
            throw new Error(`${isPro ? "Pro" : "Party"} videos can be up to ${isPro ? "5 minutes" : "1 minute"} each.`);
          }
        }

        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        input.files = transfer.files;
        input.dataset.videoValidated = "1";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (err) {
        input.value = "";
        alert(err?.message || "That video doesn't fit this album's plan.");
      }
    }, true);
  }

  function setupAlbumFilters({ user, db, firestore, code, eventZone, eventData }) {
    const gallery = document.getElementById("gallery");
    const filterbar = document.querySelector(".filterbar");
    if (!gallery || !filterbar) return;

    const creatorSelect = document.createElement("select");
    creatorSelect.id = "creator-filter";
    creatorSelect.className = "sort-select";
    creatorSelect.setAttribute("aria-label", "Filter by creator");
    creatorSelect.innerHTML = '<option value="">All creators</option>';

    const zoneSelect = document.createElement("select");
    zoneSelect.id = "zone-filter";
    zoneSelect.className = "sort-select";
    zoneSelect.setAttribute("aria-label", "Filter by table or zone");
    zoneSelect.innerHTML = '<option value="">All tables / zones</option>';

    const searchBox = filterbar.querySelector(".search-box");
    if (searchBox) {
      filterbar.insertBefore(creatorSelect, searchBox);
      filterbar.insertBefore(zoneSelect, searchBox);
    } else {
      filterbar.append(creatorSelect, zoneSelect);
    }

    const style = document.createElement("style");
    style.textContent = `
      .zone-badge{position:absolute;left:8px;bottom:8px;z-index:3;background:rgba(16,24,40,.82);color:#fff;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700;line-height:1.2;max-width:calc(100% - 16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:760px){#creator-filter,#zone-filter{max-width:100%;min-width:0;flex:1 1 145px}.filterbar{gap:8px;flex-wrap:wrap}}
    `;
    document.head.appendChild(style);

    const photos = new Map();
    let initialized = false;
    let applyQueued = false;

    const tableLabels = new Set();
    const tables = Array.isArray(eventData?.tables) ? eventData.tables : [];
    for (const table of tables) {
      if (typeof table === "string") tableLabels.add(table.trim());
      else if (table && typeof table === "object") {
        const label = String(table.label || table.name || table.title || "").trim();
        if (label) tableLabels.add(label);
      }
    }

    function legacyZone(data) {
      if (data?.zone) return String(data.zone).trim();
      const name = String(data?.uploaderName || "").trim();
      if (!name) return "";
      if (tableLabels.has(name)) return name;
      if (/^(table|zone|booth|room|area)\b/i.test(name)) return name;
      return "";
    }

    function creatorFor(data) {
      const name = String(data?.uploaderName || "").trim();
      if (!data?.zone && legacyZone(data) && legacyZone(data) === name) return "";
      return name;
    }

    function zoneFor(data) {
      return String(data?.zone || legacyZone(data) || "").trim();
    }

    function refillSelect(select, firstLabel, values) {
      const prior = select.value;
      select.textContent = "";
      const first = document.createElement("option");
      first.value = "";
      first.textContent = firstLabel;
      select.appendChild(first);
      for (const value of [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      }
      if ([...select.options].some((o) => o.value === prior)) select.value = prior;
    }

    function refreshOptions() {
      const creators = new Set();
      const zones = new Set();
      for (const data of photos.values()) {
        const creator = creatorFor(data);
        const zone = zoneFor(data);
        if (creator) creators.add(creator);
        if (zone) zones.add(zone);
      }
      refillSelect(creatorSelect, "All creators", creators);
      refillSelect(zoneSelect, "All tables / zones", zones);
    }

    function matchDataByUrl(url) {
      if (!url) return null;
      for (const data of photos.values()) {
        if (data?.url === url) return data;
      }
      return null;
    }

    function queueApply() {
      if (applyQueued) return;
      applyQueued = true;
      requestAnimationFrame(() => {
        applyQueued = false;
        applyFilters();
      });
    }

    function applyFilters() {
      const creatorWanted = creatorSelect.value;
      const zoneWanted = zoneSelect.value;

      for (const item of gallery.querySelectorAll(".gallery-item")) {
        const media = item.querySelector("img,video");
        const data = matchDataByUrl(media?.src || "");
        if (!data) {
          item.style.display = "";
          continue;
        }

        const creator = creatorFor(data);
        const zone = zoneFor(data);
        const show = (!creatorWanted || creator === creatorWanted) && (!zoneWanted || zone === zoneWanted);
        item.style.display = show ? "" : "none";

        let badge = item.querySelector(".zone-badge");
        if (zone) {
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "zone-badge";
            item.appendChild(badge);
          }
          badge.textContent = zone;
          badge.style.display = show ? "" : "none";
        } else if (badge) {
          badge.remove();
        }
      }

      for (const group of gallery.querySelectorAll(".gallery-group")) {
        const visible = [...group.querySelectorAll(".gallery-item")].some((item) => item.style.display !== "none");
        group.style.display = visible ? "" : "none";
      }
    }

    creatorSelect.addEventListener("change", applyFilters);
    zoneSelect.addEventListener("change", applyFilters);

    const observer = new MutationObserver(queueApply);
    observer.observe(gallery, { childList: true, subtree: true });

    const q = firestore.query(
      firestore.collection(db, "events", code, "photos"),
      firestore.orderBy("createdAt", "desc")
    );

    firestore.onSnapshot(q, (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === "removed") {
          photos.delete(change.doc.id);
          continue;
        }

        const data = change.doc.data({ serverTimestamps: "estimate" });
        photos.set(change.doc.id, data);

        // New uploads from a QR zone get a separate zone field. This keeps
        // "created by Sarah" and "Table 7" independently filterable.
        if (initialized && eventZone && data?.uploaderUid === user.uid && !data?.zone) {
          firestore.updateDoc(change.doc.ref, { zone: eventZone, zoneSource: "qr" }).catch((err) => {
            console.warn("Snapjar zone tag could not be saved", err);
          });
        }
      }

      initialized = true;
      refreshOptions();
      queueApply();
    }, (err) => console.warn("Snapjar album filters unavailable", err));
  }

  function videoDuration(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = video.duration;
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("We couldn't read that video's duration. Try a standard MP4 or MOV file."));
      };
      video.src = url;
    });
  }

  function cleanUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return url.origin + url.pathname.replace(/\.html$/, "");
    } catch {
      return window.location.origin + path;
    }
  }

  function pageType() {
    if (path === "/") return "home";
    if (["/create", "/albums", "/event", "/design", "/settings", "/tables"].includes(path)) return "product";
    if (["/contact", "/privacy", "/terms"].includes(path)) return "company";
    return "seo_landing_page";
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    page_location: cleanUrl(window.location.href),
    page_referrer: document.referrer ? cleanUrl(document.referrer) : "",
    content_group: pageType(),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_flags: "SameSite=None;Secure"
  });

  const loader = document.createElement("script");
  loader.async = true;
  loader.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
  document.head.appendChild(loader);

  function safeParams(params) {
    const safe = { page_type: pageType() };
    for (const [key, value] of Object.entries(params || {})) {
      // Album codes grant access to private albums. Never send them, names,
      // emails, URLs, or referrers to Analytics.
      if (/album|code|email|name|url|link|referrer/i.test(key)) continue;
      if (typeof value === "number" || typeof value === "boolean") safe[key] = value;
      if (typeof value === "string") safe[key] = value.slice(0, 100);
      if (Array.isArray(value)) safe[key] = value;
    }
    return safe;
  }

  window.snapjarTrack = function (name, params) {
    const eventName = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^[^a-z]+/, "")
      .slice(0, 40);
    if (!eventName) return;
    window.gtag("event", eventName, safeParams(params));
  };

  document.addEventListener("click", function (event) {
    const target = event.target.closest("a,button");
    if (!target) return;

    let href = "";
    if (target.tagName === "A") {
      try { href = new URL(target.href, window.location.origin).pathname; } catch { href = ""; }
    }

    if (href.replace(/\.html$/, "") === "/create" && pageType() !== "product") {
      window.snapjarTrack("seo_cta_click", { destination: "create", source_page: path });
    }

    if (href === "/api/checkout") {
      let plan = "party";
      try { plan = new URL(target.href).searchParams.get("plan") || plan; } catch { /* use default */ }
      const value = plan === "pro" ? 29.99 : 19.99;
      window.snapjarTrack("begin_checkout", {
        currency: "USD",
        value,
        plan,
        items: [{ item_id: plan, item_name: "Snapjar " + plan, price: value, quantity: 1 }]
      });
    }

    if (["share-btn", "rail-sharelink", "share-native", "share-copy", "set-share"].includes(target.id)) {
      window.snapjarTrack("share", { method: target.id, content_type: "album" });
    }

    if (["rail-download-qr", "share-download-qr"].includes(target.id)) {
      window.snapjarTrack("qr_code_download", { placement: target.id });
    }
  });

  document.addEventListener("submit", function (event) {
    if (event.target && event.target.id === "create-form") {
      window.snapjarTrack("create_album_start", { source_page: path });
    }
  });
})();
