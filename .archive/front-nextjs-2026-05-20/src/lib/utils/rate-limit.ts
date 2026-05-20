/**
 * Rate-limit best-effort en mémoire process (V1 single-user).
 *
 * NON DISTRIBUÉ : compteur stocké dans une `Map` JS du process Node. En
 * déploiement multi-instance (Vercel serverless scale-out, Railway replicas)
 * chaque instance a son propre compteur — la limite est donc approximative.
 * Acceptable en V1 (MySwarms = single-user, faible concurrence). Le but ici
 * est uniquement de freiner les rafales accidentelles d'un endpoint coûteux
 * (l'Architect = jusqu'à 3 runs Opus par appel).
 *
 * V2 : remplacer l'implémentation par un store distribué (Upstash Redis REST)
 * — même signature publique, un seul point de modification ici.
 *
 * Aucune dépendance npm : fenêtre glissante naïve via tableau de timestamps.
 */

/** Résultat d'un check de rate-limit. */
export interface RateLimitResult {
  /** `true` si la requête est autorisée (sous la limite). */
  allowed: boolean;
  /** Secondes à attendre avant le prochain essai si bloqué (sinon 0). */
  retryAfterSeconds: number;
}

/**
 * Configuration env-driven (pas de magic numbers).
 *
 * Rationale des défauts : la fenêtre DOIT être > latence d'un appel Opus
 * (~60-90s, l'Architect = jusqu'à 3 runs Opus). Sinon, en usage SÉQUENTIEL
 * (un script qui boucle des générations une par une — le scénario d'abus coût
 * le plus réaliste), chaque timestamp expire de la fenêtre avant que le suivant
 * n'arrive : `recent.length` ne dépasse jamais `MAX` et le rate-limit ne se
 * déclenche JAMAIS (il ne protégeait que les bursts concurrents). Une fenêtre
 * de 10 min (600000 ms) couvre largement la latence Opus ; `MAX = 10` borne
 * réellement le coût (~10 appels Opus / 10 min max) tout en restant confortable
 * pour un usage humain V1 single-user (personne ne génère 10 swarms en 10 min
 * légitimement). Override toujours possible via les env vars ci-dessous.
 *
 * V2 : rate-limit distribué Upstash + compteur in-flight (borne aussi les
 * appels concurrents en cours, pas seulement la fréquence) — cf
 * [[swarm-builder-v1]] dette V2.
 */
/** Fenêtre glissante par défaut (ms) : 10 min ≫ latence Opus ~90s. */
const DEFAULT_WINDOW_MS = 600000;
/** Plafond de hits par défaut dans la fenêtre : borne le coût Opus. */
const DEFAULT_MAX_IN_WINDOW = 10;

const WINDOW_MS = Number(
  process.env.ARCHITECT_RATELIMIT_WINDOW_MS ?? String(DEFAULT_WINDOW_MS),
);
const MAX_IN_WINDOW = Number(
  process.env.ARCHITECT_RATELIMIT_MAX ?? String(DEFAULT_MAX_IN_WINDOW),
);

/**
 * Store en mémoire : clé (ex: `architect:<owner_id>`) → timestamps (ms) des
 * hits encore dans la fenêtre glissante.
 */
const hits = new Map<string, number[]>();

/**
 * Sweep paresseux amorti — borne la croissance de la `Map` en V1
 * single-process : une clé jamais ré-accédée (ex: `architect:<owner>` d'un
 * user parti) ne purgerait jamais ses timestamps et fuirait en mémoire.
 * On déclenche un balayage O(n) soit aléatoirement (1 appel sur
 * `_SWEEP_PROBABILITY_DIVISOR`), soit dès que la Map dépasse
 * `_SWEEP_THRESHOLD_KEYS` clés. Le sweep ne supprime QUE des clés dont TOUS
 * les timestamps sont hors fenêtre : la sémantique de rate-limiting reste
 * strictement identique. Aucun timer périodique (non garanti en
 * contexte serverless + empêcherait le GC du module) — sweep amorti only.
 * V2 Upstash gère le TTL nativement (cf [[swarm-builder-v1]] dette V2).
 */
const _SWEEP_PROBABILITY_DIVISOR = 50;
const _SWEEP_THRESHOLD_KEYS = 500;

/**
 * Supprime les clés entièrement expirées (aucun timestamp dans la fenêtre).
 * @param cutoff borne basse de la fenêtre glissante (ms epoch).
 */
function _sweepExpired(cutoff: number): void {
  for (const [k, timestamps] of hits) {
    // Ne supprime que si AUCUN timestamp n'est encore dans la fenêtre.
    let stillLive = false;
    for (const ts of timestamps) {
      if (ts > cutoff) {
        stillLive = true;
        break;
      }
    }
    if (!stillLive) {
      hits.delete(k);
    }
  }
}

/**
 * Enregistre un hit et indique si la requête doit être bloquée (fenêtre
 * glissante de `WINDOW_MS`, max `MAX_IN_WINDOW` hits).
 *
 * @param key identifiant logique du bucket (ex: owner_id scoping un endpoint).
 */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // Sweep paresseux amorti : borne la taille de la Map sans timer.
  if (
    hits.size > _SWEEP_THRESHOLD_KEYS ||
    Math.floor(Math.random() * _SWEEP_PROBABILITY_DIVISOR) === 0
  ) {
    _sweepExpired(cutoff);
  }

  const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);

  if (recent.length >= MAX_IN_WINDOW) {
    // Le plus ancien hit dans la fenêtre détermine quand un slot se libère.
    const oldest = recent[0];
    const retryAfterMs = Math.max(0, oldest + WINDOW_MS - now);
    hits.set(key, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  recent.push(now);
  hits.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}
