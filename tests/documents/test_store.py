from pathlib import Path
import pytest
from beivymate.documents.models import DocumentOrigin, OutputPolicy, KnowledgeTarget
from beivymate.documents.service import DocumentStore
from beivymate.documents.connector import VersionConflict
from beivymate.documents.paths import output_root


@pytest.fixture
def setup(tmp_path):
    store=DocumentStore(tmp_path/'data')
    origin=DocumentOrigin(workspace='HIS',task='task-1',run='run-1',step='understand',skill='requirement_understand',product='HIS',project='hospital-A',function='payment',responsible='user',executor='agent:tester')
    policy=OutputPolicy(id='understanding',filename='requirement_understand.md',scope='product',asset=True)
    ref=store.create('user',policy,origin,b'original')
    return store,origin,policy,ref


def test_revision_publication_conflict_and_retirement(setup):
    store,origin,policy,ref=setup
    store.confirm('user',ref,'human')
    asset=Path(store.publish_asset('user',ref,'human'))
    assert '/products/' in str(asset) and '/functions/' in str(asset)
    new=store.edit('user',ref,b'changed',actor='agent:tester',method='ai')
    assert store.read('user',ref)==b'original' and asset.read_bytes()==b'original'
    assert store.list('user')[0]['lifecycle']=='draft'
    assert store.list('user')[0]['confirmed_by'] is None
    with pytest.raises(ValueError,match='已更新'):store.edit('user',ref,b'clobber',actor='human')
    with pytest.raises(ValueError,match='最新工作资产'):store.publish_asset('user',new,'human')
    store.confirm('user',new,'human');store.publish_asset('user',new,'human')
    store.retire('user',new,'human')
    with pytest.raises(ValueError,match='废除'):store.edit('user',new,b'new',actor='human')
    assert store.history('user',ref.id)[0]['confirmed_by']=='human'
    with pytest.raises(ValueError,match='无权'):store.read('other',ref)


def test_manual_changes_require_explicit_import_and_reconfirmation(setup):
    store,origin,policy,ref=setup
    path=Path(store.list('user')[0]['path']);path.write_bytes(b'file edit')
    assert store.list('user')[0]['file_changed']
    with pytest.raises(ValueError,match='人工修改'):store.confirm('user',ref,'human')
    new=store.import_file('user',ref,'human')
    assert store.read('user',new)==b'file edit' and store.read('user',ref)==b'original'
    assert store.history('user',ref.id)[-1]['method']=='file'
    assert not store.list('user')[0]['file_changed']


def test_dependency_and_knowledge_scope(setup):
    store,origin,policy,ref=setup
    downstream=store.create('user',policy,origin,b'downstream',inputs=[ref])
    target=KnowledgeTarget(scope='project',product='HIS',project='hospital-A',versions=['1.0'])
    candidate=store.propose_knowledge('user',ref,target,'human')
    with pytest.raises(ValueError,match='已确认'):store.review_knowledge('user',candidate,actor='human',approve=True)
    store.confirm('user',ref,'human')
    assert store.review_knowledge('user',candidate,actor='human',approve=True)=='approved'
    store.edit('user',ref,b'updated',actor='human')
    assert next(i for i in store.list('user') if i['ref']['id']==downstream.id)['upstream_changed']
    assert store.knowledge_candidates('user')[0]['status']=='approved'
    assert store.knowledge_candidates('other')==[]
    assert len(store.close_candidates('user','task-1'))==2


def test_remote_retry_after_commit_does_not_duplicate(setup):
    store,origin,policy,ref=setup
    store.confirm('user',ref,'human')
    class Connector:
        supports_idempotency=True
        def __init__(self):self.records={};self.calls=0
        def put(self,remote_id,content,*,expected_revision,idempotency_key):
            self.calls+=1
            assert content==b'original'
            if idempotency_key not in self.records:
                self.records[idempotency_key]='remote-r1'
                raise TimeoutError('response lost after remote commit')
            return self.records[idempotency_key]
    connector=Connector()
    args=('user',ref,'enterprise','record-1',None)
    with pytest.raises(ValueError,match='授权'):store.queue_sync(*args,actor='human')
    job=store.queue_sync(*args,actor='human',authorized=True)
    assert job==store.queue_sync(*args,actor='human',authorized=True)
    assert store.sync('user',job,{'enterprise':connector})['status']=='failed'
    assert store.sync('user',job,{'enterprise':connector})['status']=='synced'
    store.sync('user',job,{'enterprise':connector})
    assert connector.calls==2 and len(connector.records)==1


def test_remote_conflict_requires_resolution(setup):
    store,origin,policy,ref=setup;store.confirm('user',ref,'human')
    class Connector:
        supports_idempotency=True
        calls=0
        def put(self,*args,**kwargs):self.calls+=1;raise VersionConflict()
    connector=Connector();job=store.queue_sync('user',ref,'x','record','old',actor='human',authorized=True)
    assert store.sync('user',job,{'x':connector})['status']=='conflict'
    store.sync('user',job,{'x':connector});assert connector.calls==1


def test_path_priority_and_no_fallback(tmp_path):
    assert output_root(tmp_path/'default',task=tmp_path/'task',workspace=tmp_path/'workspace')==tmp_path/'task'
    bad=tmp_path/'file';bad.write_text('file')
    with pytest.raises(FileExistsError):output_root(tmp_path/'default',task=bad)
    with pytest.raises(ValueError,match='源码'):output_root(Path(__file__).resolve().parents[2]/'output')


def test_idempotent_materialization_and_readonly_evidence(setup):
    store,origin,policy,ref=setup
    evidence=policy.model_copy(update={'editable':False})
    first=store.create('user',evidence,origin,b'evidence',identity='stable')
    assert store.create('user',evidence,origin,b'evidence',identity='stable')==first
    with pytest.raises(ValueError,match='不同内容'):store.create('user',evidence,origin,b'changed',identity='stable')
    with pytest.raises(ValueError,match='不可修改'):store.edit('user',first,b'changed',actor='human')


@pytest.mark.parametrize('suffix', ['json','xlsx','docx'])
@pytest.mark.parametrize('method', ['ui','ai','file'])
def test_invalid_format_cannot_enter_revision_history(tmp_path,suffix,method):
    from io import BytesIO
    from openpyxl import Workbook
    if suffix=='json':content=b'{}'
    elif suffix=='xlsx':
        output=BytesIO();book=Workbook();book.save(output);book.close();content=output.getvalue()
    else:
        content=(Path(__file__).resolve().parents[2]/'resources/skills/tester/test_report/templates/zh-CN/DefaultBriefTestReportTemplate.docx').read_bytes()
    store=DocumentStore(tmp_path/'data')
    origin=DocumentOrigin(workspace='w',task='t',run='r',step='s',skill='skill',responsible='human',executor='agent')
    policy=OutputPolicy(id='out',filename='document.'+suffix,asset=True)
    with pytest.raises(ValueError,match='格式不一致'):
        store.create('human',policy,origin,b'not the declared format')
    ref=store.create('human',policy,origin,content)
    if method=='file':
        Path(store.list('human')[0]['path']).write_bytes(b'not the declared format')
        operation=lambda:store.import_file('human',ref,'human')
    else:
        operation=lambda:store.edit('human',ref,b'not the declared format',actor='human',method=method)
    with pytest.raises(ValueError,match='格式不一致'):operation()
    assert len(store.history('human',ref.id))==1
    assert store.read('human',ref)==content
    assert store.list('human')[0]['confirmed_by'] is None


def test_publication_detection_and_explicit_recovery(setup):
    store,origin,policy,ref=setup
    store.confirm('user',ref,'human')
    published=Path(store.publish_asset('user',ref,'human'))
    published.write_bytes(b'external change')
    item=store.list('user')[0]
    assert item['file_changed'] and item['published_file_changed'] and not item['working_file_changed']
    assert item['publications'][0]['status']=='changed'
    # Even after a newer draft, the historical published version is monitored.
    new=store.edit('user',ref,b'new draft',actor='human')
    assert store.list('user')[0]['published_file_changed']
    with pytest.raises(ValueError,match='无权'):store.restore_publication('other',ref,'other')
    result=store.restore_publication('user',ref,'human')
    assert published.read_bytes()==b'original'
    assert Path(result['backup']).read_bytes()==b'external change'
    assert store.read('user',new)==b'new draft'
    assert not store.list('user')[0]['file_changed']
    published.unlink()
    assert store.list('user')[0]['publications'][0]['status']=='missing'
    store.restore_publication('user',ref,'human')
    assert published.read_bytes()==b'original'
    assert len(store.history('user',ref.id))==2


def test_confirmation_and_publication_recheck_legacy_invalid_bytes(tmp_path):
    import hashlib
    store=DocumentStore(tmp_path/'data')
    origin=DocumentOrigin(workspace='w',task='t',run='r',step='s',skill='skill',responsible='human',executor='agent')
    ref=store.create('human',OutputPolicy(id='out',filename='data.json',asset=True),origin,b'{}')
    # Simulate an invalid record accepted by an earlier application version.
    bad=b'not JSON';sha=hashlib.sha256(bad).hexdigest()
    Path(store.list('human')[0]['path']).write_bytes(bad)
    with store.db() as db:
        db.execute('UPDATE revision SET content=?,hash=?,confirmed_by=? WHERE id=?',(bad,sha,'old-reviewer',ref.id))
    ref=ref.model_copy(update={'sha256':sha})
    with pytest.raises(ValueError,match='格式不一致'):store.confirm('human',ref,'human')
    with pytest.raises(ValueError,match='格式不一致'):store.publish_asset('human',ref,'human')
