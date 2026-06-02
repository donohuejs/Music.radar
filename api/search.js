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

  const prompt = `Search for live music events happening ${dateRange} (today is ${today}) in ${location}. Find specific artists, venues, and times.`;

  try {
    // First call - triggers web search
    const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const firstData = await firstRes.json();
    if (firstData.error) return res.status(500).json({ error: firstData.error.message });

    // Build conversation history with search results
    const messages = [
      { role: "user", content: prompt },
      { role: "assistant", content: firstData.content },
      {
        role: "user",
        content: `Now format everything you found as ONLY this JSON object with no other text:
{"location":"${location}","dateRange":"${dateRange}","categories":[{"name":"Headliners & Major Shows","events":[{"artist":"...","venue":"...","time":"...","genre":"...","tickets":"...","description":"..."}]},{"name":"Bars & Local Venues","events":[]}],"tip":"..."}
Only include categories that have events. Return raw JSON only.`,
      },
    ];

    // Second call - format results as JSON
    const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
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
