from abc import ABC, abstractmethod

from beivymate.knowledge.models import KnowledgeRequirement
from beivymate.runtime.context import AgentContext

class Skill(ABC):

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