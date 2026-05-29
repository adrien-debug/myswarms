/**
 * HEDGE HMAC signing — TypeScript reference.
 *
 * Matches the Python implementation byte-for-byte:
 *   sig = "<key_id>." + base64url(HMAC-SHA256(key, key_id + ":" + sha256(canonical_json(payload))))
 *
 * Canonical JSON: sorted keys, no whitespace, UTF-8.
 *
 * Used by HEDGE Core (Next.js) to verify upstream payloads if needed and to
 * sign payloads bound for service-role contexts (rare — most signing happens
 * in Python services).
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };

export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalJson(v)).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k]))
      .join(",") +
    "}"
  );
}

export function payloadHashHex(payload: Record<string, Json>): string {
  return createHash("sha256")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

function base64UrlNoPad(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64UrlNoPad(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function sign(
  payload: Record<string, Json>,
  key: Buffer,
  keyId = "v1",
): string {
  const digest = payloadHashHex(payload);
  const msg = `${keyId}:${digest}`;
  const mac = createHmac("sha256", key).update(msg, "utf8").digest();
  return `${keyId}.${base64UrlNoPad(mac)}`;
}

export function verify(
  payload: Record<string, Json>,
  signature: string,
  keys: Record<string, Buffer>,
): boolean {
  if (!signature || !signature.includes(".")) return false;
  const [keyId, b64sig] = signature.split(".", 2);
  const key = keys[keyId];
  if (!key) return false;
  let expected: Buffer;
  try {
    expected = fromBase64UrlNoPad(b64sig);
  } catch {
    return false;
  }
  const digest = payloadHashHex(payload);
  const msg = `${keyId}:${digest}`;
  const actual = createHmac("sha256", key).update(msg, "utf8").digest();
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export class SigningContext {
  readonly name: string;
  readonly keys: Record<string, Buffer>;
  readonly activeKeyId: string;

  constructor(
    name: string,
    keys: Record<string, Buffer>,
    activeKeyId: string,
  ) {
    if (!keys[activeKeyId]) {
      throw new Error(
        `SigningContext(${name}): active key '${activeKeyId}' not present`,
      );
    }
    this.name = name;
    this.keys = keys;
    this.activeKeyId = activeKeyId;
  }

  static fromEnv(envVar: string, activeKeyId = "v1"): SigningContext {
    const raw = process.env[envVar];
    if (!raw) {
      throw new Error(
        `Missing signing key env var: ${envVar}. HEDGE refuses to start without explicit signing material.`,
      );
    }
    const keys: Record<string, Buffer> = {};
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      let kid: string;
      let hex: string;
      if (trimmed.includes(":")) {
        const [k, h] = trimmed.split(":", 2);
        kid = k;
        hex = h;
      } else {
        kid = "v1";
        hex = trimmed;
      }
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
        throw new Error(`Invalid hex in ${envVar} for key '${kid}'`);
      }
      keys[kid] = Buffer.from(hex, "hex");
    }
    return new SigningContext(envVar, keys, activeKeyId);
  }

  sign(payload: Record<string, Json>): string {
    return sign(payload, this.keys[this.activeKeyId], this.activeKeyId);
  }

  verify(payload: Record<string, Json>, signature: string): boolean {
    return verify(payload, signature, this.keys);
  }
}
