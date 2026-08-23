from beivymate.runtime.llm.models import (
    LLMConnectionConfig,
)


def test_llm_connection_config_defaults():

    config = LLMConnectionConfig(
        base_url="http://localhost:11434",
    )

    assert config.base_url == "http://localhost:11434"
    assert config.proxy is None
    assert config.timeout == 60.0