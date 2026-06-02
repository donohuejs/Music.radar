module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const { location, dateRange } = req.body || {};
  if (!location || !dateRange) {
    return res.status(400).json({ error: "Missing location or dateRange" });
  }

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  try {
    // First call - focused purely on searching
    const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search extensively for live music events happening ${dateRange} (today is ${today}) in ${location}. Search multiple sources including venue websites, Facebook events, Eventbrite, and local event listings. Find as many specific events as possible including bars, breweries, restaurants, outdoor venues, and major venues. For each event get the artist name, venue, address, date, day of week, time, cover charge or ticket price, and a brief description.`,
        }],
      }),
    });

    const firstData = await firstRes.json();
    if (firstData.error) return res.status(500).json({ error: firstData.error.message });

    // Second call - format into JSON
    const messages = [
      {
        role: "user",
        content: `Search extensively for live music events happening ${dateRange} (today is ${today}) in ${location}. Search multiple sources including venue websites, Facebook events, Eventbrite, and local event listings. Find as many specific events as possible including bars, breweries, restaurants, outdoor venues, and major venues. For each event get the artist name, venue, address, date, day of week, time, cover charge or ticket price, and a brief description.`,
      },
      { role: "assistant", content: firstData.content },
      {
        role: "user",
        content: `Format all the events you found into this exact JSON structure. Sort events by date and time earliest first. Be careful that day of week matches the date. Categorize into: "Headliners & Major Shows", "Bars & Local Venues", "Free & Outdoor", and "Family Friendly" (omit categories with no events). Return ONLY the raw JSON, no other text:
{"location":"...","dateRange":"...","categories":[{"name":"...","events":[{"artist":"...","venue":"...","time":"...","genre":"...","tickets":"...","description":"..."}]}],"tip":"..."}`,
      },
    ];

    const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages,
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
