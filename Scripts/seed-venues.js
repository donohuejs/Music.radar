import fs from "node:fs/promises";
import admin from "firebase-admin";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const projectId = required("FIREBASE_PROJECT_ID");
const clientEmail = required("FIREBASE_CLIENT_EMAIL");
const privateKey = required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();
const raw = await fs.readFile(new URL("../data/greenville-venues.json", import.meta.url), "utf8");
const venues = JSON.parse(raw);

const batch = db.batch();
for (const venue of venues) {
  const ref = db.collection("venues").doc(venue.id);
  batch.set(ref, {
    ...venue,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
await batch.commit();

console.log(`Seeded ${venues.length} Greenville venue records.`);
