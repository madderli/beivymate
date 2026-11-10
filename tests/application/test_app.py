from beivymate.application import app
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import (
    LLMRequest,
    LLMResponse,
)


class FakeProvider:

    def chat(
        self,
        request: LLMRequest,
    ) -> LLMResponse:

        return LLMResponse(
            model=request.model,
            content=(
                "# 需求理解\n\n"
                "功能目标：支持患者使用微信支付。\n\n"
                "关键规则：支付成功后更新缴费状态，"
                "支付失败时不能更新缴费状态。"
            ),
        )


def test_main(
    monkeypatch,
    capsys,
) -> None:

    gateway = LLMGateway(
        provider = FakeProvider(),
    )

    monkeypatch.setattr(
        app,
        "create_gateway",
        lambda *args, **kwargs: gateway,
    )

    from functools import partial
    from pathlib import Path
    from beivymate.application import composition
    monkeypatch.setattr(app, 'create_tester_agent', partial(composition.create_tester_agent,
           builtin_skill_root=Path(__file__).resolve().parents[1]/'fixtures/legacy-resources/skills'),
       )
    app.main([])

    captured = capsys.readouterr()

    assert (
        "Tester Requirement Understanding"
        in captured.out
    )

    assert (
        "支持患者使用微信支付"
        in captured.out
    )