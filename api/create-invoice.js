// api/create-invoice.js
// Vercel Serverless Function — создаёт Telegram Stars invoice через Bot API
// GET /api/create-invoice?stars=50&uid=123456789

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  const { stars, uid } = req.query;
  const n = parseInt(stars, 10);

  if (!n || n < 1 || n > 10000) {
    return res.status(400).json({ error: "Invalid stars amount (1–10000)" });
  }
  if (!uid) {
    return res.status(400).json({ error: "uid required" });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "BOT_TOKEN not configured" });
  }

  try {
    // Создаём invoice через Telegram Bot API
    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Энергия Virtual DND",
          description: `${n} единиц энергии для боёв на арене ⚔️`,
          payload: `energy_${n}_uid_${uid}`,
          currency: "XTR", // Telegram Stars
          prices: [{ label: `${n} ⚡`, amount: n }], // 1 Star = 1 XTR
          provider_token: "", // пусто для Stars
        }),
      }
    );

    const data = await tgRes.json();
    if (!data.ok) {
      console.error("Telegram API error:", data);
      return res.status(502).json({ error: data.description || "Telegram error" });
    }

    // Возвращаем просто URL (фронт делает openInvoice(link))
    return res.status(200).send(data.result);
  } catch (err) {
    console.error("create-invoice error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
