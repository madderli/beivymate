"""M10 acceptance harness: real stage implementations, explicitly simulated execution.

This is a source-environment validation entry, not the customer task launcher.
"""
import json
from pathlib import Path
from beivymate.application.composition import create_tester_agent, PROJECT_ROOT
from beivymate.assets.cases import CaseStore
from beivymate.execution.service import ExecutionService
from beivymate.model.artifact.test_design import ProductCatalog
from beivymate.model.artifact.test_execution import StepObservation
from beivymate.runtime.context import AgentContext
from beivymate.runtime.checkpoint import Checkpoint


def validate_mvp(requirement, output, gateway, model, *, rounds=3, catalog=None):
    if rounds<1:raise ValueError('At least one execution round is required')
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    catalog=catalog or ProductCatalog(products={'payment':'Func01'},functions=[
        {'id':'pay','product_id':'payment','name':'支付'}])
    store=CaseStore(output/'cases.db',catalog)
    (output/'requirement.json').write_text(requirement.model_dump_json(indent=2))
    (output/'requirement.md').write_text(requirement.content)
    (output/'catalog.json').write_text(catalog.model_dump_json(indent=2))
    workflow=PROJECT_ROOT/'resources/configuration/workflow/m7_test_design.md'
    def agent():return create_tester_agent(str(workflow),gateway,model,design_store=store)
    context=AgentContext()
    for key,value in {'actor':'validation-agent','maintainer':'validation-owner',
        'target_versions':{product:'1' for product in catalog.products},'design_output_directory':str(output)}.items():context.set(key,value)
    checkpoint=output/'design-checkpoint.json'
    summary={'simulation':True,'execution_mode':'simulated_manual','model':model,'status':'running','calls':[]}
    def save(state):
        ctx=AgentContext.restore(state.context)
        for key,name in [('requirement_understand_artifact','requirement_understand'),('test_analysis_artifact','analysis'),('test_design_artifact','design')]:
            artifact=ctx.get(key)
            if artifact:
                (output/(name+'.json')).write_text(artifact.model_dump_json(indent=2))
                (output/(name+'.md')).write_text(artifact.markdown)
        summary['calls']=ctx.get('llm_calls',[])
        return ctx
    try:
        state=agent().start(requirement,checkpoint,task_id='M10-VALIDATION',context=context)
        for name in ('understanding','analysis','design'):
            ctx=save(state)
            print(f'{name}: {state.status}',flush=True)
            state=agent().resume(checkpoint,decision='approved',actor='validation-agent',
                comment='仅为模拟执行的技术串联验收，不是人类业务批准',expected_subject_hash=state.subject_hash)
        ctx=save(state);design=ctx.get('test_design_artifact')
        execution=ExecutionService(output/'execution','M10-VALIDATION')
        plan=execution.from_design(design,store,environment='SIMULATED-ENV',versions={p:'1' for p in catalog.products},
            executor='simulation-driver',modes={c.id:'manual' for c in design.case_revisions})
        plan.defect_mode='auto'
        for number in range(1,rounds+1):
            execution.start_round(plan)
            for index,item in enumerate(plan.items):
                attempt=execution.begin(number,item.id,executor='simulation-driver')
                if attempt.status=='blocked':continue  # Never erase unresolved upstream blockers.
                result='failed' if index==0 and number<rounds else 'blocked' if index==1 and number==1 else 'pass'
                for step in range(1,len(item.case.steps)+1):
                    outcome=result if step==len(item.case.steps) else 'pass'
                    execution.record_step(number,attempt.id,StepObservation(step=step,actual='SIMULATED: '+outcome,result=outcome),
                        defect_number=1 if index==0 and number>1 and outcome=='failed' else None)
                if index==0 and number==rounds and rounds>1:
                    execution.record_defect_verification(1,number,attempt.id,actor='simulation-driver')
            artifact=execution.finish(number)
            (output/f'execution-round-{number}.json').write_text(artifact.model_dump_json(indent=2))
            execute_agent=create_tester_agent(str(PROJECT_ROOT/'resources/configuration/workflow/m8_test_execution.md'),None,'simulation',execution_service=execution)
            c=AgentContext();c.set('execution_round_number',number)
            path=output/f'execution-checkpoint-{number}.json'
            st=execute_agent.start(None,path,task_id='M10-VALIDATION',context=c)
            execute_agent.resume(path,decision='approved',actor='validation-agent',expected_subject_hash=st.subject_hash)
            print(f'execution round {number}: completed',flush=True)
        bindings=[('understanding','design-checkpoint.json','steps.understand.requirement_understanding'),
            ('analysis','design-checkpoint.json','steps.analyze.test_analysis'),('design','design-checkpoint.json','steps.design.test_design')]
        bindings += [(f'execution_{n}',f'execution-checkpoint-{n}.json','steps.execute.test_execution') for n in range(1,rounds+1)]
        for name,file,key in bindings:
            (output/f'import-{name}.md').write_text(f'---\nid: inputs.{name}\ncheckpoint: {file}\nsource_key: {key}\n---\n')
        flow=output/'report-workflow.md'
        flow.write_text('---\nid: m10-report\nname: M10 模拟验收报告\nimports:\n'+''.join(f'  - import-{name}.md\n' for name,_,_ in bindings)+'---\n\n## 步骤：report\n- 技能：test_report\n- 输入：'+'、'.join(f'inputs.{name}' for name,_,_ in bindings)+'\n- 执行授权：auto\n- 结果确认：manual\n')
        reporter=create_tester_agent(str(flow),gateway,model)
        c=AgentContext();c.set('simulation',True);c.set('report_output_directory',str(output/'reports'))
        st=reporter.start(None,output/'report-checkpoint.json',task_id='M10-VALIDATION',context=c)
        c=AgentContext.restore(st.context);summary['calls']+=c.get('llm_calls',[])
        summary.update(status='completed',execution_rounds=rounds,report_directory=c.get('test_report_directory'),
            final_counts=c.get('test_report_artifact').facts['counts'],report_review='pending_human')
        print('report: waiting_review',flush=True)
    except Exception as exc:
        if checkpoint.exists():save(Checkpoint.load(checkpoint))
        report_checkpoint=output/'report-checkpoint.json'
        if report_checkpoint.exists():
            report_context=AgentContext.restore(Checkpoint.load(report_checkpoint).context)
            summary['calls']+=report_context.get('llm_calls',[])
        summary.update(status='failed',error=str(exc))
        raise
    finally:
        (output/'validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    return summary


def main(argv=None):
    import argparse
    from beivymate.application.app import create_gateway, MODEL_PATH
    from beivymate.configuration.loader import load_model_definition
    from beivymate.model.entity.requirement import Requirement

    parser = argparse.ArgumentParser(description="Five-stage validation with simulated execution.")
    parser.add_argument("--model-config", type=Path, default=MODEL_PATH)
    parser.add_argument("--requirement", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=3)
    args = parser.parse_args(argv)
    if args.rounds < 1:
        parser.error("--rounds must be positive")
    definition = load_model_definition(args.model_config)
    if not definition.enabled or not definition.base_url:
        raise ValueError("Validation requires an enabled model with a base_url")
    gateway = create_gateway(
        provider=definition.provider, base_url=definition.base_url,
        timeout=definition.timeout, api_key_env=definition.api_key_env,
        max_retries=definition.max_retries,
    )
    requirement = Requirement(
        id="R", title=args.requirement.stem,
        content=args.requirement.read_text(encoding="utf-8"),
    )
    summary = validate_mvp(requirement, args.output, gateway, definition.model, rounds=args.rounds)
    print(summary["report_directory"])


if __name__ == "__main__":
    main()
