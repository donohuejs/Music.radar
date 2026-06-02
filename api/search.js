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

  const prompt = `Search for live music events happening ${dateRange} (today is ${today}) in ${location}.

You MUST respond with ONLY a raw JSON object. No text before it, no text after it, no explanation, no "Based on my search", nothing except the JSON object itself starting with { and ending with }.

{"location":"...","dateRange":"...","categories":[{"name":"...","events":[{"artist":"...","venue":"...","time":"...","genre":"...","tickets":"...","description":"..."}]}],"tip":"..."}

Omit categories with no results. If no events found: {"error":"No events found for this location and date range."}`;


  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
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
