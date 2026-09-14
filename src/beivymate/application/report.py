"""Generate a brief Word report from accepted design and execution checkpoints."""
import argparse
from pathlib import Path
from beivymate.application.app import create_gateway, MODEL_PATH
from beivymate.application.composition import TEMPLATE_ROOT
from beivymate.configuration.loader import load_model_definition
from beivymate.runtime.checkpoint import Checkpoint, digest
from beivymate.runtime.context import AgentContext
from beivymate.reporting.report import ReportService


def accepted(path,key):
    state=Checkpoint.load(path);artifact=AgentContext.restore(state.context).get(key)
    if artifact is None or not any(d.phase=='review' and d.decision=='approved' and
        d.artifact_id==artifact.id and d.subject_hash==digest(artifact) for d in state.decisions):
        raise ValueError('Checkpoint artifact is missing, unaccepted or changed: '+key)
    return artifact


def main():
    parser=argparse.ArgumentParser(description='生成简要测试报告，不作实际发布决定')
    parser.add_argument('--design-checkpoint',type=Path,required=True)
    parser.add_argument('--execution-checkpoint',type=Path,action='append',required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--model-config',type=Path,default=MODEL_PATH)
    parser.add_argument('--simulation',action='store_true')
    parser.add_argument('--template',type=Path,default=TEMPLATE_ROOT/'tester/test_report/zh-CN/DefaultBriefTestReportTemplate.docx')
    parser.add_argument('--previous-report',type=Path)
    args=parser.parse_args()
    import tempfile
    args.output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryFile(dir=args.output):pass
    u,a,d=[accepted(args.design_checkpoint,key) for key in
        ('tester_requirement_understanding_artifact','test_analysis_artifact','test_design_artifact')]
    rounds=[accepted(p,'test_execution_artifact') for p in args.execution_checkpoint]
    config=load_model_definition(args.model_config)
    if not config.enabled or not config.base_url:parser.error('Model unavailable')
    gateway=create_gateway(config.provider,config.base_url,config.timeout,api_key_env=config.api_key_env,max_retries=config.max_retries)
    service=ReportService(gateway,config.model,args.template)
    from beivymate.model.artifact.test_report import ReportArtifact
    previous=ReportArtifact.model_validate_json(args.previous_report.read_text()) if args.previous_report else None
    result=service.generate(u,a,d,rounds,simulation=args.simulation,previous=previous)
    directory=service.export(result,args.output)
    if gateway.last_metric:
        (directory/'usage.json').write_text(gateway.last_metric.model_dump_json(indent=2))
    print(directory)


if __name__=='__main__':main()
