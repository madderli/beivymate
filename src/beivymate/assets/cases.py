"""SQLite enforces library-wide numbering and immutable revisions across processes."""
import sqlite3
from pathlib import Path
from beivymate.model.artifact.test_design import CaseRevision, ProductCatalog, CasePublication, CaseContent


class CaseStore:
    def __init__(self, path: Path, catalog: ProductCatalog):
        self.path = path
        self.catalog = catalog
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, counter INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, product TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS revisions (id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id, revision));
            CREATE TABLE IF NOT EXISTS publications (id TEXT NOT NULL, revision INTEGER NOT NULL, requirement_id TEXT NOT NULL, requirement_version TEXT NOT NULL, product_version TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id, revision, requirement_id, requirement_version, product_version));
            CREATE TABLE IF NOT EXISTS accepted (id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(id, revision));
            ''')
            for product, code in catalog.products.items():
                old = db.execute('SELECT code FROM products WHERE id=?', (product,)).fetchone()
                if old and old[0] != code:
                    raise ValueError('Product asset code is immutable')
                db.execute('INSERT OR IGNORE INTO products(id,code) VALUES (?,?)', (product, code))
                actual = db.execute('SELECT code FROM products WHERE id=?', (product,)).fetchone()
                if not actual:
                    raise ValueError('Product asset code already used')

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def latest(self, identity):
        with self.connect() as db:
            row = db.execute('SELECT body FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 1',(identity,)).fetchone()
            accepted = db.execute('SELECT revision FROM accepted WHERE id=?',(identity,)).fetchall()
        if not row:
            raise ValueError('Case not found')
        case = CaseRevision.model_validate_json(row[0])
        if (case.revision,) in accepted:
            case.review_status = 'accepted'
        with self.connect() as db:
            case.publications = self._publications(db, case.id, case.revision)
            case.derive_publication_status()
        return case

    @staticmethod
    def _publications(db, identity, revision):
        return [CasePublication.model_validate_json(row[0]) for row in db.execute(
            'SELECT body FROM publications WHERE id=? AND revision=?', (identity, revision))]

    def accept_design(self, artifact):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for case in artifact.case_revisions:
                if case.function_id is None:
                    raise ValueError('Unclassified cases cannot become accepted assets')
                row = db.execute('SELECT body FROM revisions WHERE id=? AND revision=?',(case.id,case.revision)).fetchone()
                if not row:
                    raise ValueError('Design case revision is missing from asset store')
                saved = CaseRevision.model_validate_json(row[0])
                if saved.model_dump(exclude={'review_status','publications','publication_status'}) != case.model_dump(exclude={'review_status','publications','publication_status'}):
                    raise ValueError('Design case differs from stored revision')
                db.execute('INSERT OR IGNORE INTO accepted VALUES (?,?)',(case.id,case.revision))

    def apply_batch(self, proposals, *, design_id, actor, maintainer):
        result = []
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for proposal in proposals:
                self.catalog.check_function(proposal.product_id, proposal.function_id)
                known = {n.id for n in self.catalog.functions}
                if set(proposal.related_function_ids) - known:
                    raise ValueError('Unknown related function')
                content = proposal.model_dump(exclude={'action','existing_id','existing_revision','change_reason'})
                if proposal.action == 'new':
                    code, count = db.execute('SELECT code,counter FROM products WHERE id=?',(proposal.product_id,)).fetchone()
                    count += 1
                    number = f'TC-{code}-{count:05d}'
                    # Imported or retired numbers remain permanently reserved.
                    while db.execute('SELECT 1 FROM identities WHERE number=?',(number,)).fetchone():
                        count += 1
                        number = f'TC-{code}-{count:05d}'
                    db.execute('UPDATE products SET counter=? WHERE id=?',(count,proposal.product_id))
                    case = CaseRevision(**content, number=number, author=actor, modified_by=actor, maintainer=maintainer, design_id=design_id)
                    db.execute('INSERT INTO identities VALUES (?,?,?)',(case.id,case.number,case.product_id))
                else:
                    row = db.execute('SELECT body FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 1',(proposal.existing_id,)).fetchone()
                    if row is None:
                        raise ValueError('Existing case not found')
                    old = CaseRevision.model_validate_json(row[0])
                    if db.execute('SELECT 1 FROM accepted WHERE id=? AND revision=?',(old.id,old.revision)).fetchone():
                        old.review_status = 'accepted'
                    if old.revision != proposal.existing_revision:
                        raise ValueError('Stale case revision')
                    if old.product_id != proposal.product_id or old.project_id != proposal.project_id:
                        raise ValueError('Cannot move case across product/project')
                    old.publications = self._publications(db, old.id, old.revision)
                    old.derive_publication_status()
                    if proposal.action == 'discard' and db.execute('SELECT 1 FROM publications WHERE id=?',(old.id,)).fetchone():
                        raise ValueError('Published cases can only be retired, not discarded')
                    if proposal.action == 'reuse':
                        if old.lifecycle != 'active' or old.review_status != 'accepted':
                            raise ValueError('Only accepted active cases can be reused')
                        fields = set(CaseContent.model_fields) - {'condition_refs', 'blocking_questions'}
                        changed = [name for name in fields if getattr(proposal, name) != getattr(old, name)]
                        if changed:
                            raise ValueError('Reuse changes case content; use revise: ' + ', '.join(sorted(changed)))
                        result.append(old)
                        continue
                    case = CaseRevision(**content, id=old.id, number=old.number, revision=old.revision+1,
                        author=old.author, modified_by=actor, maintainer=old.maintainer, design_id=design_id,
                        lifecycle=('retired' if proposal.action == 'retire' else 'discarded' if proposal.action == 'discard' else old.lifecycle),
                        external_refs=old.external_refs)
                db.execute('INSERT INTO revisions VALUES (?,?,?)',(case.id,case.revision,case.model_dump_json()))
                result.append(case)
        return result

    def import_case(self, case):
        self.catalog.check_function(case.product_id, case.function_id)
        if case.publications:
            raise ValueError('Import publication through the explicit release operation')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM identities WHERE id=? OR number=?',(case.id,case.number)).fetchone():
                raise ValueError('Duplicate case identity or number')
            db.execute('INSERT INTO identities VALUES (?,?,?)',(case.id,case.number,case.product_id))
            db.execute('INSERT INTO revisions VALUES (?,?,?)',(case.id,case.revision,case.model_dump_json()))
            if case.review_status == 'accepted':
                db.execute('INSERT INTO accepted VALUES (?,?)',(case.id,case.revision))

    def by_function(self, product_id, function_id):
        with self.connect() as db:
            rows = db.execute('SELECT body FROM revisions r WHERE revision=(SELECT max(revision) FROM revisions WHERE id=r.id)').fetchall()
        return [self.latest(case.id) for row in rows if (case := CaseRevision.model_validate_json(row[0])).product_id == product_id and case.function_id == function_id]

    def active_for_version(self, product_id, version, project_id=None):
        """Draft changes do not retire accepted assets; older product releases keep their cases."""
        with self.connect() as db:
            rows = db.execute('SELECT r.body FROM revisions r JOIN accepted a ON r.id=a.id AND r.revision=a.revision ORDER BY r.revision').fetchall()
        applicable = {}
        for row in rows:
            case = CaseRevision.model_validate_json(row[0])
            if case.product_id == product_id and case.project_id == project_id and version in case.applicable_versions:
                case.review_status = 'accepted'
                with self.connect() as db:
                    case.publications = self._publications(db, case.id, case.revision)
                    case.derive_publication_status()
                applicable[case.id] = case
        return [case for case in applicable.values() if case.lifecycle == 'active']

    def update_automation(self, identity, expected_revision, *, script_refs, evidence, actor):
        """Future script validation calls this; recording a script draft must not call it.

        A new immutable case revision preserves earlier automation history. Empty references
        invalidate automation, also requiring an evidence record and named operator.
        """
        from datetime import datetime, timezone
        if not actor or not actor.strip() or not evidence:
            raise ValueError('Automation change requires actor and validation evidence')
        if any(not isinstance(ref, str) or not ref.strip() for ref in script_refs):
            raise ValueError('Invalid automation reference')
        for ref in evidence:
            ref.read()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT body FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 1',(identity,)).fetchone()
            if not row:
                raise ValueError('Case not found')
            old = CaseRevision.model_validate_json(row[0])
            if old.revision != expected_revision or old.lifecycle != 'active':
                raise ValueError('Stale or retired case cannot change automation')
            values = old.model_dump()
            values.update(revision=old.revision+1, automation_refs=list(dict.fromkeys(script_refs)),
                          modified_by=actor, review_status='draft', publications=[], created_at=datetime.now(timezone.utc))
            values['external_refs'] = {**old.external_refs,
                'automation_validation': '|'.join(ref.path+'#sha256='+ref.sha256 for ref in evidence)}
            case = CaseRevision.model_validate(values)
            db.execute('INSERT INTO revisions VALUES (?,?,?)',(case.id,case.revision,case.model_dump_json()))
        return case


    def publish_requirement(self, *, requirement_id, requirement_version, product_version,
                            case_revisions, actor):
        """Called after a human-confirmed requirement release, with an explicit case manifest.

        Atomically publish only the specified accepted current revisions. Never sweep
        all drafts or all cases of a product into a release. Repeating a release is safe.
        """
        publication = CasePublication(requirement_id=requirement_id,
            requirement_version=requirement_version, product_version=product_version, actor=actor)
        if not case_revisions:
            raise ValueError('Release requires an explicit case revision manifest')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for identity, revision in case_revisions.items():
                row = db.execute('SELECT body FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 1', (identity,)).fetchone()
                if not row:
                    raise ValueError('Release case not found')
                case = CaseRevision.model_validate_json(row[0])
                if case.revision != revision or case.lifecycle != 'active' or case.function_id is None:
                    raise ValueError('Release requires the current active classified revision')
                if product_version not in case.applicable_versions:
                    raise ValueError('Release product version mismatch')
                if not db.execute('SELECT 1 FROM accepted WHERE id=? AND revision=?', (identity,revision)).fetchone():
                    raise ValueError('Release requires accepted cases')
                db.execute('INSERT OR IGNORE INTO publications VALUES (?,?,?,?,?,?)',
                    (identity,revision,requirement_id,requirement_version,product_version,publication.model_dump_json()))
