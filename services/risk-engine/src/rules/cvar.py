"""CVaR99 via historical simulation.

CVaR99 = mean loss in the worst 1% of historical outcomes.
We compute it for a hypothetical position of size `size_base` at price `entry_price`,
given a sample of recent log-returns for the asset.

Deterministic given the same inputs. No randomness.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True)
class CvarResult:
    cvar_99_pct: float          # loss as positive fraction of notional (e.g. 0.018 = 1.8%)
    notional_usd: float
    passed: bool                # cvar_99_pct <= limit
    limit_pct: float


def cvar_99_historical(
    *,
    log_returns: NDArray[np.float64],
    side: str,                  # 'long' or 'short'
    leverage: float,
    entry_price: float,
    size_base: float,
    limit_pct: float,
) -> CvarResult:
    """Compute CVaR99 on the proposed position.

    log_returns: 1-step log returns sample (e.g. last 500 candles at the spec timeframe).
    For longs, P&L per unit = (price * (e^r - 1)). For shorts, negate.
    Leverage scales the loss in % of margin.
    """
    if log_returns.size < 20:  # smoke test
        raise ValueError("Need at least 20 log-return samples for CVaR99 (smoke test)")

    # P&L distribution (relative to notional) per 1 step.
    pct_returns = np.exp(log_returns) - 1.0
    if side == "short":
        pct_returns = -pct_returns

    # Leverage amplifies relative to margin (the equity at risk).
    leveraged_pct = pct_returns * leverage

    # Worst 1% tail.
    losses = -leveraged_pct  # losses positive
    threshold = np.quantile(losses, 0.99)
    tail = losses[losses >= threshold]
    cvar = float(tail.mean()) if tail.size > 0 else float(threshold)

    notional_usd = size_base * entry_price
    return CvarResult(
        cvar_99_pct=cvar,
        notional_usd=notional_usd,
        passed=cvar <= limit_pct,
        limit_pct=limit_pct,
    )
