const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { randomBytes } = require("node:crypto");
const Stripe = require("stripe");

// Deliberately non-working API key: all Stripe API calls below are simulated.
const testKey = "sk_test_" + randomBytes(16).toString("hex");
const signingSecret = "whsec_" + randomBytes(24).toString("hex");
const signatureClient = new Stripe(testKey);
let albums, sessions, updates, readError, writeError, linkError, tail;
const db = {
  doc(path) {
    return { path, async get() {
      if (readError) throw new Error("database_unavailable");
      const value = albums.get(path);
      return { exists: !!value, data: () => structuredClone(value) };
    }};
  },
  runTransaction(fn) {
    const job = tail.then(async () => {
      const writes = [];
      const result = await fn({
        get: (ref) => ref.get(),
        update: (ref, patch) => writes.push([ref.path, patch])
      });
      if (writeError) throw new Error("database_unavailable");
      for (const [path, patch] of writes) {
        albums.set(path, { ...albums.get(path), ...patch });
        updates++;
      }
      return result;
    });
    tail = job.catch(() => {});
    return job;
  }
};
const firebase = require("../api/_lib/firebase");
firebase.getDatabase = () => db;
firebase.FieldValue = { serverTimestamp: () => "timestamp" };
const payments = require("../api/_lib/payments");
payments.stripeClient = () => {
  payments.paymentConfig();
  return {
    webhooks: signatureClient.webhooks,
    checkout: { sessions: { async retrieve(id) {
      if (!sessions.has(id)) throw new Error("stripe_session_not_found");
      return structuredClone(sessions.get(id));
    }}},
    paymentLinks: { async retrieve(id) {
      if (linkError) throw new Error("payment_link_unavailable");
      return { id, active: true, livemode: false, url: "https://buy.stripe.com/testLink" };
    }}
  };
};
const { unlockAlbumFromSession } = require("../api/_lib/unlock-album");
const webhook = require("../api/stripe-webhook");
const success = require("../api/stripe-success");
const checkout = require("../api/checkout");
const originalEnv = { ...process.env };

test("Firebase federation uses the configured provider and rejects mismatched accounts", () => {
  const env = {
    FIREBASE_PROJECT_ID: "example-project",
    FIREBASE_CLIENT_EMAIL: "payments@example-project.iam.gserviceaccount.com",
    GOOGLE_WORKLOAD_IDENTITY_PROVIDER: "projects/123456/locations/global/workloadIdentityPools/vercel/providers/vercel"
  };
  const settings = firebase.databaseSettings(env);
  assert.equal(settings.projectId, env.FIREBASE_PROJECT_ID);
  assert.ok(settings.authClient);
  assert.equal(settings.credentials, undefined);
  assert.throws(() => firebase.databaseSettings({ ...env, FIREBASE_CLIENT_EMAIL: "payments@other-project.iam.gserviceaccount.com" }));
  assert.throws(() => firebase.databaseSettings({ ...env, GOOGLE_WORKLOAD_IDENTITY_PROVIDER: "https://untrusted.example" }));
  assert.throws(() => firebase.databaseSettings({ FIREBASE_PROJECT_ID: "example-project" }));
});

function session(overrides = {}) {
  return { id: "cs_test_party1", payment_status: "paid", status: "complete", mode: "payment", livemode: false,
    payment_link: "plink_party", amount_total: 1999, currency: "usd", client_reference_id: "ABC234",
    payment_intent: "pi_party1", ...overrides };
}
function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; },
    redirect(code, location) { this.statusCode = code; this.headers.Location = location; return this; }
  };
}
async function delivery(s, { type = "checkout.session.completed", corrupt = false, parsed = false, eventMode = false } = {}) {
  sessions.set(s.id, s);
  const payload = JSON.stringify({ id: "evt_fixture", type, livemode: eventMode, data: { object: { id: s.id } } });
  const header = signatureClient.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
  const req = Readable.from([Buffer.from(payload + (corrupt ? " " : ""))]);
  req.method = "POST";
  req.headers = { "stripe-signature": header };
  if (parsed) req.body = JSON.parse(payload);
  const res = response();
  await webhook(req, res);
  return res;
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = testKey;
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret;
  process.env.STRIPE_PARTY_PAYMENT_LINK_ID = "plink_party";
  process.env.STRIPE_PRO_PAYMENT_LINK_ID = "plink_pro";
  delete process.env.VERCEL_ENV;
  albums = new Map([["events/ABC234", { name: "Test album", paid: false, photoCount: 0 }]]);
  sessions = new Map(); updates = 0; readError = false; writeError = false; linkError = false; tail = Promise.resolve();
});
after(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

test("signed Party webhook upgrades the referenced album without a browser return", async () => {
  const res = await delivery(session());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(albums.get("events/ABC234").paid, true);
  assert.equal(albums.get("events/ABC234").pro, undefined);
  assert.equal(albums.get("events/ABC234").stripeSessionId, "cs_test_party1");
});
test("Pro comes from the configured Stripe link even when discounted", async () => {
  await delivery(session({ payment_link: "plink_pro", amount_total: 1999 }));
  assert.equal(albums.get("events/ABC234").pro, true);
});
test("tax or a larger Party total does not accidentally grant Pro", async () => {
  await delivery(session({ amount_total: 3999 }));
  assert.equal(albums.get("events/ABC234").pro, undefined);
});
test("concurrent duplicate fulfillment performs one write", async () => {
  await Promise.all(Array.from({ length: 8 }, () => unlockAlbumFromSession(session())));
  assert.equal(updates, 1);
});
test("late Party delivery preserves Pro and its payment reference", async () => {
  await delivery(session());
  await delivery(session({ id: "cs_test_pro2", payment_link: "plink_pro", payment_intent: "pi_pro2" }));
  await delivery(session());
  assert.equal(albums.get("events/ABC234").pro, true);
  assert.equal(albums.get("events/ABC234").stripeSessionId, "cs_test_pro2");
  assert.equal(updates, 2);
});
test("manual Pro remains Pro when its Party payment is reconciled", async () => {
  albums.set("events/ABC234", { paid: true, pro: true });
  await delivery(session());
  assert.equal(albums.get("events/ABC234").pro, true);
});
test("pending payment waits until async success arrives", async () => {
  const pending = await delivery(session({ payment_status: "unpaid" }));
  assert.equal(pending.statusCode, 200);
  assert.equal(updates, 0);
  await delivery(session(), { type: "checkout.session.async_payment_succeeded" });
  assert.equal(albums.get("events/ABC234").paid, true);
});
test("missing album reference stays failed for Stripe retries", async () => {
  const res = await delivery(session({ client_reference_id: null }));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.reason, "no_album_code");
  assert.equal(updates, 0);
});
test("missing album stays failed for Stripe retries", async () => {
  albums.clear();
  const res = await delivery(session());
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.reason, "album_missing");
});
test("database write failure is not acknowledged; retry recovers", async () => {
  writeError = true;
  assert.equal((await delivery(session())).statusCode, 500);
  assert.equal(albums.get("events/ABC234").paid, false);
  writeError = false;
  assert.equal((await delivery(session())).statusCode, 200);
  assert.equal(albums.get("events/ABC234").paid, true);
});
test("a modified body or parsed JSON is rejected before fulfillment", async () => {
  assert.equal((await delivery(session(), { corrupt: true })).statusCode, 400);
  assert.equal((await delivery(session(), { parsed: true })).statusCode, 400);
  assert.equal(updates, 0);
});
test("unknown products, subscriptions, and wrong-mode sessions cannot grant access", async () => {
  for (const change of [{ payment_link: "plink_other" }, { mode: "subscription" }, { livemode: true }]) {
    await delivery(session(change));
  }
  assert.equal(updates, 0);
  assert.equal((await delivery(session(), { eventMode: true })).statusCode, 400);
});
test("unrelated event types are ignored", async () => {
  const res = await delivery(session(), { type: "charge.succeeded" });
  assert.equal(res.statusCode, 200);
  assert.equal(updates, 0);
});
test("missing configuration and test keys in production fail closed", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal((await delivery(session())).statusCode, 503);
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret;
  process.env.VERCEL_ENV = "production";
  assert.equal((await delivery(session())).statusCode, 503);
  assert.equal(updates, 0);
});
test("return page fulfills and redirects only after database success", async () => {
  sessions.set("cs_test_party1", session());
  const res = response();
  await success({ method: "GET", query: { session_id: "cs_test_party1" } }, res);
  assert.equal(res.headers.Location, "/event?c=ABC234&unlocked=1");
  assert.equal(albums.get("events/ABC234").paid, true);
});
test("return page cannot show success on database failure", async () => {
  sessions.set("cs_test_party1", session()); writeError = true;
  const res = response();
  await success({ method: "GET", query: { session_id: "cs_test_party1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers.Location, undefined);
  assert.match(res.body, /do not need to pay again/);
});
test("unpaid return shows processing rather than unlocked", async () => {
  sessions.set("cs_test_party1", session({ payment_status: "unpaid" }));
  const res = response();
  await success({ method: "GET", query: { session_id: "cs_test_party1" } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.headers.Location, undefined);
  assert.equal(updates, 0);
});
test("invalid return input cannot enter HTML or trigger a Stripe call", async () => {
  const res = response();
  await success({ method: "GET", query: { session_id: '<script>alert(1)</script>' } }, res);
  assert.equal(res.statusCode, 400);
  assert.doesNotMatch(res.body, /<script>/);
});
test("checkout forwards the normalized album code to the selected payment link", async () => {
  const res = response();
  await checkout({ method: "GET", query: { c: "abc234", plan: "party" } }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(new URL(res.headers.Location).searchParams.get("client_reference_id"), "ABC234");
  assert.equal(res.headers["Cache-Control"], "no-store");
});
test("checkout does not send customers to pay with missing configuration", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const res = response();
  await checkout({ method: "GET", query: { c: "ABC234", plan: "party" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers.Location, undefined);
});
test("checkout does not send customers to pay when Firebase or Stripe is unavailable", async () => {
  for (const failure of ["firebase", "stripe"]) {
    readError = failure === "firebase"; linkError = failure === "stripe";
    const res = response();
    await checkout({ method: "GET", query: { c: "ABC234", plan: "party" } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers.Location, undefined);
  }
});
test("checkout rejects missing albums and avoids charging for an existing upgrade", async () => {
  const missing = response();
  await checkout({ method: "GET", query: { c: "AAAAAA", plan: "party" } }, missing);
  assert.equal(missing.statusCode, 404);
  albums.set("events/ABC234", { paid: true, pro: true });
  const existing = response();
  await checkout({ method: "GET", query: { c: "ABC234", plan: "pro" } }, existing);
  assert.equal(existing.headers.Location, "/event?c=ABC234");
});

test("production build refuses missing credentials without printing secrets", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(process.execPath, ["scripts/check-payment-config.js"], {
    cwd: require("node:path").resolve(__dirname, ".."),
    env: { ...process.env, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "" }, encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configuration is incomplete/);
  assert.doesNotMatch(result.stderr, new RegExp(signingSecret));
});

