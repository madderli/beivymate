"""Isolated real-HTTP acceptance server. Never uses a developer's account database."""
from pathlib import Path
import tempfile
import uvicorn
from beivymate.application.web import create_app

if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='beivymate-m02-test-') as directory:
        uvicorn.run(create_app(Path(directory), 'browser-test-initialization'),
                    host='127.0.0.1', port=8001, access_log=False)
