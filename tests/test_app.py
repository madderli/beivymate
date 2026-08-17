from beivymate.application.app import main
from pydantic import BaseModel

class TestConfig(BaseModel):
    name: str


def test_main(capsys) -> None:
    main()

    captured = capsys.readouterr()

    assert "Starting the application..." in captured.out
    assert "BeIvyMate is a AI Worker Agent." in captured.out

def test_pydantic() -> None:
    config = TestConfig(name="beivymate")
    assert config.name == "beivymate"
