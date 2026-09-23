"""Formats actually supplied by the registered executors, not customer promises."""
OUTPUT_FORMATS = {
    'requirement_understand': {'requirement_understanding': {'md', 'json'}},
    'test_analysis': {'test_analysis': {'md', 'json'}},
    'test_design': {
        'test_design': {'md'},
        'test_design_data': {'json'},
        'test_cases': {'xlsx'},
    },
    'test_execution': {
        'test_execution': {'json'},
        'execution_results': {'xlsx'},
        'defects': {'xlsx'},
        'execution_history': {'json'},
    },
    'test_report': {
        'test_report': {'md'},
        'test_report_data': {'json'},
        'test_report_word': {'docx'},
    },
}


def validate_outputs(executor, outputs, policies):
    contract = OUTPUT_FORMATS.get(executor)
    if contract is None:
        return  # Other registered executors can supply their own contracts.
    if set(outputs) != set(contract):
        raise ValueError('产物声明必须完整匹配执行器输出：' + ', '.join(contract))
    for policy in policies:
        if policy.filename.rsplit('.', 1)[-1] not in contract[policy.id]:
            raise ValueError('执行器不支持此产物格式：' + policy.id + ' / ' + policy.filename)
        if not policy.required:
            raise ValueError('执行器的必要交付物不能设为可选：' + policy.id)
