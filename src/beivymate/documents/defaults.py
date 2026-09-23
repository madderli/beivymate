"""Persistent customer data, independent of source and installation directories."""
import os
from pathlib import Path


def data_directory() -> Path:
    return Path(os.environ.get('BEIVYMATE_DATA_DIR', str(Path.home() / '.beivymate'))).expanduser().resolve()
