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
 * ⚠️ RISQUE IDOR SI DEV_OWNER_ID EST ABSENT ⚠️
 * Si `DEV_OWNER_ID` n'est pas définie dans `.env.local`, cette fonction retourne
 * `null`. Côté engine Python (`src/routes/swarms.py`), un `owner_id` null désactive
 * le filtre par owner → n'importe quel run peut lire/modifier les données de tous
 * les owners (équivalent service-role sans scoping). DEV_OWNER_ID DOIT être set
 * à un UUID v4 fixe en développement. Voir `.env.local`.
 *
 * V2 — à remplacer par une vraie session Supabase via `@supabase/ssr` :
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

/**
 * Erreur typée levée par `requireOwnerId()` quand aucun owner n'est résolu.
 * Les routes critiques doivent catcher cette erreur et répondre 401.
 */
export class OwnerAuthError extends Error {
  constructor(message = "Owner not resolved — DEV_OWNER_ID absent ou session invalide") {
    super(message);
    this.name = "OwnerAuthError";
  }
}

/**
 * Retourne l'owner_id ou retourne null.
 * Utiliser uniquement pour les usages non-critiques (ex. clé de rate-limit).
 * Pour les opérations data-scopées, préférer `requireOwnerId()`.
 */
export async function getOwnerId(): Promise<string | null> {
  // V1 single-user : owner_id stub depuis env.
  // DEV_OWNER_ID DOIT être set dans .env.local (UUID v4 fixe) — sinon IDOR.
  // V2 TODO : remplacer par session Supabase via @supabase/ssr.
  return process.env.DEV_OWNER_ID ?? null;
}

/**
 * Retourne l'owner_id ou throw OwnerAuthError (jamais null/undefined/'').
 *
 * Pattern d'usage dans les routes critiques :
 *
 *   try {
 *     const ownerId = await requireOwnerId();
 *     // ... opération scopée par owner
 *   } catch (err) {
 *     if (err instanceof OwnerAuthError) {
 *       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *     }
 *     throw err;
 *   }
 */
export async function requireOwnerId(): Promise<string> {
  const id = await getOwnerId();
  if (!id) {
    throw new OwnerAuthError();
  }
  return id;
}
