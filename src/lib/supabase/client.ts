"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Client Supabase browser-side (Client Components).
 * Utilise les vars publiques NEXT_PUBLIC_*. La auth/session est gérée
 * via cookies SSR par @supabase/ssr.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "[supabase/client] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquant",
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
