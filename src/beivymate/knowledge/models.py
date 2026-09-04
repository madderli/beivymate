from typing import Literal

from pydantic import BaseModel, Field


KnowledgeNature = Literal["foundational", "operational"]


class KnowledgeDocument(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    description: str = ""

    # What domain the knowledge belongs to.
    # Examples: it, testing, domain, product, customer.
    category: str = Field(min_length = 1)

    # Who can use this knowledge.
    # "shared" means available to all roles.
    roles: list[str] = Field(min_length = 1)

    # Knowledge scope.
    # Examples: global, product:his, customer:hospital_a.
    scope: str = Field(default = "global", min_length = 1)

    # Foundational knowledge is relatively stable.
    # Operational knowledge changes with products/customers/tasks.
    nature: KnowledgeNature

    # Knowledge language.
    # Examples: zh-CN, en-US.
    locale: str = Field(min_length = 1)

    version: str = Field(min_length = 1)

    # Current MVP supports Markdown.
    source_type: str = Field(min_length = 1)

    # Original source/path information.
    source: str = Field(min_length = 1)

    # Actual knowledge content.
    content: str = ""

class KnowledgeQuery(BaseModel):
    role: str = Field(min_length = 1)
    locale: str = Field(min_length = 1)
    scope: str = Field(default = "global", min_length = 1)
    category: str | None = None
    nature: KnowledgeNature | None = None

class KnowledgeRequirement(BaseModel):
    category: str | None = None
    nature: KnowledgeNature | None = None