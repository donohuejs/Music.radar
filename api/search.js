module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const { location, dateRange, radius } = req.body || {};
  if (!location || !dateRange) {
    return res.status(400).json({ error: "Missing location or dateRange" });
  }

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  try {
    const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `You are a local music scout. Find live music events happening ${dateRange} (today is ${today}) within ${radius || 25} miles of ${location}.

Use this search strategy:
1. Search Eventbrite, Bandsintown, Songkick, and Facebook Events for live music in ${location} ${dateRange}
2. Find the top local music venues in the area and check their event pages directly
3. Search for free outdoor concerts, festivals, and community events in the area
4. Look for brewery, bar, and restaurant live music listings
5. For each event find the exact ARTIST or BAND NAME (never an age restriction like "Ages 18+" or venue policy text), venue name, full date, day of week, time, and ticket price or cover charge

Cast as wide a net as possible — include everything from major ticketed shows to free bar performances. The more events the better.`,
        }],
      }),
    });

    const firstData = await firstRes.json();
    if (firstData.error) return res.status(500).json({ error: firstData.error.message });

    const searchResults = (firstData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!searchResults) {
      return res.status(500).json({ error: "No search results. Please try again." });
    }

    const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: `Format these live music events into JSON. Rules:
- Sort by date and time, earliest first
- Verify day of week matches the actual date
- Include full date and time like "Fri Jun 6 • 8:00 PM"
- If an artist field contains an age restriction like "Ages 5+" or "18+" skip that event entirely
- Categorize into: "Headliners & Major Shows", "Bars & Local Venues", "Free & Outdoor", "Family Friendly"
- Omit any category with no events
- Return ONLY raw JSON, no other text

{"location":"...","dateRange":"...","categories":[{"name":"...","events":[{"artist":"...","venue":"...","time":"...","genre":"...","tickets":"...","description":"..."}]}],"tip":"..."}

Events to format:
${searchResults}`,
        }],
      }),
    });

    const secondData = await secondRes.json();
    if (secondData.error) return res.status(500).json({ error: secondData.error.message });

    const textBlock = secondData.content?.find((b) => b.type === "text");
    if (!textBlock) return res.status(500).json({ error: "No response. Please try again." });

    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: "Could not parse results. Please try again." });

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch events." });
  }
};

module.exports.config = { maxDuration: 60 };
