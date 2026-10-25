"""Compatibility routes delegate to the reference-safe, atomic maintenance path."""


class Replacements:
    def __init__(self,catalog):
        self.catalog=catalog

    def target(self,owner,body):
        if not isinstance(body,dict) or not isinstance(body.get('source'),str) or not isinstance(body.get('target'),str):
            raise ValueError('请选择源模型和目标模型')
        if body['source']==body['target']:raise ValueError('源模型和目标模型不能相同')
        doc,_=self.catalog._read(owner)
        target=next((m for m in doc.models if m.id==body['target']),None)
        if target is None:raise ValueError('目标模型不存在')
        self.catalog.snapshot(owner,selection=target.id,required=['text'])
        return target

    def preview(self,owner,body):
        target=self.target(owner,body)
        result=self.catalog.maintenance.preview(owner,body['source'],target)
        return {**result,'source':body['source'],'target':target.id}

    def apply(self,owner,body):
        target=self.target(owner,body)
        result=self.catalog.maintenance.apply(owner,body['source'],body,target)
        return {**result,'applied':body['selected'],'failed':[],'note':'选中引用已整体提交；受保护配置与任务历史保持不变。'}
