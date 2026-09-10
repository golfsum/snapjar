(async function () {
  "use strict";

  const MEASUREMENT_ID = "G-V22WH9DVT5";
  const path = window.location.pathname.replace(/\.html$/, "") || "/";

  // Keep owner-only dashboard activity out of acquisition and conversion data.
  if (path === "/dashboard-q7x2m9" || path === "/admin-q7x2m9") return;

  // Album pages must resolve the persisted account before analytics starts.
  // Do not create an anonymous account just to decide whether to track.
  if (path === "/event") {
    try {
      const [{ auth }, { isAdminUser }] = await Promise.all([
        import("./firebase-init.js"), import("./config.js")
      ]);
      await auth.authStateReady();
      if (isAdminUser(auth.currentUser)) return;
    } catch { return; }
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
