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

  const prompt = `You are a local music scout with access to web search. Search for live music events happening ${dateRange} (today is ${today}) in ${location}. Find as many real, specific events as you can. Group results into categories: "Headliners & Major Shows", "Bars & Local Venues", and "Free / Outdoor" (omit any category with no results). Respond ONLY with a valid JSON object, no markdown, no backticks: {"location":"...","dateRange":"...","categories":[{"name":"...","events":[{"artist":"...","venue":"...","time":"...","genre":"...","tickets":"...","description":"..."}]}],"tip":"..."}. If no events found return: {"error":"No events found for this location and date range."}`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await anthropicRes.json();
    const textBlock = data.content?.find((b) => b.type === "text");
    if (!textBlock) return res.status(500).json({ error: "No response from AI. Please try again." });

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch events." });
  }
}

module.exports.config = { maxDuration: 60 };
