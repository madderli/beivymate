from beivymate.application.app import main

def test_main(capsys) -> None:

    main()

    captured = capsys.readouterr()

    assert "Starting BeIvyMate..." in captured.out
    assert "BeIvyMate is an AI Worker Agent." in captured.out