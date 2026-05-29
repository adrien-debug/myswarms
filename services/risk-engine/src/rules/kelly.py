"""Kelly fraction with hard cap.

f* = (p*b - q) / b
  where p = win probability, q = 1-p, b = win/loss payoff ratio.

We cap at `kelly_cap` (typically 0.25) — full Kelly is too aggressive for
real-world conditions where win-rate/payoff are estimated.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KellyResult:
    raw_kelly: float            # may be negative or >1
    applied_fraction: float     # clamped to [0, kelly_cap]
    cap: float
    capped: bool


def kelly_fraction_capped(
    *,
    win_rate: float,
    rr_ratio: float,            # payoff ratio b = avg_win / avg_loss
    kelly_cap: float,
) -> KellyResult:
    if not (0 < win_rate < 1):
        # Degenerate inputs — Kelly is undefined, treat as zero.
        return KellyResult(raw_kelly=0.0, applied_fraction=0.0, cap=kelly_cap, capped=False)
    if rr_ratio <= 0:
        return KellyResult(raw_kelly=0.0, applied_fraction=0.0, cap=kelly_cap, capped=False)

    p = win_rate
    q = 1.0 - p
    b = rr_ratio
    raw = (p * b - q) / b

    applied = max(0.0, min(raw, kelly_cap))
    return KellyResult(
        raw_kelly=raw,
        applied_fraction=applied,
        cap=kelly_cap,
        capped=raw > kelly_cap,
    )
