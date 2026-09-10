"""Usage: python -m beivymate.evaluation.report reviews.json report.json"""
import argparse
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(min_length=1)
    artifact_id: str = Field(min_length=1)
    rubric_version: str = Field(min_length=1)
    reviewer: str = Field(min_length=1)
    structured_valid: bool
    # Keys are predeclared expected checkpoints; pending is never treated as covered.
    checkpoints: dict[str, Literal["covered", "missing", "pending"]] = Field(min_length=1)
    unsupported_findings: int = Field(default=0, ge=0)


class EvaluationSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reviews: list[Review] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_cases(self):
        if len({review.case_id for review in self.reviews}) != len(self.reviews):
            raise ValueError("Duplicate evaluation case IDs")
        return self

    def report(self):
        statuses = [value for review in self.reviews for value in review.checkpoints.values()]
        assessed = sum(value != "pending" for value in statuses)
        return {
            "cases": len(self.reviews),
            "structured_valid_rate": sum(review.structured_valid for review in self.reviews) / len(self.reviews),
            "expected_checkpoints": len(statuses), "assessed_checkpoints": assessed,
            "pending_checkpoints": statuses.count("pending"),
            "omission_rate_assessed_only": statuses.count("missing") / assessed if assessed else None,
            "review_complete": "pending" not in statuses,
            "unsupported_findings": sum(review.unsupported_findings for review in self.reviews),
        }


def main():
    parser = argparse.ArgumentParser(description="Aggregate human-reviewed evaluation records without calling a model")
    parser.add_argument("reviews", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    import json
    evaluation = EvaluationSet.model_validate_json(args.reviews.read_text(encoding="utf-8"))
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(evaluation.report(), stream, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
