from io import BytesIO
from zipfile import ZipFile
import pytest
from beivymate.application.attachment_text import extract

def test_word_and_excel_text_are_explicit():
    stream = BytesIO()
    with ZipFile(stream, 'w') as archive:
        archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>支付要求</w:t></w:r></w:p></w:body></w:document>')
    text, method = extract('需求.docx', stream.getvalue())
    assert text == '支付要求' and '不包含图片' in method
    from openpyxl import Workbook
    stream = BytesIO()
    book = Workbook()
    book.active.append(['支付', '=1+1'])
    book.save(stream)
    text, method = extract('需求.xlsx', stream.getvalue())
    assert '支付' in text and '=1+1' in text and '不执行公式' in method

@pytest.mark.parametrize('name,data', [('需求.png',b'image'),('坏文档.docx',b'invalid'),('空.txt',b''),('大.txt',b'x'*200001)])
def test_unusable_attachments_are_rejected_without_silent_truncation(name, data):
    with pytest.raises(ValueError, match='解析失败'):
        extract(name, data)
