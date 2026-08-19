from beivymate.runtime.context import AgentContext

def test_context_set_and_get() -> None:
    context = AgentContext()

    context.set("key1", "value1")

    assert context.get("key1") == "value1"
    assert context.get("nonexistent_key", "default") == "default"

def test_context_has() -> None:
    context = AgentContext()
    context.set("key1", "value1")

    assert context.has("key1") == True
    assert context.has("nonexistent_key") == False

def test_context_default_value() -> None:
    context = AgentContext()

    assert context.get("nonexistent_key") is None
    assert context.get("nonexistent_key", "default") == "default"
    

def test_context_clear() -> None:
    context = AgentContext()

    context.set("key1", "value1")
    context.set("key2", "value2")

    assert context.has("key1") == True
    assert context.has("key2") == True

    context.clear()
    
    assert context.has("key1") == False
    assert context.has("key2") == False