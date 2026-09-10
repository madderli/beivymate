"""Input a requirement file and produce a durable tester-understanding deliverable."""
import argparse
import json
from pathlib import Path

from beivymate.application.app import create_gateway, MODEL_PATH
from beivymate.application.composition import TEMPLATE_ROOT, KNOWLEDGE_ROOT
from beivymate.configuration.loader import load_model_definition, load_template_definition
from beivymate.configuration.template_resolver import TemplateResolver
from beivymate.configuration.models import TemplateDefinition, WorkflowDefinition, WorkflowStepDefinition
from beivymate.agent.tester.skills.tester_requirement_understanding import TesterRequirementUnderstandingSkill
from beivymate.knowledge.service import KnowledgeService
from beivymate.knowledge.models import KnowledgeQuery
from beivymate.model.entity.requirement import Requirement
from beivymate.model.run import RunRecord
from beivymate.runtime.context import AgentContext
from beivymate.runtime.checkpoint import Checkpoint
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow


def runtime_for(template, gateway, model):
    registry = SkillRegistry()
    registry.register("tester_requirement_understanding", TesterRequirementUnderstandingSkill(gateway, model, template))
    return Runtime(registry)


def export(state, directory):
    context = AgentContext.restore(state.context)
    artifact = context.get("tester_requirement_understanding_artifact")
    if artifact:
        (directory / "understanding.json").write_text(artifact.model_dump_json(indent=2), encoding="utf-8")
        (directory / "understanding.md").write_text(artifact.markdown, encoding="utf-8")
    (directory / "summary.json").write_text(json.dumps({
        "run_id": state.run_id, "status": state.status,
        "structured_valid": artifact.validation_status == "structured" if artifact else False,
        "calls": context.get("llm_calls", []), "quality": context.get("stage_quality", []),
        "decisions": [d.model_dump(mode="json") for d in state.decisions], "error": state.error,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def start(requirement, directory, *, gateway, model, locale="zh-CN", review="manual", template=None):
    template = template or load_template_definition(TemplateResolver(TEMPLATE_ROOT).resolve_default(
        "tester", "tester_requirement_understanding", locale))
    directory.mkdir(parents=True, exist_ok=False)
    context = AgentContext()
    context.set("requirement", requirement)
    context.set_locale(locale)
    context.set_role("tester")
    context.set("task_id", requirement.id)
    # Freeze the selected knowledge before execution; resume never reloads it.
    context.set_knowledge(KnowledgeService(KNOWLEDGE_ROOT).select(KnowledgeQuery(role="tester", locale=locale)))
    context.set("frozen_knowledge", context.get_knowledge())
    context.set("execution_template", template.model_dump())
    context.set("execution_model", model)
    step = WorkflowStepDefinition(id="understand", skill="tester_requirement_understanding",
        inputs=["requirement"], review_mode=review, authorization_mode="auto")
    runtime = runtime_for(template, gateway, model)
    skill = runtime._skill_registry.get(step.skill)
    workflow = Workflow(WorkflowDefinition(id="understanding", name="Requirement understanding",
        steps=[step.skill], step_definitions=[step]), [skill])
    path = directory / "checkpoint.json"
    try:
        state = runtime.start(workflow, context, path)
    finally:
        if path.exists():
            state = Checkpoint.load(path)
            export(state, directory)
            RunRecord(id=state.run_id, task_id=requirement.id,
                      configuration_snapshot={"workflow": state.workflow.model_dump(),
                                              "template": template.model_dump(), "model": model}).save_new(directory / "run.json")
    return state


def main():
    parser = argparse.ArgumentParser(description="输入需求文件，生成测试人员需求理解结果")
    parser.add_argument("--requirement", type=Path)
    parser.add_argument("--id", default="REQ-001")
    parser.add_argument("--title", default="需求理解")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--locale", default="zh-CN")
    parser.add_argument("--model-config", type=Path, default=MODEL_PATH)
    parser.add_argument("--review", choices=["manual", "auto"], default="manual")
    parser.add_argument("--decision", choices=["approved", "rejected"])
    parser.add_argument("--actor")
    parser.add_argument("--subject-hash")
    args = parser.parse_args()
    config = load_model_definition(args.model_config)
    if not config.enabled or not config.base_url:
        parser.error("模型未启用或缺少地址")
    gateway = create_gateway(config.provider, config.base_url, config.timeout)
    if args.decision:
        state = Checkpoint.load(args.output / "checkpoint.json")
        context = AgentContext.restore(state.context)
        if config.model != context.get("execution_model"):
            parser.error("恢复必须使用原模型")
        template = TemplateDefinition.model_validate(context.get("execution_template"))
        state = runtime_for(template, gateway, config.model).resume(args.output / "checkpoint.json",
            decision=args.decision, actor=args.actor, expected_subject_hash=args.subject_hash)
        export(state, args.output)
    else:
        if not args.requirement:
            parser.error("请提供 --requirement")
        state = start(Requirement(id=args.id, title=args.title, content=args.requirement.read_text(encoding="utf-8")),
                      args.output, gateway=gateway, model=config.model, locale=args.locale, review=args.review)
    print(json.dumps({"status": state.status, "subject_hash": state.subject_hash,
                      "result": str(args.output / "understanding.md")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
