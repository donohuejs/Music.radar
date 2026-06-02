export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { location, dateRange } = body;

  if (!location || !dateRange) {
    return new Response(JSON.stringify({ error: "Missing location or dateRange" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const prompt = `You are a local music scout with access to web search. Search for live music events happening ${dateRange} (today is ${today}) in ${location}.

Find as many real, specific events as you can. For each event include:
- Artist/Band name
- Venue name  
- Time (if known)
- Genre or vibe (1-3 words)
- Any ticket/cover info if available
- A one-sentence description of the act if you can find one

Group results into categories: "Headliners & Major Shows", "Bars & Local Venues", and "Free / Outdoor" (omit any category with no results).

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation. Use this exact structure:
{
  "location": "...",
  "dateRange": "...",
  "categories": [
    {
      "name": "...",
      "events": [
        {
          "artist": "...",
          "venue": "...",
          "time": "...",
          "genre": "...",
          "tickets": "...",
          "description": "..."
        }
      ]
    }
  ],
  "tip": "One insider tip about the local music scene or a standout recommendation"
}

If truly no events are found after searching, return: {"error": "No events found for this location and date range."}`;

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
    const rawText = textBlock?.text || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    // Validate it's parseable JSON before sending back
    JSON.parse(cleaned);

    return new Response(cleaned, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch events. Please try again." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
