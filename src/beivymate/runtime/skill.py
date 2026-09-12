from abc import ABC, abstractmethod

from beivymate.knowledge.models import KnowledgeRequirement
from beivymate.runtime.context import AgentContext

class Skill(ABC):

    def on_accepted(self, context: AgentContext) -> None:
        """Idempotent projection of a persisted acceptance into local assets."""
        pass

    def can_auto_authorize(self) -> bool:
        """Unknown capabilities require human authorization by default."""
        return False

    def review_subject(self, context: AgentContext):
        """A stable, serializable deliverable to bind the decision to."""
        raise ValueError("Skill must declare a review subject for managed execution")

    def can_auto_accept(self, context: AgentContext) -> bool:
        return False

    def validate_acceptance(self, context: AgentContext) -> None:
        """Reject structurally invalid outputs even when reviewed manually."""
        pass

    def knowledge_requirements(
        self,
    ) -> list[KnowledgeRequirement]:
        return []

    @abstractmethod
    def execute(
        self, 
        context: AgentContext,
    ) -> None:
        pass
