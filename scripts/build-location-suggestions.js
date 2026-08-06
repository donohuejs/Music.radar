import { readFile, writeFile } from "node:fs/promises";

const [postalPath, citiesPath, outputPath = "public/location-suggestions.json"] = process.argv.slice(2);
if (!postalPath || !citiesPath) {
  throw new Error("Usage: node scripts/build-location-suggestions.js <US.txt> <cities15000.txt> [output]");
}

const cityPopulation = new Map();
for (const line of (await readFile(citiesPath, "utf8")).split(/\r?\n/)) {
  if (!line) continue;
  const columns = line.split("\t");
  if (columns[8] !== "US") continue;
  const key = `${columns[1].toLowerCase()}|${columns[10]}`;
  cityPopulation.set(key, Math.max(cityPopulation.get(key) || 0, Number(columns[14]) || 0));
}

const cities = new Map();
const zips = new Map();
for (const line of (await readFile(postalPath, "utf8")).split(/\r?\n/)) {
  if (!line) continue;
  const columns = line.split("\t");
  const zip = columns[1]?.trim();
  const city = columns[2]?.trim();
  const state = columns[4]?.trim();
  const stateCode = columns[4] ? columns[4].trim() : columns[3]?.trim();
  if (!/^\d{5}$/.test(zip) || !city || !stateCode) continue;
  const cityKey = `${city.toLowerCase()}|${stateCode}`;
  cities.set(cityKey, [city, stateCode, cityPopulation.get(cityKey) || 0]);
  if (!zips.has(zip)) zips.set(zip, [zip, city, stateCode]);
}

const output = {
  source: "GeoNames",
  generatedAt: new Date().toISOString(),
  cities: [...cities.values()].sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0])),
  zips: [...zips.values()].sort((a, b) => a[0].localeCompare(b[0])),
};
await writeFile(outputPath, JSON.stringify(output));
console.log(`Wrote ${output.cities.length} cities and ${output.zips.length} ZIP codes to ${outputPath}.`);
