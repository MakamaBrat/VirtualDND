// api/profile.js
// GET  /api/profile?uid=123456789        → читать профиль
// POST /api/profile  body: { uid, ...fields } → сохранить профиль

import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const uid = req.query.uid;
    if (!uid) return res.status(400).json({ error: "uid required" });

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("tg_id", uid)
      .single();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: "DB error" });
    }
    return res.status(200).json(data || null);
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { uid, ...fields } = body;
    if (!uid) return res.status(400).json({ error: "uid required" });

    // Считаем rating на сервере, чтобы нельзя было накрутить
    const rating = Math.max(
      0,
      (fields.level || 1) * 100 + (fields.wins || 0) * 20 - (fields.losses || 0) * 5
    );

    const { error } = await supabase
      .from("profiles")
      .upsert(
        { tg_id: uid, ...fields, rating, updated_at: new Date().toISOString() },
        { onConflict: "tg_id" }
      );

    if (error) return res.status(500).json({ error: "DB error" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
