from pathlib import Path

from reportlab.pdfgen import canvas

from beivymate.knowledge.discovery import (
    KnowledgeDiscovery,
)


def write_markdown_knowledge(
    path: Path,
) -> None:

    path.parent.mkdir(
        parents = True,
        exist_ok = True,
    )

    path.write_text(
        """---
        id: test_design
        name: Test Design
        category: testing
        roles:
        - tester
        scope: global
        nature: foundational
        locale: en-US
        version: "1.0"
        ---

        Test design knowledge.
        """,
        encoding = "utf-8",
    )


def write_pdf(
    path: Path,
) -> None:

    pdf = canvas.Canvas(
        str(path)
    )

    pdf.drawString(
        72,
        720,
        "PDF testing knowledge.",
    )

    pdf.save()


def write_pdf_metadata(
    path: Path,
) -> None:

    path.write_text(
        """---
        id: pdf_testing
        name: PDF Testing Knowledge
        category: testing
        roles:
        - tester
        scope: global
        nature: foundational
        locale: en-US
        version: "1.0"
        ---
        """,
        encoding = "utf-8",
    )


def test_discover_markdown_and_pdf_knowledge(
    tmp_path: Path,
):

    root = (
        tmp_path
        / "knowledge"
    )

    root.mkdir()

    write_markdown_knowledge(
        root
        / "test_design.md"
    )

    pdf_path = (
        root
        / "pdf_testing.pdf"
    )

    write_pdf(
        pdf_path
    )

    write_pdf_metadata(
        root
        / "pdf_testing.meta.md"
    )

    documents = (
        KnowledgeDiscovery()
        .discover(root)
    )

    assert len(documents) == 2

    ids = {
        document.id
        for document in documents
    }

    assert ids == {
        "test_design",
        "pdf_testing",
    }


def test_discovery_does_not_load_pdf_metadata_as_knowledge(
    tmp_path: Path,
):

    root = (
        tmp_path
        / "knowledge"
    )

    root.mkdir()

    pdf_path = (
        root
        / "pdf_testing.pdf"
    )

    write_pdf(
        pdf_path
    )

    write_pdf_metadata(
        root
        / "pdf_testing.meta.md"
    )

    documents = (
        KnowledgeDiscovery()
        .discover(root)
    )

    assert len(documents) == 1

    assert (
        documents[0].id
        == "pdf_testing"
    )


def test_discover_empty_directory(
    tmp_path: Path,
):

    root = (
        tmp_path
        / "knowledge"
    )

    root.mkdir()

    assert (
        KnowledgeDiscovery()
        .discover(root)
        == []
    )


def test_discover_missing_directory(
    tmp_path: Path,
):

    root = (
        tmp_path
        / "knowledge"
    )

    assert (
        KnowledgeDiscovery()
        .discover(root)
        == []
    )