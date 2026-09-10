"""Keep normal test runs offline; real model checks require explicit opt-in."""
import socket
import inspect

import pytest


def pytest_addoption(parser):
    parser.addoption("--run-llm", action="store_true", default=False,
                     help="Run integration tests that contact a local LLM service")


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--run-llm"):
        skip = pytest.mark.skip(reason="Real LLM test: pass --run-llm to opt in")
        for item in items:
            if item.get_closest_marker("llm") is not None:
                item.add_marker(skip)


def pytest_pycollect_makeitem(collector, name, obj):
    # Imported domain classes named Test* are not test suites.
    if inspect.isclass(obj) and obj.__module__ != collector.module.__name__:
        return []


@pytest.fixture(autouse=True)
def offline_by_default(request, monkeypatch):
    if request.node.get_closest_marker("llm") and request.config.getoption("--run-llm"):
        return

    def blocked(*args, **kwargs):
        raise RuntimeError("Network access is disabled for offline tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
