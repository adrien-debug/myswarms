/**
 * Auth helper — V1 single-user stub.
 *
 * ⚠️ DETTE TECHNIQUE V2 ⚠️
 * MySwarms est volontairement single-user en V1 pour démêler l'orchestration
 * CrewAI sans bloquer sur la pile auth complète. Ce helper retourne juste
 * `process.env.DEV_OWNER_ID` (ou `null` si non défini), ce qui permet :
 *   - de scoper localement les requêtes engine avec un owner_id stable
 *     (utile pour le seed Chief of Staff + tests bout-en-bout),
 *   - de garder le comportement actuel inchangé si la var n'est pas set.
 *
 * 🛠️ V2 — à remplacer par une vraie session Supabase via `@supabase/ssr` :
 *
 *   import { createServerClient } from "@supabase/ssr";
 *   import { cookies } from "next/headers";
 *   export async function getOwnerId(): Promise<string | null> {
 *     const supabase = createServerClient(URL, KEY, { cookies: cookies() });
 *     const { data: { user } } = await supabase.auth.getUser();
 *     return user?.id ?? null;
 *   }
 *
 * Tous les call-sites (`src/app/api/swarms/**`, `src/app/api/tools/route.ts`)
 * sont déjà câblés pour propager `owner_id` à l'engine via `?owner_id=` —
 * il suffira de remplacer le contenu de cette fonction.
 *
 * Voir aussi : `services/crewai-engine/src/routes/swarms.py` (filtre owner_id côté Python).
 */
export async function getOwnerId(): Promise<string | null> {
  // V1 single-user : owner_id stub depuis env.
  // V2 TODO : remplacer par session Supabase via @supabase/ssr.
  return process.env.DEV_OWNER_ID ?? null;
}
