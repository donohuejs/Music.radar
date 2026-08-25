import admin from "firebase-admin";

let cachedDb;

function normalizePrivateKey(value) {
  return value ? value.replace(/\\n/g, "\n") : undefined;
}

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

export function getAdminDb() {
  if (!isFirebaseAdminConfigured()) return null;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      }),
    });
  }

  if (!cachedDb) {
    cachedDb = admin.firestore();
    cachedDb.settings({ preferRest: true });
  }

  return cachedDb;
}
