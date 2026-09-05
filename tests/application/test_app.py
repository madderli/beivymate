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

    app.main()

    captured = capsys.readouterr()

    assert (
        "Tester Requirement Understanding"
        in captured.out
    )

    assert (
        "支持患者使用微信支付"
        in captured.out
    )