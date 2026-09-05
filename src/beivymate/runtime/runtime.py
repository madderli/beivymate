from pathlib import Path

from beivymate.configuration.loader import load_workflow_definition
from beivymate.knowledge.models import KnowledgeDocument, KnowledgeQuery
from beivymate.knowledge.service import KnowledgeService
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow


# Execute the workflow within agent runtime.
class Runtime:

    def __init__(
        self,
        skill_registry: SkillRegistry,
        knowledge_service: KnowledgeService | None = None,
    ) -> None:
        self._skill_registry = skill_registry
        self._knowledge_service = knowledge_service

    # Load a workflow from user configuration.
    def load_workflow(
        self,
        path: str,
    ) -> Workflow:

        definition = load_workflow_definition(
            Path(path)
        )

        skills = self._skill_registry.resolve(
            definition.steps
        )

        return Workflow(
            definition = definition,
            skills = skills,
        )

    # Execute a workflow.
    def run(
        self,
        workflow: Workflow,
        context: AgentContext | None = None,
    ) -> AgentContext:
        
        if context is None:
            context = AgentContext()

        for skill in workflow.skills:
            requirements = skill.knowledge_requirements()

            context.set_knowledge_requirements(requirements)

            knowledge_by_id: dict[str, KnowledgeDocument] = {}

            if (
                requirements is not None
                and self._knowledge_service is not None
            ):
                role = context.get_role()
                locale = context.get_locale()

                if role is not None and locale is not None:
                    for requirement in requirements:    
                        query = KnowledgeQuery(
                            role = role,
                            locale = locale,
                            scope = context.get_scope(),
                            category = requirement.category,
                            nature = requirement.nature,
                        )

                        selected = self._knowledge_service.select(query)

                        for document in selected:
                            knowledge_by_id[document.id] = document

            context.set_knowledge(
                list(knowledge_by_id.values())
            )

            skill.execute(context)

        return context