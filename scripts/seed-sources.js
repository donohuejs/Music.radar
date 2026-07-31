import admin from "firebase-admin";
import { sourceDocument } from "../lib/server/sourceRegistry.js";
import { VENUE_SOURCES } from "../lib/server/venueSources.js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: required("FIREBASE_PROJECT_ID"),
    clientEmail: required("FIREBASE_CLIENT_EMAIL"),
    privateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
const batch = db.batch();

for (const source of VENUE_SOURCES) {
  batch.set(
    db.collection("sources").doc(source.id),
    sourceDocument(source),
    { merge: true },
  );
}

await batch.commit();
console.log(`Seeded ${VENUE_SOURCES.length} event source records.`);
