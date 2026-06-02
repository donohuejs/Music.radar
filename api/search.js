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
   // Call 1 - Sonnet searches
   const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
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
       messages: [{
         role: "user",
         content: `Find live music events ${dateRange} (today is ${today}) in ${location}. Search these venues: radioroomgreenville.com/events, fireforge.beer, doublestampbrewery.com, thepeacecenter.org, swansonswarehouse.com/calendar, prekindle.com/events/swansons-warehouse, smileysontherox.com, foundrygvl.com/events, bluesboulevard.com, 3friendsbargrill.com, wildyarrow.com, seratonic.com. Also check Eventbrite and Bandsintown. List every event with artist, venue, date, day of week, time, and price.`,
       }],
     }),
   });

   const firstData = await firstRes.json();
   if (firstData.error) return res.status(500).json({ error: firstData.error.message });

   // Extract just the text from Sonnet's response
   const searchResults = (firstData.content || [])
     .filter((b) => b.type === "text")
     .map((b) => b.text)
     .join("\n");

   if (!searchResults) {
     return res.status(500).json({ error: "No search results. Please try again." });
   }

   // Call 2 - Haiku formats
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
         content: `Format these live music events into JSON. Sort by date/time earliest first. Verify day of week matches date. Include full date+time like "Fri Jun 6 • 8:00 PM". Categories: "Headliners & Major Shows", "Bars & Local Venues", "Free & Outdoor", "Family Friendly". Omit empty categories. Return ONLY raw JSON:
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
