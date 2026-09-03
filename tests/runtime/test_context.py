from beivymate.runtime.context import AgentContext

def test_context_set_and_get() -> None:
    context = AgentContext()

    context.set("key1", "value1")

    assert context.get("key1") == "value1"
    assert context.get("nonexistent_key", "default") == "default"

def test_context_get_missing_key_returns_default() -> None:
    context = AgentContext()

    assert context.get("missing") is None
    assert context.get("missing", "default") == "default"

def test_context_has() -> None:
    context = AgentContext()
    context.set("key1", "value1")

    assert context.has("key1") == True
    assert context.has("nonexistent_key") == False

def test_context_default_value() -> None:
    context = AgentContext()

    assert context.get("nonexistent_key") is None
    assert context.get("nonexistent_key", "default") == "default"
    
def test_context_contains() -> None:
    context = AgentContext()

    context.set("name", "BeivyMate")

    assert context.has("name")
    assert not context.has("missing")

def test_context_clear() -> None:
    context = AgentContext()

    context.set("key1", "value1")
    context.set("key2", "value2")

    assert context.has("key1") == True
    assert context.has("key2") == True

    context.clear()
    
    assert context.has("key1") == False
    assert context.has("key2") == False
