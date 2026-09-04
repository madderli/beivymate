from beivymate.configuration.models import WorkflowDefinition
from beivymate.knowledge.models import KnowledgeRequirement
from beivymate.knowledge.service import KnowledgeService
from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow


class KnowledgeCheckSkill(Skill):

    def knowledge_requirements(
        self,
    ) -> list[KnowledgeRequirement]:
        return [
            KnowledgeRequirement(
                category = "testing",
                nature="foundational",
            )
        ]

    def execute(
        self,
        context: AgentContext,
    ) -> None:
        knowledge = context.get_knowledge()

        assert len(knowledge) == 1
        assert knowledge[0].id == "testing_basic"

        requirements = (
            context.get_knowledge_requirements()
        )

        assert len(requirements) == 1
        assert requirements[0].category == "testing"
        assert requirements[0].nature == "foundational"


def test_runtime_loads_knowledge_before_workflow_execution(
    tmp_path,
):

    knowledge_file = tmp_path / "testing_basic.md"

    knowledge_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Basic testing knowledge
        category: testing
        roles:
        - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: 1.0
        source_type: markdown
        ---

        # Testing Basic

        Basic software testing knowledge.
        """,
        encoding = "utf-8",
    )

    knowledge_service = KnowledgeService(
        tmp_path
    )

    definition = WorkflowDefinition(
        id = "runtime_knowledge_test",
        name = "Runtime Knowledge Test",
        description = "Test runtime knowledge loading.",
        steps = [
            "knowledge_check",
        ],
    )

    workflow = Workflow(
        definition = definition,
        skills = [
            KnowledgeCheckSkill(),
        ],
    )

    runtime = Runtime(
        skill_registry = SkillRegistry(),
        knowledge_service = knowledge_service,
    )

    context = AgentContext()

    context.set_role("tester")
    context.set_locale("zh-CN")

    result = runtime.run(
        workflow,
        context,
    )

    knowledge = result.get_knowledge()

    assert len(knowledge) == 1
    assert knowledge[0].id == "testing_basic"


def test_runtime_supports_multiple_knowledge_requirements(
    tmp_path,
):

    testing_file = tmp_path / "testing_basic.md"

    testing_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Testing knowledge
        category: testing
        roles:
        - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: 1.0
        source_type: markdown
        ---

        Testing knowledge.
        """,
        encoding = "utf-8",
    )

    product_file = tmp_path / "his_product.md"

    product_file.write_text(
        """---
        id: his_product
        name: HIS Product
        description: HIS product knowledge
        category: product
        roles:
        - tester
        scope: global
        nature: operational
        locale: zh-CN
        version: 1.0
        source_type: markdown
        ---

        HIS product knowledge.
        """,
        encoding ="utf-8",
    )

    class MultipleKnowledgeSkill(Skill):

        def knowledge_requirements(
            self,
        ) -> list[KnowledgeRequirement]:
            return [
                KnowledgeRequirement(
                    category ="testing",
                    nature = "foundational",
                ),
                KnowledgeRequirement(
                    category = "product",
                    nature = "operational",
                ),
            ]

        def execute(
            self,
            context: AgentContext,
        ) -> None:
            pass

    definition = WorkflowDefinition(
        id = "multiple_knowledge",
        name = "Multiple Knowledge",
        description = "Test multiple knowledge requirements.",
        steps = [
            "multiple_knowledge",
        ],
    )

    workflow = Workflow(
        definition = definition,
        skills = [
            MultipleKnowledgeSkill(),
        ],
    )

    runtime = Runtime(
        skill_registry = SkillRegistry(),
        knowledge_service = KnowledgeService(
            tmp_path
        ),
    )

    context = AgentContext()

    context.set_role("tester")
    context.set_locale("zh-CN")

    result = runtime.run(
        workflow,
        context,
    )

    knowledge = result.get_knowledge()

    assert len(knowledge) == 2

    knowledge_ids = {
        document.id
        for document in knowledge
    }

    assert knowledge_ids == {
        "testing_basic",
        "his_product",
    }


def test_runtime_deduplicates_knowledge(
    tmp_path,
):

    knowledge_file = tmp_path / "testing_basic.md"

    knowledge_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Testing knowledge
        category: testing
        roles:
        - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: 1.0
        source_type: markdown
        ---

        Testing knowledge.
        """,
        encoding ="utf-8",
    )

    class DuplicateKnowledgeSkill(Skill):

        def knowledge_requirements(
            self,
        ) -> list[KnowledgeRequirement]:
            return [
                KnowledgeRequirement(
                    category ="testing",
                    nature = "foundational",
                ),
                KnowledgeRequirement(
                    category = "testing",
                    nature = "foundational",
                ),
            ]

        def execute(
            self,
            context: AgentContext,
        ) -> None:
            pass

    definition = WorkflowDefinition(
        id = "duplicate_knowledge",
        name = "Duplicate Knowledge",
        description = "Test knowledge deduplication.",
        steps = [
            "duplicate_knowledge",
        ],
    )

    workflow = Workflow(
        definition = definition,
        skills = [
            DuplicateKnowledgeSkill(),
        ],
    )

    runtime = Runtime(
        skill_registry = SkillRegistry(),
        knowledge_service = KnowledgeService(
            tmp_path
        ),
    )

    context = AgentContext()

    context.set_role("tester")
    context.set_locale("zh-CN")

    result = runtime.run(
        workflow,
        context,
    )

    knowledge = result.get_knowledge()

    assert len(knowledge) == 1
    assert knowledge[0].id == "testing_basic"


def test_runtime_runs_without_knowledge_service():

    class EmptySkill(Skill):

        def execute(
            self,
            context: AgentContext,
        ) -> None:
            pass

    definition = WorkflowDefinition(
        id ="runtime_test",
        name = "Runtime Test",
        description = "Test runtime without knowledge.",
        steps = [
            "empty_skill",
        ],
    )

    workflow = Workflow(
        definition = definition,
        skills = [
            EmptySkill(),
        ],
    )

    runtime = Runtime(
        skill_registry = SkillRegistry(),
    )

    context = runtime.run(
        workflow
    )

    assert context.get_knowledge() == []
    assert context.get_knowledge_requirements() == []