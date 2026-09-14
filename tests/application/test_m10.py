import json
import runpy
from pathlib import Path
from beivymate.application import app
from beivymate.runtime.llm.gateway import LLMGateway

ROOT=Path(__file__).resolve().parents[2]


def test_mvp_cli_offline(tmp_path,monkeypatch):
    design_provider=runpy.run_path(str(ROOT/'tests/execution/test_full_pipeline.py'))['SyntheticProvider']()
    report_provider=runpy.run_path(str(ROOT/'tests/reporting/test_report.py'))['Provider']()
    class Provider:
        def chat(self,request):
            if request.response_schema.get('title')=='ReportAssessment':return report_provider.chat(request)
            response=design_provider.chat(request)
            if design_provider.calls==3:
                data=json.loads(response.content)
                for case in data['cases']:case.pop('project_id',None)
                response.content=json.dumps(data,ensure_ascii=False)
            return response
    monkeypatch.setattr(app,'create_gateway',lambda **kwargs:LLMGateway(Provider()))
    requirement=tmp_path/'requirement.md';requirement.write_text('支付成功更新状态并生成流水号；失败提示并保持状态。')
    output=tmp_path/'acceptance'
    validation = runpy.run_path(str(ROOT/'tests/validation/validate_mvp.py'))
    validation['main'](['--requirement',str(requirement),'--output',str(output)])
    summary=json.loads((output/'validation-summary.json').read_text())
    assert summary['status']=='completed' and summary['execution_rounds']==3
    assert summary['final_counts']=={'pass':3,'failed':0,'blocked':0,'not_run':0}
    assert len(summary['calls'])==4
    assert (Path(summary['report_directory'])/'report.docx').exists()


def test_mvp_connection_failure_retains_checkpoint(tmp_path):
    import pytest
    validate_mvp = runpy.run_path(str(ROOT/'tests/validation/validate_mvp.py'))['validate_mvp']
    from beivymate.model.entity.requirement import Requirement
    class OfflineFailure:
        def chat(self,request):raise RuntimeError('simulated unavailable model')
    output=tmp_path/'failure'
    with pytest.raises(RuntimeError,match='unavailable'):
        validate_mvp(Requirement(id='R',title='T',content='C'),output,LLMGateway(OfflineFailure()),'fake')
    summary=json.loads((output/'validation-summary.json').read_text())
    assert summary['status']=='failed' and summary['calls'][0]['status']=='failed'
    assert (output/'design-checkpoint.json').exists()
