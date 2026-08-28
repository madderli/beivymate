from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]

WORKFLOW_DIRECTORY = (
    PROJECT_ROOT
    / "resources"
    / "configuration"
    / "workflow"
)


def main() -> None:
    """Application entry point."""

    print("Starting BeIvyMate...")
    print("BeIvyMate is an AI Worker Agent.")


if __name__ == "__main__":
    main()