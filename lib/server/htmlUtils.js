export function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&rsquo;|&#8217;/gi, "’")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripHtml(value = "") {
  return decodeHtml(
    String(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function absoluteUrl(value, baseUrl) {
  if (!value) return null;

  try {
    return new URL(decodeHtml(value), baseUrl).toString();
  } catch {
    return null;
  }
}

export function firstMatch(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match?.[1]) return stripHtml(match[1]);
  }

  return null;
}

export function extractMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  return firstMatch(html, patterns);
}

export function extractLinks(html, baseUrl, predicate = () => true) {
  const links = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || !predicate(url)) continue;

    links.push({
      url,
      text: stripHtml(match[2]),
    });
  }

  return links;
}

export async function fetchTextResource(
  url,
  { timeoutMs = 10000, etag = null, lastModified = null } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (compatible; MusicRadar/1.0; +https://music-radar-one.vercel.app)",
      Accept:
        "text/html,application/xhtml+xml,text/calendar,application/rss+xml,application/xml,text/xml;q=0.9",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (etag) headers["If-None-Match"] = etag;
    if (lastModified) headers["If-Modified-Since"] = lastModified;
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers,
    });

    const metadata = {
      httpEtag: response.headers.get("etag") || etag || null,
      httpLastModified:
        response.headers.get("last-modified") || lastModified || null,
    };
    if (response.status === 304) {
      return { text: null, notModified: true, ...metadata };
    }
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }

    return { text: await response.text(), notModified: false, ...metadata };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHtml(url, options = {}) {
  const resource = await fetchTextResource(url, options);
  return resource.text || "";
}
