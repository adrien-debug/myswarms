from datetime import datetime, timezone

from crewai import Flow
from crewai.flow.flow import start
from pydantic import BaseModel


class ChiefOfStaffState(BaseModel):
    trigger: str = "on_demand"
    message: str = ""
    completed_at: str = ""


class ChiefOfStaffFlow(Flow[ChiefOfStaffState]):
    # Note: import from crewai.flow.flow — verbatim per docs/crewai/02-flows.md architecture
    @start()
    def hello(self) -> str:
        """Entry point — Hello World skeleton. Full 8-agent crew to be wired in next iteration."""
        self.state.message = (
            f"Hello from ChiefOfStaffFlow (trigger={self.state.trigger})"
        )
        self.state.completed_at = datetime.now(timezone.utc).isoformat()
        return self.state.message
