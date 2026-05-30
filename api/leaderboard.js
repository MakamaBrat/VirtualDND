// api/leaderboard.js
// GET /api/leaderboard?limit=50
// Возвращает топ игроков из Supabase

import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("tg_id, name, username, photo, level, xp, wins, losses, bio, rating, updated_at")
      .order("rating", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error("leaderboard error:", err);
    return res.status(500).json({ error: "DB error" });
  }
}
