"""ATR-based volatility targeting.

Target position size such that 1-ATR adverse move = `vol_target_pct` of equity.

  size_base = (equity * vol_target_pct) / (ATR_usd * leverage)

This is the production-standard sizing for trend strategies.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AtrSizeResult:
    size_base: float
    atr_usd: float
    target_loss_usd: float


def atr_vol_target_size(
    *,
    equity_usd: float,
    vol_target_pct: float,
    atr_usd: float,             # one-bar ATR in quote currency
    leverage: float,
) -> AtrSizeResult:
    if equity_usd <= 0 or vol_target_pct <= 0 or atr_usd <= 0 or leverage <= 0:
        return AtrSizeResult(size_base=0.0, atr_usd=atr_usd, target_loss_usd=0.0)

    target_loss = equity_usd * vol_target_pct
    size_base = target_loss / (atr_usd * leverage)
    return AtrSizeResult(
        size_base=size_base,
        atr_usd=atr_usd,
        target_loss_usd=target_loss,
    )
