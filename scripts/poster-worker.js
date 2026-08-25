import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const apiBase = process.env.MUSIC_RADAR_API_BASE || "http://localhost:3000";
const secret = process.env.MUSIC_RADAR_INGEST_SECRET;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr}`);
  }
  return result.stdout;
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

function extension(contentType, url) {
  if (/pdf/i.test(contentType)) return ".pdf";
  if (/png/i.test(contentType)) return ".png";
  if (/jpe?g/i.test(contentType)) return ".jpg";
  try {
    return extname(new URL(url).pathname) || ".asset";
  } catch {
    return ".asset";
  }
}

async function extractText(assetPath, contentType, workingDirectory) {
  if (/pdf/i.test(contentType) || assetPath.endsWith(".pdf")) {
    const textPath = join(workingDirectory, "document.txt");
    run("pdftotext", ["-layout", assetPath, textPath]);
    const directText = await readFile(textPath, "utf8");
    if (directText.trim().length >= 80) return directText;

    const imagePrefix = join(workingDirectory, "page");
    run("pdftoppm", ["-png", "-r", "200", assetPath, imagePrefix]);
    const pageText = [];
    for (let page = 1; page <= 25; page += 1) {
      const pagePath = `${imagePrefix}-${page}.png`;
      try {
        await readFile(pagePath);
      } catch {
        break;
      }
      pageText.push(run("tesseract", [pagePath, "stdout", "--psm", "6"]));
    }
    return pageText.join("\n\n");
  }

  return run("tesseract", [assetPath, "stdout", "--psm", "6"]);
}

async function processCandidate(candidate) {
  const evidencePath = candidate.evidenceDocumentId
    ? `/api/discover?mediaEvidenceId=${encodeURIComponent(candidate.evidenceDocumentId)}`
    : null;
  const response = await fetch(evidencePath ? `${apiBase}${evidencePath}` : candidate.assetUrl, {
    headers: {
      "User-Agent": "MusicRadarPosterWorker/1.0",
      ...(evidencePath ? { Authorization: `Bearer ${secret}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`Asset returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const assetHash = createHash("sha256").update(bytes).digest("hex");
  if (assetHash === candidate.assetHash && candidate.extractionStatus === "extracted") {
    return { id: candidate.id, skipped: true };
  }

  const workingDirectory = await mkdtemp(join(tmpdir(), "music-radar-poster-"));
  try {
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const assetPath = join(workingDirectory, `source${extension(contentType, candidate.assetUrl)}`);
    await writeFile(assetPath, bytes);
    const extractedText = (await extractText(assetPath, contentType, workingDirectory)).trim();
    if (!extractedText) throw new Error("No text could be extracted from the poster.");
    await api("/api/discover", {
      method: "POST",
      body: JSON.stringify({
        action: "poster-extraction",
        candidateId: candidate.id,
        assetHash,
        extractedText,
      }),
    });
    return { id: candidate.id, extractedCharacters: extractedText.length };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

if (!secret) throw new Error("MUSIC_RADAR_INGEST_SECRET is required.");
for (const [command, args] of [
  ["pdftotext", ["-v"]],
  ["pdftoppm", ["-v"]],
  ["tesseract", ["--version"]],
]) {
  if (!commandAvailable(command, args)) throw new Error(`${command} is not installed.`);
}

const { candidates } = await api("/api/discover");
const pending = candidates
  .filter((candidate) =>
    candidate.status === "needs-extraction" &&
    (candidate.evidenceDocumentId || candidate.assetUrl),
  )
  .slice(0, 10);
const results = [];
for (const candidate of pending) {
  try {
    results.push({ ...(await processCandidate(candidate)), ok: true });
  } catch (error) {
    results.push({ id: candidate.id, ok: false, error: error.message });
  }
}
console.log(JSON.stringify({ processed: results.length, results }, null, 2));
