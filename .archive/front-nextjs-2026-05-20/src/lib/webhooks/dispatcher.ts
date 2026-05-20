/**
 * Helm Webhook Dispatcher — Hive → Cortex (et tout autre endpoint enregistré)
 *
 * Lit les endpoints actifs depuis `webhook_endpoints` (Supabase service_role),
 * signe chaque payload avec HMAC-SHA256 et envoie un POST.
 *
 * Usage :
 *   import { dispatchHelmEvent } from '@/lib/webhooks/dispatcher'
 *   await dispatchHelmEvent('mission.completed', { mission_id: '...', ... })
 */

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HelmEventName =
  | 'mission.completed'
  | 'report.generated'
  | 'signal.triggered'
  | 'cost.warning'
  | 'cost.exceeded'
  | 'asset.created'

export interface HelmEventPayload {
  event: HelmEventName
  timestamp: string           // ISO-8601
  payload: Record<string, unknown>
}

interface WebhookEndpoint {
  id: string
  url: string
  secret: string
  events: string[]
  active: boolean
}

interface DispatchResult {
  endpoint_id: string
  url: string
  status: number | null
  ok: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retourne le HMAC-SHA256 hex brut (sans préfixe "sha256=").
 * Compatible avec verifyHmac() de Cortex qui compare directement le hex digest.
 */
function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('[webhook-dispatcher] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Core dispatcher
// ---------------------------------------------------------------------------

/**
 * Envoie un Helm event à tous les endpoints actifs abonnés à cet event.
 * Retourne un résumé par endpoint (succès / echec).
 */
export async function dispatchHelmEvent(
  eventName: HelmEventName,
  data: Record<string, unknown>,
  opts?: { timestamp?: string }
): Promise<DispatchResult[]> {
  const supabase = getSupabaseAdmin()
  const timestamp = opts?.timestamp ?? new Date().toISOString()

  // 1. Récupère les endpoints actifs abonnés à cet event
  const { data: endpoints, error } = await supabase
    .from('webhook_endpoints')
    .select('id, url, secret, events, active')
    .eq('active', true)
    .contains('events', [eventName])

  if (error) {
    console.error('[webhook-dispatcher] Erreur lecture DB:', error.message)
    return []
  }

  if (!endpoints?.length) return []

  // 2. Construit le payload
  const body: HelmEventPayload = {
    event: eventName,
    timestamp,
    payload: data,
  }
  const rawBody = JSON.stringify(body)

  // 3. Envoie en parallèle à tous les endpoints
  const results = await Promise.allSettled(
    (endpoints as WebhookEndpoint[]).map(async (ep) => {
      const signature = signPayload(rawBody, ep.secret)
      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hive-Signature': signature,
            'X-Helm-Signature': signature, // compatibilité Cortex
            'X-Hive-Event': eventName,
            'User-Agent': 'Hive-Dispatcher/1.0',
          },
          body: rawBody,
          signal: AbortSignal.timeout(10_000),
        })
        const result: DispatchResult = {
          endpoint_id: ep.id,
          url: ep.url,
          status: res.status,
          ok: res.ok,
        }
        if (!res.ok) {
          result.error = `HTTP ${res.status}`
          console.warn(`[webhook-dispatcher] ${ep.url} → ${res.status}`)
        }
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[webhook-dispatcher] ${ep.url} → erreur réseau:`, msg)
        return {
          endpoint_id: ep.id,
          url: ep.url,
          status: null,
          ok: false,
          error: msg,
        } satisfies DispatchResult
      }
    })
  )

  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          endpoint_id: 'unknown',
          url: 'unknown',
          status: null,
          ok: false,
          error: (r.reason as Error)?.message ?? 'unknown',
        }
  )
}

/**
 * Alias pour inférer le timestamp automatiquement et passer directement
 * les champs d'un event mission.completed.
 */
export async function dispatchMissionCompleted(
  missionData: Record<string, unknown>
): Promise<DispatchResult[]> {
  return dispatchHelmEvent('mission.completed', missionData)
}
