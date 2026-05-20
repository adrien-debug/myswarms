/**
 * Wrapper Langfuse best-effort — fire-and-forget, zéro dépendance externe.
 * Ne bloque jamais la réponse, ne propage jamais d'erreur.
 */

export function traceChatEvent(input: {
  name: string;
  userId?: string;
  model: string;
  metadata?: Record<string, unknown>;
}): void {
  const host = process.env.LANGFUSE_HOST;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!host || !publicKey || !secretKey) return;

  const credentials = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const traceId = crypto.randomUUID();

  const body = JSON.stringify({
    batch: [
      {
        type: "trace-create",
        id: traceId,
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
          name: input.name,
          userId: input.userId,
          metadata: {
            model: input.model,
            ...input.metadata,
          },
          timestamp: new Date().toISOString(),
        },
      },
    ],
  });

  const base = host.replace(/\/+$/, "");
  void fetch(`${base}/api/public/ingestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}
