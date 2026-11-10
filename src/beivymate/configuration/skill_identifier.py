"""Offline English skill identifiers, independent of model configuration.

A small vocabulary covers common business terms. Unknown names receive an English
code instead of a misleading transliteration; this is not a general translator.
"""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import unicodedata


@lru_cache(maxsize=1)
def vocabulary():
    path = Path(__file__).resolve().parents[1] / 'builtin/authoring/identifier-vocabulary.json'
    terms = json.loads(path.read_text(encoding='utf-8'))
    if not terms or any(not key or not re.fullmatch(r'[a-z]+(?:-[a-z]+)*', value) for key, value in terms.items()):
        raise ValueError('英文标识词表格式无效')
    return terms, tuple(sorted(terms, key=lambda key: (-len(key), key)))


def english_identifier(name):
    """Return (base, message). Never emit pinyin or make a network request."""
    value = unicodedata.normalize('NFKC', name.strip())
    value = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1-\2', value)
    value = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', value)
    terms, keys = vocabulary()
    words = []
    position = 0
    while position < len(value):
        char = value[position]
        if char.isascii() and char.isalnum():
            end = position + 1
            while end < len(value) and value[end].isascii() and value[end].isalnum():
                end += 1
            words.append(value[position:end].lower())
            position = end
            continue
        if char.isspace() or unicodedata.category(char)[0] in ('P', 'S'):
            position += 1
            continue
        match = next((key for key in keys if value.startswith(key, position)), None)
        if match:
            words.append(terms[match])
            position += len(match)
            continue
        # Latin accents may normalize to a letter, but CJK is never romanized.
        latin = unicodedata.normalize('NFKD', char)
        if 'LATIN' in unicodedata.name(char, ''):
            letters = ''.join(c.lower() for c in latin if c.isascii() and c.isalpha())
            if letters:
                words.append(letters)
                position += 1
                continue
        break
    else:
        if words:
            return '-'.join(words)[:54].rstrip('-'), ''
    code = hashlib.sha256(value.encode('utf-8')).hexdigest()[:10]
    return 'custom-skill-' + code, '已生成英文代号；如需更贴合名称，可自行修改。'
