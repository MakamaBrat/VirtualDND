// api/kv.js
// Универсальное key-value хранилище через Supabase
// Используется для: серверов, рейтинга, рефералов
//
// GET  /api/kv?key=X          → { value }
// GET  /api/kv?prefix=X       → { keys: [...] }
// POST /api/kv  { key, value } → { ok }
// DELETE /api/kv?key=X        → { ok }

import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — читать значение или список ключей
  if (req.method === "GET") {
    const { key, prefix } = req.query;

    if (prefix) {
      // Список ключей по префиксу
      const { data, error } = await supabase
        .from("kv_store")
        .select("key")
        .like("key", `${prefix}%`)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) return res.status(500).json({ error: "DB error" });
      return res.status(200).json({ keys: (data || []).map((r) => r.key) });
    }

    if (key) {
      const { data, error } = await supabase
        .from("kv_store")
        .select("value")
        .eq("key", key)
        .single();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: "DB error" });
      return res.status(200).json({ value: data ? data.value : undefined });
    }

    return res.status(400).json({ error: "key or prefix required" });
  }

  // POST — сохранить
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { key, value } = body;
    if (!key) return res.status(400).json({ error: "key required" });

    const { error } = await supabase
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) return res.status(500).json({ error: "DB error" });
    return res.status(200).json({ ok: true });
  }

  // DELETE — удалить
  if (req.method === "DELETE") {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: "key required" });

    const { error } = await supabase.from("kv_store").delete().eq("key", key);
    if (error) return res.status(500).json({ error: "DB error" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
