function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function paymentPage(res, { status, title, message, retryUrl, albumCode }) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Referrer-Policy", "no-referrer");
  const albumUrl = albumCode ? `/event?c=${encodeURIComponent(albumCode)}` : "/albums";
  res.status(status).send(`<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>${escapeHtml(title)} · Snapjar</title>
    <script src="/assets/analytics.js" defer></script>
    <style>body{margin:0;background:#fafaf7;color:#243b32;font:17px/1.6 system-ui,sans-serif}main{max-width:520px;margin:12vh auto;padding:32px}h1{font-size:30px;line-height:1.2}a{color:#176347}nav{display:flex;gap:24px;flex-wrap:wrap;margin:28px 0}.brand{font-weight:700;font-size:24px}</style>
    </head><body><main><a class="brand" href="/">Snapjar</a>
    <h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
    <nav>${retryUrl ? `<a href="${escapeHtml(retryUrl)}">Check again</a>` : ""}<a href="${escapeHtml(albumUrl)}">Back to album${albumCode ? "" : "s"}</a></nav>
    <p>Need help? <a href="mailto:support@getsnapjar.com">support@getsnapjar.com</a>${albumCode ? `<br>Album: ${escapeHtml(albumCode)}` : ""}</p>
    </main></body></html>`);
}

module.exports = { paymentPage };
