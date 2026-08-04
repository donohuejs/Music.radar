import { createHash } from "node:crypto";

const DISCOVERY_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const DISCOVERY_CELL_LATITUDE_DEGREES = 0.3;
const MAX_DISCOVERY_CELLS = 25;

function longitudeStep(latitude) {
  return Math.min(
    DISCOVERY_CELL_LATITUDE_DEGREES /
      Math.max(Math.cos((Number(latitude) * Math.PI) / 180), 0.2),
    1,
  );
}

function distanceMiles(first, second) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function discoveryCellsForArea(location) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const radiusMiles = Math.min(Math.max(Number(location.radiusMiles) || 25, 5), 100);
  const latitudeDelta = radiusMiles / 69;
  const stepLongitude = longitudeStep(latitude);
  const longitudeDelta = radiusMiles /
    Math.max(69 * Math.cos((latitude * Math.PI) / 180), 10);
  const cells = [];

  for (
    let latitudeIndex = Math.floor((latitude - latitudeDelta) / DISCOVERY_CELL_LATITUDE_DEGREES);
    latitudeIndex <= Math.floor((latitude + latitudeDelta) / DISCOVERY_CELL_LATITUDE_DEGREES);
    latitudeIndex += 1
  ) {
    for (
      let longitudeIndex = Math.floor((longitude - longitudeDelta) / stepLongitude);
      longitudeIndex <= Math.floor((longitude + longitudeDelta) / stepLongitude);
      longitudeIndex += 1
    ) {
      const center = {
        latitude: (latitudeIndex + 0.5) * DISCOVERY_CELL_LATITUDE_DEGREES,
        longitude: (longitudeIndex + 0.5) * stepLongitude,
      };
      const distance = distanceMiles({ latitude, longitude }, center);
      if (distance > radiusMiles + 15) continue;
      cells.push({
        ...center,
        key: `${latitudeIndex}:${longitudeIndex}:${stepLongitude.toFixed(4)}`,
        distance,
      });
    }
  }

  return cells
    .sort((first, second) => first.distance - second.distance)
    .slice(0, MAX_DISCOVERY_CELLS);
}

export function discoveryJobId(cellOrLatitude, longitude) {
  const key =
    typeof cellOrLatitude === "object"
      ? cellOrLatitude.key
      : `${Number(cellOrLatitude).toFixed(2)}:${Number(longitude).toFixed(2)}`;
  return createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 24);
}

export async function queueDiscoveryJob(db, location, { force = false } = {}) {
  const result = await queueDiscoveryJobsForArea(db, location, { force, maxCells: 1 });
  return result.queuedCount > 0;
}

export async function queueDiscoveryJobsForArea(
  db,
  location,
  { force = false, maxCells = MAX_DISCOVERY_CELLS } = {},
) {
  if (!db) return { queuedCount: 0, coverageCellCount: 0 };

  const cells = discoveryCellsForArea(location).slice(0, maxCells);
  const references = cells.map((cell) =>
    db.collection("discoveryJobs").doc(discoveryJobId(cell)),
  );
  const snapshots = references.length ? await db.getAll(...references) : [];
  const batch = db.batch();
  const now = new Date();
  let queuedCount = 0;

  cells.forEach((cell, index) => {
    const existing = snapshots[index]?.exists ? snapshots[index].data() : null;
    const freshnessAt = existing?.completedAt || existing?.queuedAt;
    const freshnessTimestamp = freshnessAt ? new Date(freshnessAt).getTime() : 0;
    const fresh =
      existing &&
      ["pending", "running", "complete"].includes(existing.status) &&
      now.getTime() - freshnessTimestamp < DISCOVERY_REFRESH_MS;
    if (!force && fresh) return;

    batch.set(
      references[index],
      {
        coverageCell: cell.key,
        latitude: cell.latitude,
        longitude: cell.longitude,
        displayName: location.displayName || null,
        radiusMiles: 18,
        requestedRadiusMiles: Math.min(
          Math.max(Number(location.radiusMiles) || 25, 5),
          100,
        ),
        status: "pending",
        organizationOffset: 0,
        organizationCount: null,
        candidateCount: 0,
        registeredSourceCount: 0,
        queuedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        attempts: Number(existing?.attempts || 0),
      },
      { merge: true },
    );
    queuedCount += 1;
  });

  if (queuedCount) await batch.commit();
  return { queuedCount, coverageCellCount: cells.length };
}

export async function loadPendingDiscoveryJobs(db, limit = 3) {
  const snapshot = await db
    .collection("discoveryJobs")
    .where("status", "==", "pending")
    .limit(Math.min(Math.max(limit, 1), 10))
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function updateDiscoveryJob(db, id, update) {
  await db
    .collection("discoveryJobs")
    .doc(id)
    .set(
      { ...update, updatedAt: new Date().toISOString() },
      { merge: true },
    );
}

export function candidateId(url) {
  return createHash("sha256").update(String(url)).digest("hex").slice(0, 32);
}

export async function saveSourceCandidates(db, candidates, job) {
  if (!candidates.length) return [];
  const references = candidates.map((candidate) =>
    db.collection("sourceCandidates").doc(candidateId(candidate.url)),
  );
  const snapshots = await db.getAll(...references);
  const writer = db.bulkWriter();
  const enriched = [];

  candidates.forEach((candidate, index) => {
    const previous = snapshots[index].exists ? snapshots[index].data() : null;
    const sightings = Number(previous?.sightings || 0) + 1;
    const confidence = Math.min(
      0.99,
      Number(candidate.score || 0) + Math.min(sightings - 1, 3) * 0.015,
    );
    const lifecycle =
      candidate.kind === "poster"
        ? "needs-extraction"
        : confidence >= 0.94 && sightings >= 2
          ? "validated-candidate"
          : "discovered";
    const document = {
      ...candidate,
      score: confidence,
      initialConfidence: Number(previous?.initialConfidence || candidate.score || 0),
      sightings,
      validationRuns: Number(previous?.validationRuns || 0),
      lifecycle,
      status: candidate.kind === "poster" ? "needs-extraction" : lifecycle,
      discoveryJobId: job.id,
      discoveryLocation: job.displayName || null,
      firstDiscoveredAt: previous?.firstDiscoveredAt || new Date().toISOString(),
      lastDiscoveredAt: new Date().toISOString(),
    };
    enriched.push({ id: references[index].id, ...document });
    writer.set(
      references[index],
      document,
      { merge: true },
    );
  });

  await writer.close();
  return enriched;
}
