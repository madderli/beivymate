"""Package policy adapter around existing typed executors."""
from beivymate.runtime.skill import Skill


class ConfiguredSkill(Skill):
    def __init__(self, executor, definition, snapshot, gateway_factory=None):
        self.gateway_factory = gateway_factory
        self.executor = executor
        self.definition = definition
        self.snapshot = snapshot

    def restore(self, snapshot):
        from beivymate.configuration.skill_package import SkillDefinition
        from beivymate.configuration.models import TemplateDefinition
        definition = SkillDefinition.model_validate(snapshot['definition'])
        if definition.executor != self.definition.executor:
            raise ValueError('恢复需要原 Skill 执行器：' + definition.executor)
        if snapshot.get('model_binding'):
            if self.gateway_factory is None:
                raise ValueError('无法恢复已固定的模型连接')
            gateway = self.gateway_factory(**snapshot['model_binding'])
        else:
            if snapshot.get('resolved_model') != self.snapshot.get('resolved_model'):
                raise ValueError('恢复需要原模型绑定')
            gateway = None
        executor = self.executor
        if hasattr(executor, '_model'):
            executor._model = snapshot['resolved_model']
            if gateway is not None: executor._gateway = gateway
        elif hasattr(executor, 'model'):
            executor.model = snapshot['resolved_model']
            if gateway is not None: executor.gateway = gateway
        elif definition.executor == 'test_report':
            executor.service.model = snapshot['resolved_model']
            if gateway is not None: executor.service.gateway = gateway
            executor.service.skill_instructions = definition.instructions
        if 'template' in snapshot:
            template = TemplateDefinition.model_validate(snapshot['template'])
            if hasattr(executor, '_template'): executor._template = template
            else: executor.template = template
        self.definition, self.snapshot = definition, snapshot

    def knowledge_requirements(self):
        return self.executor.knowledge_requirements()

    def can_auto_authorize(self):
        return self.executor.can_auto_authorize()

    def can_auto_accept(self, context):
        return self.executor.can_auto_accept(context)

    def review_subject(self, context):
        return self.executor.review_subject(context)

    def validate_acceptance(self, context):
        from beivymate.documents.runtime import validate_documents
        validate_documents(context)
        return self.executor.validate_acceptance(context)

    def on_accepted(self, context):
        from beivymate.documents.runtime import accept_documents
        accept_documents(context)
        return self.executor.on_accepted(context)

    def _execute(self, context):
        strategy = context.get('analysis_strategy')
        if self.definition.analysis_strategies:
            strategy = strategy or context.get('default_analysis_strategy') or self.definition.default_analysis_strategy
            if strategy not in self.definition.analysis_strategies:
                raise ValueError('该 Skill 不支持指定分析策略')
        elif strategy is not None:
            raise ValueError('该 Skill 不支持分析策略')
        context.set('analysis_strategy', strategy)
        context.set('skill_instructions', self.definition.instructions)
        context.set('skill_definition', self.snapshot)
        binary = self.snapshot.get('binary_template')
        if not binary:
            self.executor.execute(context)
            return
        import base64
        import tempfile
        from pathlib import Path
        target = self.executor if self.definition.executor == 'test_design' else self.executor.service
        attribute = 'excel_template' if self.definition.executor == 'test_design' else 'template'
        original = getattr(target, attribute)
        with tempfile.TemporaryDirectory(prefix='beivymate-template-') as directory:
            path = Path(directory) / Path(original).name
            path.write_bytes(base64.b64decode(binary, validate=True))
            setattr(target, attribute, path)
            try:
                self.executor.execute(context)
            finally:
                setattr(target, attribute, original)

    def execute(self, context):
        from beivymate.documents.runtime import materialize, prepare_output_directory
        prepare_output_directory(self.definition, context)
        self._execute(context)
        materialize(self.definition, context)
