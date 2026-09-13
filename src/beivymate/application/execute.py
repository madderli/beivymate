"""Explicit execution operations. Normal development tests never call a model."""
import argparse
import json
from pathlib import Path
from beivymate.execution.service import ExecutionService
from beivymate.model.artifact.test_execution import ExecutionPlan, StepObservation


def load_plan(path):
    text=path.read_text(encoding='utf-8')
    if path.suffix=='.md':
        parts=text.split('```json',1)
        if len(parts)!=2 or '```' not in parts[1]:
            raise ValueError('执行计划 Markdown 必须包含完整的 json 代码块；请使用默认示例或生成的计划文件')
        text=parts[1].split('```',1)[0]
    return ExecutionPlan.model_validate_json(text)


def main():
    parser=argparse.ArgumentParser(description='M8 测试执行与恢复')
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--task',required=True)
    sub=parser.add_subparsers(dest='command',required=True)
    start=sub.add_parser('start');start.add_argument('--plan',type=Path,required=True)
    design=sub.add_parser('start-design')
    for flag in ('design','assets','catalog','versions'):
        design.add_argument('--'+flag,type=Path,required=True)
    design.add_argument('--environment',required=True)
    design.add_argument('--actor',required=True)
    design.add_argument('--runner-ids',type=Path)
    design.add_argument('--modes',type=Path)
    verification=sub.add_parser('verify-defect')
    verification.add_argument('--defect-number',type=int,required=True)
    verification.add_argument('--round',type=int,required=True)
    verification.add_argument('--attempt',required=True)
    verification.add_argument('--actor',required=True)
    for name in ('begin','record','pause','resume','reconcile','script','finish','export'):
        p=sub.add_parser(name)
        if name!='export':p.add_argument('--round',type=int,required=True)
        if name in ('begin','script'):p.add_argument('--item',required=True)
        if name in ('record','pause','resume','reconcile'):p.add_argument('--attempt',required=True)
        if name in ('begin','script','reconcile'):p.add_argument('--actor',required=True)
        if name=='record':
            p.add_argument('--observation',type=Path,required=True)
            p.add_argument('--defect-number',type=int)
        if name=='resume':p.add_argument('--state-verified',action='store_true')
        if name=='reconcile':p.add_argument('--reason',required=True)
        if name=='script':
            p.add_argument('--defect-number',type=int)
            p.add_argument('--runners',type=Path,required=True)
            p.add_argument('--authorize',action='store_true')
    args=parser.parse_args();service=ExecutionService(args.directory,args.task);result=None
    if args.command=='start':result=service.start_round(load_plan(args.plan))
    elif args.command=='start-design':
        from beivymate.model.artifact.test_design import DesignArtifact, ProductCatalog
        from beivymate.assets.cases import CaseStore
        design=DesignArtifact.model_validate_json(args.design.read_text())
        store=CaseStore(args.assets,ProductCatalog.model_validate_json(args.catalog.read_text()))
        plan=service.from_design(design,store,environment=args.environment,
            versions=json.loads(args.versions.read_text()),executor=args.actor,
            modes=json.loads(args.modes.read_text()) if args.modes else None,
            runner_ids=json.loads(args.runner_ids.read_text()) if args.runner_ids else None)
        if any(i.mode=='automated' and (not i.runner_id or not i.case.automation_refs) for i in plan.items):
            parser.error('自动化计划缺少执行器映射或脚本关联；请补齐 --runner-ids 或用 --modes 明确选择手工')
        result=service.start_round(plan)
    elif args.command=='begin':result=service.begin(args.round,args.item,executor=args.actor)
    elif args.command=='record':service.record_step(args.round,args.attempt,StepObservation.model_validate_json(args.observation.read_text()),defect_number=args.defect_number)
    elif args.command in ('pause','resume'):service.pause_or_resume(args.round,args.attempt,resume=args.command=='resume',state_verified=getattr(args,'state_verified',False))
    elif args.command=='reconcile':service.reconcile(args.round,args.attempt,actor=args.actor,reason=args.reason)
    elif args.command=='script':result=service.run_script(args.round,args.item,executor=args.actor,runners=json.loads(args.runners.read_text()),authorized=args.authorize,defect_number=args.defect_number)
    elif args.command=='verify-defect':service.record_defect_verification(args.defect_number,args.round,args.attempt,actor=args.actor)
    elif args.command=='finish':result=service.finish(args.round)
    else:service.export()
    if result:print(result.model_dump_json(indent=2))


if __name__=='__main__':main()
