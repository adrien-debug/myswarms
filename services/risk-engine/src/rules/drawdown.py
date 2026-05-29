"""Drawdown limit check.

If current 30d drawdown already exceeds the tenant limit → REJECT outright.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DrawdownResult:
    drawdown_pct: float
    limit_pct: float
    within_limit: bool


def drawdown_within_limit(
    *,
    current_drawdown_pct: float,
    max_drawdown_pct: float,
) -> DrawdownResult:
    return DrawdownResult(
        drawdown_pct=current_drawdown_pct,
        limit_pct=max_drawdown_pct,
        within_limit=current_drawdown_pct < max_drawdown_pct,
    )
