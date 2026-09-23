"""Validate bytes before recording a deliverable under a claimed file extension."""
import io
import json
from pathlib import Path
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree


def validate_content(filename: str, content: bytes) -> None:
    suffix = Path(filename).suffix
    try:
        if suffix == '.json':
            json.loads(content)
        elif suffix in ('.md', '.txt', '.html'):
            content.decode('utf-8')
        elif suffix in ('.xlsx', '.docx'):
            marker = 'xl/workbook.xml' if suffix == '.xlsx' else 'word/document.xml'
            with ZipFile(io.BytesIO(content)) as package:
                for name in ('[Content_Types].xml', marker):
                    if package.getinfo(name).file_size > 16 * 1024 * 1024:
                        raise ValueError('Office 文档元数据过大')
                    ElementTree.fromstring(package.read(name))
        elif suffix == '.png':
            if not content.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('不是 PNG 文件')
        else:
            raise ValueError('未支持的产物格式')
    except (ValueError, UnicodeError, BadZipFile, KeyError, ElementTree.ParseError) as exc:
        raise ValueError('产物内容与声明格式不一致：' + filename) from exc
