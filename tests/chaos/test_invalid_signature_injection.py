"""Chaos: an attacker injects a forged outbox row with a tampered signature.

Expected: execution-engine refuses, writes hedge_audit_log(severity='critical'),
no execution_reports row with status='submitted' for the tampered outbox.

We test the SignatureContext logic directly (no live worker poll needed).
"""

from __future__ import annotations

import pytest

from hedge_hmac import SigningContext  # type: ignore


def test_tampered_signature_is_rejected():
    s = SigningContext.from_env("RISK_DECISION_KEY")
    payload = {"decision_id": "abc", "leg_index": 0, "order": {"size": 1.0}}
    good = s.sign(payload)
    assert s.verify(payload, good)

    # Tamper.
    tampered = good[:-1] + ("0" if good[-1] != "0" else "1")
    assert not s.verify(payload, tampered), "Tampered signature MUST not verify"

    # Tamper payload (any field).
    payload_tampered = {**payload, "order": {"size": 999.0}}
    assert not s.verify(payload_tampered, good), "Modified payload MUST not verify under original sig"


def test_wrong_key_id_is_rejected():
    s = SigningContext.from_env("RISK_DECISION_KEY")
    payload = {"a": 1}
    good = s.sign(payload)
    # Replace key prefix.
    fake = "vX." + good.split(".", 1)[1]
    assert not s.verify(payload, fake)
