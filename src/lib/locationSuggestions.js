export const US_STATES = [
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"],
  ["California", "CA"], ["Colorado", "CO"], ["Connecticut", "CT"], ["Delaware", "DE"],
  ["District of Columbia", "DC"], ["Florida", "FL"], ["Georgia", "GA"], ["Hawaii", "HI"],
  ["Idaho", "ID"], ["Illinois", "IL"], ["Indiana", "IN"], ["Iowa", "IA"],
  ["Kansas", "KS"], ["Kentucky", "KY"], ["Louisiana", "LA"], ["Maine", "ME"],
  ["Maryland", "MD"], ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"],
  ["Mississippi", "MS"], ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"],
  ["Nevada", "NV"], ["New Hampshire", "NH"], ["New Jersey", "NJ"], ["New Mexico", "NM"],
  ["New York", "NY"], ["North Carolina", "NC"], ["North Dakota", "ND"], ["Ohio", "OH"],
  ["Oklahoma", "OK"], ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"],
  ["South Carolina", "SC"], ["South Dakota", "SD"], ["Tennessee", "TN"], ["Texas", "TX"],
  ["Utah", "UT"], ["Vermont", "VT"], ["Virginia", "VA"], ["Washington", "WA"],
  ["West Virginia", "WV"], ["Wisconsin", "WI"], ["Wyoming", "WY"],
];

export function normalizeLocationQuery(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildLocationIndex(data) {
  const states = US_STATES.map(([name, code]) => ({ type: "state", label: `${name} (${code})`, value: name, search: normalizeLocationQuery(`${name} ${code}`), population: 0 }));
  const cities = (data?.cities || []).map(([name, state, population = 0]) => ({ type: "city", label: `${name}, ${state}`, value: `${name}, ${state}`, search: normalizeLocationQuery(`${name} ${state}`), citySearch: normalizeLocationQuery(name), population: Number(population) || 0 }));
  const zips = (data?.zips || []).map(([zip, city, state]) => ({ type: "zip", label: `${zip} — ${city}, ${state}`, value: zip, search: `${zip} ${normalizeLocationQuery(`${city} ${state}`)}`, population: 0 }));
  return [...states, ...cities, ...zips];
}

function editDistance(first, second, maximum = 2) {
  if (Math.abs(first.length - second.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= second.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (first[i - 1] === second[j - 1] ? 0 : 1));
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[second.length];
}

export function suggestLocations(index, value, limit = 8) {
  const query = normalizeLocationQuery(value);
  if (query.length < 2) return [];
  const matches = [];
  for (const item of index || []) {
    let rank = null;
    if (item.search === query) rank = 0;
    else if (item.search.startsWith(query)) rank = 1;
    else if (item.search.includes(` ${query}`)) rank = 2;
    else if (item.search.includes(query)) rank = 3;
    if (rank !== null) matches.push({ item, rank });
  }
  if (matches.length < limit && query.length >= 4 && /^[a-z]/.test(query)) {
    for (const item of index || []) {
      if (item.type !== "city" || item.citySearch[0] !== query[0] || Math.abs(item.citySearch.length - query.length) > 2) continue;
      const distance = editDistance(query, item.citySearch);
      if (distance <= 2) matches.push({ item, rank: 4 + distance });
    }
  }
  const unique = new Map();
  for (const match of matches) {
    const current = unique.get(match.item.value);
    if (!current || match.rank < current.rank) unique.set(match.item.value, match);
  }
  return [...unique.values()]
    .sort((a, b) => a.rank - b.rank || (a.item.type === "state" ? -1 : 0) - (b.item.type === "state" ? -1 : 0) || b.item.population - a.item.population || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map(({ item }) => item);
}
