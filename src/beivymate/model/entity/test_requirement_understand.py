from pydantic import BaseModel, Field

# Requirement understanding from the perspective of a professional software tester.
class TesterRequirementUnderstanding(BaseModel):
 
    functional_objective: str = Field(min_length = 1)

    actors_roles: list[str] = Field(
        default_factory = list
    )

    main_business_flow: list[str] = Field(
        default_factory = list
    )

    business_rules: list[str] = Field(
        default_factory = list
    )

    preconditions: list[str] = Field(
        default_factory = list
    )

    inputs_outputs: list[str] = Field(
        default_factory = list
    )

    state_changes: list[str] = Field(
        default_factory = list
    )

    exception_scenarios: list[str] = Field(
        default_factory = list
    )

    boundary_conditions: list[str] = Field(
        default_factory = list
    )

    dependencies: list[str] = Field(
        default_factory = list
    )

    potential_risks: list[str] = Field(
        default_factory = list
    )

    ambiguous_or_missing_requirements: list[str] = Field(
        default_factory = list
    )