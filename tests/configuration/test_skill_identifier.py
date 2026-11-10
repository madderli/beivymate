"""Offline generation is distinct from unrestricted Chinese-to-English translation."""
import re

import pytest

from beivymate.configuration.skill_identifier import english_identifier


@pytest.mark.parametrize(('name', 'expected'), [
    ('需求理解', 'requirement-understanding'),
    ('测试分析', 'test-analysis'),
    ('测试设计', 'test-design'),
    ('测试理解（测试）', 'test-understanding-test'),
    ('会议纪要整理', 'meeting-notes-organization'),
    ('支付异常分析', 'payment-exception-analysis'),
    ('客户反馈分类', 'customer-feedback-classification'),
    ('接口测试用例生成', 'api-test-case-generation'),
    ('API接口测试', 'api-api-test'),
    ('MeetingNotes', 'meeting-notes'),
    ('APIResponseCheck', 'api-response-check'),
    ('  Test Report 2026  ', 'test-report-2026'),
    ('ＡＰＩ测试', 'api-test'),
    ('报告' * 40, None),
])
def test_english_identifiers_are_normalized_and_bounded(name, expected):
    result, message = english_identifier(name)
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', result)
    assert len(result) <= 54
    if expected is not None:
        assert result == expected
        assert not message


def test_unknown_names_use_stable_english_code_not_pinyin():
    name = '苜蓿斑鸠'
    first, message = english_identifier(name)
    assert first == english_identifier(name)[0]
    assert re.fullmatch(r'custom-skill-[0-9a-f]{10}', first)
    assert message and '可自行修改' in message
    assert english_identifier('苜蓿斑鸠甲')[0] != first
