const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return admin;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    const cred = JSON.parse(json);
    if (typeof cred.private_key === "string") {
      cred.private_key = cred.private_key.replace(/\\n/g, "\n");
    }
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "snapjar-d8489";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
    return admin;
  }

  throw new Error("Firebase admin credentials are missing.");
}

module.exports = { initAdmin };
