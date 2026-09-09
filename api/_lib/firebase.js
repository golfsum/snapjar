const { Firestore, FieldValue } = require("@google-cloud/firestore");
const { ExternalAccountClient } = require("google-auth-library");
const { getVercelOidcToken } = require("@vercel/oidc");

let database;

function databaseSettings(env = process.env) {
  const projectId = env.FIREBASE_PROJECT_ID || "snapjar-d8489";
  const provider = env.GOOGLE_WORKLOAD_IDENTITY_PROVIDER;
  if (provider) {
    if (!/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/.test(provider)) {
      throw new Error("Invalid Google identity provider.");
    }
    const email = env.FIREBASE_CLIENT_EMAIL;
    if (!email || !email.endsWith(`@${projectId}.iam.gserviceaccount.com`)) {
      throw new Error("Firebase service account belongs to a different project.");
    }
    const authClient = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/${provider}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
      scopes: ["https://www.googleapis.com/auth/datastore"]
    });
    return { projectId, authClient };
  }

  // Preserve existing non-Vercel/test installations with explicit credentials.
  const credentials = env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
    : { project_id: projectId, client_email: env.FIREBASE_CLIENT_EMAIL, private_key: env.FIREBASE_PRIVATE_KEY };
  if (credentials.project_id !== projectId) throw new Error("Firebase service account belongs to a different project.");
  if (!credentials.client_email || !credentials.private_key) throw new Error("Firebase credentials are missing.");
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  require("node:crypto").createPrivateKey(credentials.private_key);
  return { projectId, credentials };
}

function getDatabase() {
  if (!database) database = new Firestore(databaseSettings());
  return database;
}

module.exports = { getDatabase, databaseSettings, FieldValue };
