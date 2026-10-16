"""Add requested local UI sample tasks through PortalService; safe to rerun."""
from pathlib import Path
from collections import defaultdict
from beivymate.portal.service import PortalService


def populate(root: Path):
    service = PortalService(root / 'work', Path(__file__).resolve().parents[1] / 'resources/configuration/workflow')
    with service.db() as db:
        owners = [r[0] for r in db.execute("SELECT DISTINCT owner FROM entity WHERE kind='workspace' AND deleted=0")]
    for owner in owners:
        board = service.board(owner)
        spaces = {w['id']: w for w in board['workspaces'] if not w['paused']}
        if not spaces or not board['workflows']:
            continue
        workflow = board['workflows'][0]['id']
        def create(space, title, related, key):
            return service.create_task(owner, dict(workspace=space, title=title,
                relatedWorkspaces=related, workflow=workflow, version='1.0',
                description=f'{title}。核对业务流程、异常分支及跨系统数据一致性，整理待确认问题与验证结果。',
                environment='本地演示环境', locale='zh-CN'), [], f'ui-task-samples-20261015-{key}')
        if {'CIS', 'LIS', 'EDIS'} <= spaces.keys():
            create('CIS', '检验申请与急诊诊疗协同验证', ['LIS', 'EDIS'], 'linked-clinical')
        if {'HIS', 'CIS'} <= spaces.keys():
            create('HIS', '门诊收费与医嘱状态一致性核对', ['CIS'], 'linked-payment')
        board = service.board(owner)
        counts = defaultdict(int)
        for task in board['tasks']:
            if task['status'] != 'completed':
                counts[task['workspace']] += 1
        titles = {
            'HIS': ['医保结算异常场景验证', '门诊退费流程回归检查', '挂号预约流程验证'],
            'CIS': ['住院医嘱审核流程验证', '门诊病历完整性检查', '处方权限校验'],
            'LIS': ['检验报告危急值通知验证', '检验标本接收与追踪检查', '检验结果复核流程验证'],
            'EDIS': ['急诊分诊优先级规则验证', '急诊留观转住院流程检查', '急救绿色通道验证'],
        }
        for space, ws in spaces.items():
            for index in range(max(0, 3 - counts[space])):
                title = titles.get(space, [f"{ws['name']}待办验证 {n}" for n in range(1, 4)])[index]
                create(space, title, [], f'{space}-{index}')
        board = service.board(owner)
        for space in spaces:
            tasks = [t for t in board['tasks'] if t['workspace'] == space and t['status'] != 'completed']
            print(f"{space}: {len(tasks)} 项待完成，{sum(not t['main'] for t in tasks)} 项关联任务")


if __name__ == '__main__':
    populate(Path.home() / '.beivymate')
