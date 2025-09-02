// src/supabase.js
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://auiurmkojwpcbxarewdn.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1aXVybWtvandwY2J4YXJld2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2ODE2NzMsImV4cCI6MjA3MjI1NzY3M30.09Hv3K3OADK69y56R-KkvHzzcEfbwN2cmNqwtYwsHHA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
