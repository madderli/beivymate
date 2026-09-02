from beivymate.knowledge.models import KnowledgeDocument
from beivymate.knowledge.selector import (
    KnowledgeQuery,
    KnowledgeSelector,
)


def document(
    knowledge_id: str,
    *,
    category: str,
    roles: list[str],
    scope: str = "global",
    nature: str = "foundational",
    locale: str = "zh-CN",
) -> KnowledgeDocument:
    return KnowledgeDocument(
        id = knowledge_id,
        name = knowledge_id,
        category = category,
        roles = roles,
        scope = scope,
        nature = nature,
        locale = locale,
        version = "1.0",
        source_type = "markdown",
        source = f"{knowledge_id}.md",
        content = "knowledge",
    )


def test_selector_returns_role_specific_knowledge():
    documents = [
        document(
            "tester_knowledge",
            category = "testing",
            roles = ["tester"],
        ),
        document(
            "developer_knowledge",
            category = "it",
            roles = ["developer"],
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
    )

    result = KnowledgeSelector().select(documents, query)

    assert [item.id for item in result] == [
        "tester_knowledge"
    ]


def test_selector_returns_shared_knowledge():
    documents = [
        document(
            "shared_knowledge",
            category = "it",
            roles = ["shared"],
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
    )

    result = KnowledgeSelector().select(documents, query)

    assert [item.id for item in result] == [
        "shared_knowledge"
    ]


def test_selector_returns_global_knowledge_for_specific_scope():
    documents = [
        document(
            "global_knowledge",
            category = "testing",
            roles = ["tester"],
            scope = "global",
        ),
        document(
            "hospital_a_knowledge",
            category = "customer",
            roles = ["tester"],
            scope = "customer:hospital_a",
            nature = "operational",
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
        scope = "customer:hospital_a",
    )

    result = KnowledgeSelector().select(documents, query)

    assert {item.id for item in result} == {
        "global_knowledge",
        "hospital_a_knowledge",
    }


def test_selector_does_not_return_other_customer_scope():
    documents = [
        document(
            "hospital_a_knowledge",
            category = "customer",
            roles = ["tester"],
            scope = "customer:hospital_a",
            nature = "operational",
        ),
        document(
            "hospital_b_knowledge",
            category = "customer",
            roles = ["tester"],
            scope = "customer:hospital_b",
            nature = "operational",
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
        scope = "customer:hospital_a",
    )

    result = KnowledgeSelector().select(documents, query)

    assert [item.id for item in result] == [
        "hospital_a_knowledge"
    ]


def test_selector_filters_by_locale():
    documents = [
        document(
            "zh_knowledge",
            category = "testing",
            roles = ["tester"],
            locale = "zh-CN",
        ),
        document(
            "en_knowledge",
            category = "testing",
            roles = ["tester"],
            locale = "en-US",
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
    )

    result = KnowledgeSelector().select(documents, query)

    assert [item.id for item in result] == [
        "zh_knowledge"
    ]


def test_selector_filters_by_category():
    documents = [
        document(
            "testing_knowledge",
            category = "testing",
            roles = ["tester"],
        ),
        document(
            "it_knowledge",
            category = "it",
            roles = ["shared"],
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
        category = "testing",
    )

    result = KnowledgeSelector().select(documents, query)

    assert [item.id for item in result] == [
        "testing_knowledge"
    ]


def test_selector_filters_by_nature():
    documents = [
        document(
            "testing_basic",
            category = "testing",
            roles = ["tester"],
            nature = "foundational",
        ),
        document(
            "testing_operational",
            category = "testing",
            roles = ["tester"],
            nature = "operational",
        ),
    ]

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
        nature = "operational",
    )

    result = KnowledgeSelector().select(documents, query)

    assert [item.id for item in result] == [
        "testing_operational"
    ]