import { verifySupabaseUser } from "../lib/supabase.js";

/**
 * Middleware: Verify Supabase JWT from edge client.
 *
 * This is for routes that need the OWNER's identity (Supabase user),
 * not the staff PIN identity (existing authenticate middleware).
 *
 * Attaches req.supabaseUser = { id, email, user_metadata, ... }
 */
export async function authenticateSupabase(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Supabase authentication token" });
  }

  const token = authHeader.slice(7);

  try {
    const user = await verifySupabaseUser(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.supabaseUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Authentication failed" });
  }
}
