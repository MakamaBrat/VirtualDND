// api/webhook.js
// Vercel Serverless Function — обрабатывает Telegram-вебхук
// POST /api/webhook
// Регистрировать: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook

import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const update = req.body;

  // pre_checkout_query — обязательно подтвердить в 10 секунд
  if (update.pre_checkout_query) {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }),
      }
    );
    return res.status(200).json({ ok: true });
  }

  // successful_payment — Stars зачислены, начисляем энергию
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const payload = payment.invoice_payload; // "energy_50_uid_123456789"
    const match = payload.match(/^energy_(\d+)_uid_(\d+)$/);

    if (match) {
      const energy = parseInt(match[1], 10);
      const uid = match[2];

      // Записываем в Supabase — upsert профиля с прибавкой энергии
      const { data: existing } = await supabase
        .from("profiles")
        .select("energy")
        .eq("tg_id", uid)
        .single();

      const currentEnergy = existing?.energy ?? 20;
      await supabase
        .from("profiles")
        .upsert({ tg_id: uid, energy: currentEnergy + energy, updated_at: new Date().toISOString() }, { onConflict: "tg_id" });

      // Логируем платёж
      await supabase.from("payments").insert({
        tg_id: uid,
        stars: energy,
        payload,
        telegram_charge_id: payment.telegram_payment_charge_id,
        created_at: new Date().toISOString(),
      });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
