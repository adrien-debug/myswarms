# Register security hooks at import time
from . import llm_hooks, tool_hooks  # noqa: F401 — side-effect imports (hook registration)
