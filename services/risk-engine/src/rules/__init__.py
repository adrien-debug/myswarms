"""Risk Engine rules — pure deterministic functions.

Each rule is a pure function. No I/O, no LLM, no global state.
Each returns (passed: bool, eval: dict) so the orchestrator can decide
APPROVE / RESIZE / REJECT based on the full set.

Ordering inside `evaluator.py` matters: kill switches and stale-portfolio
checks come FIRST and short-circuit before sizing math.
"""

from .atr import atr_vol_target_size
from .cvar import cvar_99_historical
from .drawdown import drawdown_within_limit
from .kelly import kelly_fraction_capped
from .sizing import compute_notional_and_margin, resolve_sized_order

__all__ = [
    "atr_vol_target_size",
    "cvar_99_historical",
    "drawdown_within_limit",
    "kelly_fraction_capped",
    "compute_notional_and_margin",
    "resolve_sized_order",
]
