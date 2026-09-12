#!/usr/bin/env python3
"""Apply immutable, checksummed source checkpoints; preserve normal files in Git."""
import base64
import hashlib
import json
import subprocess
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 32 * 1024 * 1024
marker = ROOT / '.checkpoints-applied.json'
applied = json.loads(marker.read_text()) if marker.exists() else {}
changed = False

def safe_path(name):
    path = Path(name)
    if not name or path.is_absolute() or any(p in ('..', '.git') for p in path.parts):
        raise RuntimeError(f'Unsafe checkpoint path: {name}')
    target = (ROOT / path).resolve()
    if not target.is_relative_to(ROOT) or target == ROOT:
        raise RuntimeError(f'Checkpoint escapes repository: {name}')
    return target

def apply_patch(text):
    for line in text.splitlines():
        if line.startswith(('--- ', '+++ ')):
            name = line[4:].split('\t', 1)[0]
            if name != '/dev/null':
                safe_path(name[2:] if name.startswith(('a/', 'b/')) else name)
    for args in (['--check'], []):
        subprocess.run(['git', 'apply', *args, '--whitespace=nowarn', '-'], input=text.encode(), cwd=ROOT, check=True)

for checkpoint in sorted((ROOT / 'checkpoints').glob('*')):
    if checkpoint.suffix not in ('.patch', '.json'):
        continue
    relative = checkpoint.relative_to(ROOT).as_posix()
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if relative in applied:
        if applied[relative] != digest:
            raise RuntimeError(f'An applied checkpoint was modified: {relative}')
        continue
    if checkpoint.suffix == '.patch':
        apply_patch(checkpoint.read_text(encoding='utf-8'))
    else:
        envelope = json.loads(checkpoint.read_text(encoding='utf-8'))
        if envelope.get('format') != 'astra-source-checkpoint-v1':
            raise RuntimeError(f'Unknown checkpoint format: {relative}')
        decoder = zlib.decompressobj()
        raw = decoder.decompress(base64.b64decode(envelope['data'], validate=True), LIMIT + 1)
        if len(raw) > LIMIT or not decoder.eof or decoder.unused_data:
            raise RuntimeError('Oversized, truncated or trailing checkpoint data')
        if hashlib.sha256(raw).hexdigest() != envelope['sha256']:
            raise RuntimeError(f'Checkpoint checksum mismatch: {relative}')
        bundle = json.loads(raw)
        writes = []
        for name, entry in bundle.get('files', {}).items():
            target = safe_path(name)
            content = entry['content'].encode('utf-8')
            current = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
            if 'baseSha256' in entry and current not in (entry['baseSha256'], hashlib.sha256(content).hexdigest()):
                raise RuntimeError(f'Concurrent source change detected: {name}')
            writes.append((target, content))
        if bundle.get('patch'):
            apply_patch(bundle['patch'])
        for target, content in writes:
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.checkpoint-tmp')
            temporary.write_bytes(content)
            temporary.replace(target)
    applied[relative] = digest
    changed = True
    print(f'Applied {relative}: {digest}')
if changed:
    marker.write_text(json.dumps(applied, indent=2) + '\n', encoding='utf-8')
