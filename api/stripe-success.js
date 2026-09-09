const { fulfillCheckout } = require("./_lib/unlock-album");
const { paymentPage } = require("./_lib/payment-page");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).end();
  const sessionId = String(req.query?.session_id || "").trim();
  if (!/^cs_(live|test)_[a-zA-Z0-9]+$/.test(sessionId)) {
    return paymentPage(res, {
      status: 400, title: "Payment link incomplete",
      message: "Open the return link from your Stripe checkout, or contact us with your receipt so we can find your album."
    });
  }
  const retryUrl = `/api/stripe-success?session_id=${encodeURIComponent(sessionId)}`;
  try {
    const result = await fulfillCheckout(sessionId);
    if (result.ok) {
      return res.redirect(302, `/event?c=${encodeURIComponent(result.code)}&unlocked=1`);
    }
    if (result.reason === "not_paid") {
      return paymentPage(res, {
        status: 202, title: "Waiting for payment confirmation",
        message: "Your upgrade will be applied when Stripe confirms payment. If you already submitted your payment, you do not need to pay again.", retryUrl
      });
    }
    console.error("[stripe-success] fulfillment pending", { sessionId, ...result });
    return paymentPage(res, {
      status: 503, title: "We couldn't finish your upgrade",
      message: "Please contact us with your Stripe receipt so we can match the purchase to your album. You do not need to pay again.",
      retryUrl, albumCode: result.code
    });
  } catch (err) {
    console.error("[stripe-success] fulfillment failed", { sessionId, code: err.code || "fulfillment_failed" });
    return paymentPage(res, {
      status: 503, title: "Your upgrade needs another moment",
      message: "We couldn't confirm your album upgrade yet. If Stripe confirmed your payment, you do not need to pay again. Check again shortly or contact us with your receipt.", retryUrl
    });
  }
};
