import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Client Supabase server-side pour Server Components, Server Actions et Route Handlers.
 * Lit/écrit les cookies de session via next/headers.
 *
 * Pattern officiel @supabase/ssr Next 15/16 App Router :
 * - getAll/setAll pour la gestion des cookies
 * - try/catch sur setAll car les Server Components ne peuvent pas écrire des cookies
 *   (le refresh de session est géré côté middleware)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll appelé depuis un Server Component → ignorer.
            // Le refresh de session est assuré par le middleware (updateSession).
          }
        },
      },
    },
  );
}

