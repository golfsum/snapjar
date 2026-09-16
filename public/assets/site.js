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
    try {
      const [{ auth, db, ensureSignedIn }, { isAdminUser }, firestore] = await Promise.all([
        import("./firebase-init.js"),
        import("./config.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
      ]);
      const user = await ensureSignedIn();
      if (isAdminUser(user)) return;

      const code = new URLSearchParams(location.search).get("c");
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
