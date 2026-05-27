"""HEDGE HMAC signing — Python reference implementation.

Canonicalisation = JSON with sorted keys, no whitespace, UTF-8.
Two-stage: hash payload (sha256) then HMAC-SHA256 over (key_id || ":" || hash).
Why hash first: bounds payload size before HMAC and prevents length-extension surprises.

Used by:
- swarm-orchestrator (SWARM_SIGNING_KEY)
- strategy-builder    (STRATEGY_SIGNING_KEY)
- risk-engine         (RISK_DECISION_KEY)
- execution-engine    (verifies all three)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from typing import Any, Mapping


def canonical_json(payload: Mapping[str, Any]) -> bytes:
    """Deterministic JSON bytes: sorted keys, no whitespace, UTF-8."""
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_json_default,
    ).encode("utf-8")


def _json_default(obj: Any) -> Any:
    # Allow datetime, UUID, Decimal etc. without breaking canonical form.
    from datetime import date, datetime
    from decimal import Decimal
    from uuid import UUID

    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, Decimal):
        # Convert to string to avoid float precision loss across services.
        return format(obj, "f")
    raise TypeError(f"Unserializable type for canonical_json: {type(obj)!r}")


def payload_hash_hex(payload: Mapping[str, Any]) -> str:
    """sha256 of canonical payload, hex-encoded."""
    return hashlib.sha256(canonical_json(payload)).hexdigest()


def sign(payload: Mapping[str, Any], key: bytes, key_id: str = "v1") -> str:
    """Return base64(HMAC-SHA256(key, key_id || ':' || sha256(canonical_json(payload)))).

    Resulting signature embeds key_id as prefix: '<key_id>.<b64sig>'.
    """
    digest = payload_hash_hex(payload)
    msg = f"{key_id}:{digest}".encode("utf-8")
    mac = hmac.new(key, msg, hashlib.sha256).digest()
    return f"{key_id}.{base64.urlsafe_b64encode(mac).decode('ascii').rstrip('=')}"


def verify(payload: Mapping[str, Any], signature: str, keys: Mapping[str, bytes]) -> bool:
    """Constant-time verify. `keys` maps key_id -> secret bytes (for rotation)."""
    if not signature or "." not in signature:
        return False
    key_id, b64sig = signature.split(".", 1)
    key = keys.get(key_id)
    if key is None:
        return False
    # Pad base64 url-safe back if needed.
    padding = "=" * (-len(b64sig) % 4)
    try:
        expected_mac = base64.urlsafe_b64decode(b64sig + padding)
    except Exception:
        return False
    digest = payload_hash_hex(payload)
    msg = f"{key_id}:{digest}".encode("utf-8")
    actual_mac = hmac.new(key, msg, hashlib.sha256).digest()
    return hmac.compare_digest(expected_mac, actual_mac)


@dataclass(frozen=True)
class SigningContext:
    name: str          # e.g. "RISK_DECISION_KEY"
    keys: dict[str, bytes]
    active_key_id: str = "v1"

    @classmethod
    def from_env(cls, env_var: str, active_key_id: str = "v1") -> "SigningContext":
        raw = os.environ.get(env_var)
        if not raw:
            raise RuntimeError(
                f"Missing required signing key env var: {env_var}. "
                f"HEDGE refuses to start without explicit signing material."
            )
        # Support comma-separated rotation: "v1:hexhex,v2:hexhex"
        keys: dict[str, bytes] = {}
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            if ":" in part:
                kid, hex_key = part.split(":", 1)
            else:
                kid, hex_key = "v1", part
            try:
                keys[kid] = bytes.fromhex(hex_key)
            except ValueError as e:
                raise RuntimeError(
                    f"Invalid hex for {env_var} key '{kid}': {e}"
                ) from e
        if active_key_id not in keys:
            raise RuntimeError(
                f"Active key id '{active_key_id}' not present in {env_var}."
            )
        return cls(name=env_var, keys=keys, active_key_id=active_key_id)

    def sign(self, payload: Mapping[str, Any]) -> str:
        return sign(payload, self.keys[self.active_key_id], self.active_key_id)

    def verify(self, payload: Mapping[str, Any], signature: str) -> bool:
        return verify(payload, signature, self.keys)
