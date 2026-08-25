import admin from "firebase-admin";

let cachedDb;
let cachedBucket;

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
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  if (!cachedDb) {
    cachedDb = admin.firestore();
    cachedDb.settings({ preferRest: true });
  }

  return cachedDb;
}

export function getAdminBucket() {
  if (!isFirebaseAdminConfigured() || !process.env.FIREBASE_STORAGE_BUCKET) return null;
  getAdminDb();
  if (!cachedBucket) cachedBucket = admin.storage().bucket();
  return cachedBucket;
}
