import hashlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree import ElementTree as ET


class WordReportExporter:
    def __init__(self, template):
        self.template=Path(template)

    def validate_template(self):
        with ZipFile(self.template) as source:
            root=ET.fromstring(source.read('word/document.xml'))
            if root.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body') is None:
                raise ValueError('Word template has no document body')

    def export(self,artifact,directory,*,resume=False):
        self.validate_template()
        template_source=next(s for s in artifact.sources if s.ref=='template-sha256')
        if template_source.content != hashlib.sha256(self.template.read_bytes()).hexdigest():
            raise ValueError('Template changed since report generation')
        output=Path(directory)/artifact.id
        if resume:
            saved=output/'report.json'
            if not saved.exists() or saved.read_text(encoding='utf-8')!=artifact.model_dump_json(indent=2):
                raise ValueError('Recovery requires the exact saved report artifact')
            if (output/'report.docx').exists():
                raise FileExistsError('Word output already exists; inspect it before recovery')
        else:
            output.mkdir(parents=True,exist_ok=False)
        (output/'report.json').write_text(artifact.model_dump_json(indent=2),encoding='utf-8')
        text=self.render(artifact)
        (output/'report.md').write_text(text,encoding='utf-8')
        # Preserve Word styles/page setup from the resource; replace all sample body content.
        ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        def tag(name):return '{'+ns+'}'+name
        with ZipFile(self.template) as source:
            root=ET.fromstring(source.read('word/document.xml'));body=root.find(tag('body'))
            section=body.find(tag('sectPr'))
            for child in list(body):body.remove(child)
            for line in text.splitlines():
                p=ET.SubElement(body,tag('p'))
                if line.startswith('#'):
                    props=ET.SubElement(p,tag('pPr'));ET.SubElement(props,tag('keepNext'))
                    ET.SubElement(props,tag('pStyle'),{tag('val'):'Heading1' if line.startswith('##') else 'Title'})
                run=ET.SubElement(p,tag('r'));ET.SubElement(run,tag('t')).text=line.lstrip('# ')
            table=ET.SubElement(body,tag('tbl'))
            props=ET.SubElement(table,tag('tblPr'))
            borders=ET.SubElement(props,tag('tblBorders'))
            for side in ('top','left','bottom','right','insideH','insideV'):
                ET.SubElement(borders,tag(side),{tag('val'):'single',tag('sz'):'4'})
            groups={}
            for case in artifact.facts['cases']:
                counts=groups.setdefault(case['function'] or '未归类',dict(total=0,passed=0,failed=0,blocked=0,not_run=0))
                counts['total']+=1;counts['passed' if case['status']=='pass' else case['status']]+=1
            rows=[['模块','总数','通过','失败','阻塞','未执行','通过率（全部用例）']]
            rows += [[name,str(c['total']),str(c['passed']),str(c['failed']),str(c['blocked']),str(c['not_run']),f"{c['passed']}/{c['total']}"] for name,c in groups.items()]
            for index,row in enumerate(rows):
                tr=ET.SubElement(table,tag('tr'))
                if index==0:ET.SubElement(ET.SubElement(tr,tag('trPr')),tag('tblHeader'))
                for value in row:
                    cell=ET.SubElement(tr,tag('tc'));paragraph=ET.SubElement(cell,tag('p'))
                    ET.SubElement(ET.SubElement(paragraph,tag('r')),tag('t')).text=value
            body.remove(table)
            position=next(i for i,node in enumerate(body) if ''.join(node.itertext()).startswith('4. 缺陷分析'))
            body.insert(position,table)
            if section is not None:body.append(section)
            with ZipFile(output/'report.docx.pending','w',ZIP_DEFLATED) as target:
                for entry in source.infolist():
                    target.writestr(entry,ET.tostring(root,encoding='utf-8',xml_declaration=True) if entry.filename=='word/document.xml' else source.read(entry.filename))
        (output/'report.docx.pending').replace(output/'report.docx')
        return output

    @staticmethod
    def render(a):
        f=a.facts;q=a.assessment
        lines=['# '+('模拟验证报告 — ' if a.simulation else '')+f['task_id']+' 软件测试报告（简要版）',
            '## 1. 报告概述',f"需求：{f['requirement_id']}；执行轮次：{f['rounds']}；被测版本：{f['versions']}",
            '用于描述过程数据所反映的质量，供人类评估发布。',
            '## 2. 测试环境与工具','测试环境：'+', '.join(f['environments']),
            '硬件、网络、工具详细版本：未提供。',
            '## 3. 测试执行概况',f"时间：{f['period']}；执行人员：{', '.join(f['executors'])}",
            f"用例总数：{f['total']}；已执行（通过+失败）：{f['executed']}；{f['counts']}",
            '通过率：'+f['pass_rate']+'；分母：'+f['pass_rate_denominator']]
        lines+= [f"{c['function']} / {c['case']} r{c['revision']}：{c['status']}" for c in f['cases']]
        lines+=['## 4. 缺陷分析','已修复/关闭、遗留状态统计：暂无数据（只有登记与复测记录）。']
        lines+=[f"{d['number']} [{d['severity']}/{d['priority']}] {d['title']}；登记状态：{d['status']}；复测：{d['verifications']}" for d in f['defects']]
        if not f['defects']:lines.append('所选轮次未记录缺陷，不代表代码不存在缺陷。')
        lines+=['## 5. 专项测试结果','性能、安全等专项结果：暂无记录。','## 6. 测试结论与建议',
            '需求符合性：'+q.requirement_conformance,'客户影响：'+q.customer_impact,'建议：'+q.recommendation,q.rationale,
            '风险与限制：']+q.risks+a.limitations+['最终发布决定：待人类确认。']
        return '\n'.join(lines)
