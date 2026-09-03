from pathlib import Path

from beivymate.configuration.models import WorkflowDefinition
from beivymate.knowledge.models import KnowledgeQuery
from beivymate.knowledge.service import KnowledgeService
from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow


class KnowledgeCheckSkill(Skill):

    def execute(
        self,
        context: AgentContext,
    ) -> None:
        knowledge = context.get_knowledge()

        assert len(knowledge) == 1
        assert knowledge[0].id == "testing_basic"


def test_runtime_loads_knowledge_before_workflow_execution(
    tmp_path: Path,
):
    knowledge_file = tmp_path / "testing.md"

    knowledge_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Basic testing knowledge.
        category: testing
        roles:
          - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # Testing Basic

        This is testing knowledge.
        """,
        encoding = "utf-8",
    )

    knowledge_service = KnowledgeService(tmp_path)

    definition = WorkflowDefinition(
        id = "knowledge_test",
        name = "Knowledge Test",
        description = "Test runtime knowledge loading.",
        steps = ["knowledge_check"],
    )

    workflow = Workflow(
        definition = definition,
        skills = [KnowledgeCheckSkill()],
    )

    runtime = Runtime(
        skill_registry = SkillRegistry(),
        knowledge_service = knowledge_service,
    )

    context = AgentContext()

    context.set_role("tester")
    context.set_locale("zh-CN")

    context = runtime.run(
        workflow = workflow,
        context = context,
    )

    knowledge = context.get_knowledge()

    assert len(knowledge) == 1
    assert knowledge[0].id == "testing_basic"

def test_runtime_runs_without_knowledge_service():

    class EmptySkill(Skill):
        def execute(self, context: AgentContext) -> None:
            pass

    definition = WorkflowDefinition(
        id = "runtime_test",
        name = "Runtime Test",
        description = "Test runtime without knowledge.",
        steps = ["empty_skill"],
    )

    workflow = Workflow(
        definition = definition,
        skills = [EmptySkill()],
    )

    runtime = Runtime(
        skill_registry = SkillRegistry(),
    )

    context = runtime.run(workflow)

    assert context.get_knowledge() == []