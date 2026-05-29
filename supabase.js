// lib/supabase.js — используется в API-роутах на сервере (Node.js)
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // service_role key (только на сервере!)

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase env vars missing: SUPABASE_URL, SUPABASE_SERVICE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
