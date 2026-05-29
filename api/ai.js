// api/ai.js
// Vercel Serverless Function — прокси к Gemini 2.0 Flash (БЕСПЛАТНО)
// POST /api/ai  body: { system, user }
//
// Бесплатный лимит Google AI Studio:
//   • 1 500 запросов / день
//   • 1 000 000 токенов / минуту
//   • Модель: gemini-2.0-flash
//
// Ключ берём из env-переменной GEMINI_API_KEY (никогда не попадает на фронтенд).

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const { system = "", user = "" } = body;
  if (!user) return res.status(400).json({ error: "user prompt required" });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: system
            ? { parts: [{ text: system }] }
            : undefined,
          contents: [
            {
              role: "user",
              parts: [{ text: user }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.9,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini error:", err);
      return res.status(502).json({ error: "Gemini API error", detail: err });
    }

    const data = await geminiRes.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.status(200).json({ text });
  } catch (err) {
    console.error("ai proxy error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
