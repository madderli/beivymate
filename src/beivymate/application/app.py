from pathlib import Path

from beivymate.application.composition import (
    create_tester_agent,
)
from beivymate.configuration.loader import (
    load_model_definition,
)
from beivymate.model.entity.requirement import (
    Requirement,
)
from beivymate.runtime.llm.gateway import (
    LLMGateway,
)
from beivymate.runtime.llm.models import (
    LLMConnectionConfig,
)
from beivymate.runtime.llm.providers.ollama import (
    OllamaProvider,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]

CONFIGURATION_ROOT = (
    PROJECT_ROOT
    / "resources"
    / "configuration"
)

MODEL_PATH = (
    CONFIGURATION_ROOT
    / "llm"
    / "model"
    / "qwen3-8b.md"
)

WORKFLOW_PATH = (
    CONFIGURATION_ROOT
    / "workflow"
    / "smoke_test.md"
)


def create_gateway(
    provider: str,
    base_url: str,
    timeout: float,
) -> LLMGateway:

    if provider == "ollama":

        connection_config = LLMConnectionConfig(
            base_url = base_url,
            timeout = timeout,
    
        )

        llm_provider = OllamaProvider(
            config = connection_config,
        )

        return LLMGateway(
            provider = llm_provider,
        )

    raise ValueError(
        f"Unsupported LLM provider: {provider}"
    )


def main() -> None:

    print("Starting BeIvyMate...")
    print("Running tester requirement understanding validation.")

    model_definition = load_model_definition(
        MODEL_PATH
    )

    if not model_definition.enabled:
        raise ValueError(
            f"LLM model is disabled: {model_definition.id}"
        )

    if model_definition.base_url is None:
        raise ValueError(
            f"LLM model base_url is missing: {model_definition.id}"
        )
    
    gateway = create_gateway(
        provider = model_definition.provider,
        base_url = model_definition.base_url,
        timeout = model_definition.timeout,
    )

    agent = create_tester_agent(
        workflow_path = str(
            WORKFLOW_PATH
        ),
        gateway = gateway,
        model = model_definition.model,
        locale = "zh-CN",
    )

    requirement = Requirement(
        id = "REQ-PAY-001",
        title = "新增微信支付",
        content = (
            "患者在门诊缴费时，可以选择微信支付。"
            "支付成功后，系统需要更新缴费状态为“已支付”，"
            "并生成支付流水号。"
            "如果微信支付失败，系统应提示支付失败，"
            "且不能更新缴费状态。"
        ),
    )

    context = agent.run(
        requirement
    )

    result = context.get(
        "tester_requirement_understanding"
    )

    print()
    print("=== Requirement ===")
    print(
        f"ID: {requirement.id}"
    )
    print(
        f"Title: {requirement.title}"
    )
    print(
        f"Content: {requirement.content}"
    )

    print()
    print(
        "=== Tester Requirement Understanding ==="
    )

    if result is None:
        print(
            "No requirement understanding result."
        )
        return

    print(result)


if __name__ == "__main__":
    main()