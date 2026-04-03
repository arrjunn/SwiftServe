import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for SwiftServe Cloud (server-side).
 *
 * Uses service_role key for admin operations (bypasses RLS).
 * Set in .env:
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — Supabase features disabled"
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceKey || "placeholder",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Verify a Supabase JWT token from the edge client.
 * Returns the user object if valid, null otherwise.
 */
export async function verifySupabaseUser(token) {
  if (!supabaseUrl || !supabaseServiceKey) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export default supabase;
