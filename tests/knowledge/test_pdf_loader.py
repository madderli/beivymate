from pathlib import Path

import pytest
from reportlab.pdfgen import canvas

from beivymate.knowledge.loaders.pdf import (
    PdfKnowledgeLoader,
)


def create_test_pdf(
    path: Path,
    text: str,
) -> None:

    pdf = canvas.Canvas(
        str(path)
    )

    pdf.drawString(
        72,
        720,
        text,
    )

    pdf.save()


def write_pdf_metadata(
    path: Path,
) -> None:

    path.write_text(
        """---
        id: software_testing_guide
        name: Software Testing Guide
        description: Basic testing knowledge.
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


def test_pdf_loader_supports_pdf():

    loader = PdfKnowledgeLoader()

    assert loader.supports(
        Path("guide.pdf")
    )

    assert not loader.supports(
        Path("guide.docx")
    )


def test_load_pdf_knowledge(
    tmp_path: Path,
):

    pdf_path = (
        tmp_path
        / "software_testing_guide.pdf"
    )

    metadata_path = (
        tmp_path
        / "software_testing_guide.meta.md"
    )

    create_test_pdf(
        pdf_path,
        "Boundary value analysis "
        "is a test design technique.",
    )

    write_pdf_metadata(
        metadata_path
    )

    documents = (
        PdfKnowledgeLoader()
        .load(pdf_path)
    )

    assert len(documents) == 1

    document = documents[0]

    assert (
        document.id
        == "software_testing_guide"
    )

    assert (
        document.category
        == "testing"
    )

    assert document.roles == [
        "tester"
    ]

    assert (
        document.nature
        == "foundational"
    )

    assert (
        document.locale
        == "en-US"
    )

    assert (
        document.source_type
        == "pdf"
    )

    assert (
        document.source
        == str(pdf_path)
    )

    assert (
        "Boundary value analysis"
        in document.content
    )


def test_pdf_loader_requires_metadata_file(
    tmp_path: Path,
):

    pdf_path = (
        tmp_path
        / "guide.pdf"
    )

    create_test_pdf(
        pdf_path,
        "Testing knowledge",
    )

    with pytest.raises(
        FileNotFoundError,
        match = "metadata file not found",
    ):
        PdfKnowledgeLoader().load(
            pdf_path
        )


def test_pdf_loader_rejects_non_pdf(
    tmp_path: Path,
):

    path = (
        tmp_path
        / "knowledge.txt"
    )

    path.write_text(
        "knowledge",
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError
    ):
        PdfKnowledgeLoader().load(
            path
        )