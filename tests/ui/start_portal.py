"""Isolated real-HTTP acceptance server. Never uses a developer's account database."""
from pathlib import Path
import tempfile
import uvicorn
from beivymate.application.web import create_app

if __name__ == '__main__':
    import os
    if os.environ.get('BEIVYMATE_UI_MODEL_FIXTURE') == '1':
        from offline_model import install
        install()
    with tempfile.TemporaryDirectory(prefix='beivymate-m02-test-') as directory:
        uvicorn.run(create_app(Path(directory), 'browser-test-initialization'),
                    host='127.0.0.1', port=8001, access_log=False)
