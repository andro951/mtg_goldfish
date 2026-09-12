#!/usr/bin/env python3
"""Apply committed source diffs once, preserving each durable checkpoint.

The development environment can checkpoint compact, reviewable unified diffs
without requiring a local GitHub credential. CI applies them through git apply
and commits the resulting ordinary source files. Never accepts paths outside
the repository or changes to .git. All checkpoint inputs remain in Git history.
"""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
marker = ROOT / '.checkpoints-applied.json'
applied = json.loads(marker.read_text()) if marker.exists() else {}
changed = False
for patch in sorted((ROOT / 'checkpoints').glob('*.patch')):
    relative = patch.relative_to(ROOT).as_posix()
    digest = hashlib.sha256(patch.read_bytes()).hexdigest()
    if relative in applied:
        if applied[relative] != digest:
            raise RuntimeError(f'An applied checkpoint was modified: {relative}')
        continue
    text = patch.read_text(encoding='utf-8')
    for line in text.splitlines():
        if line.startswith(('--- ', '+++ ')):
            path = line[4:].split('\t', 1)[0]
            if path == '/dev/null':
                continue
            if path.startswith(('a/', 'b/')):
                path = path[2:]
            if path.startswith('/') or '..' in Path(path).parts or '.git' in Path(path).parts:
                raise RuntimeError(f'Unsafe checkpoint path: {path}')
    subprocess.run(['git', 'apply', '--check', '--whitespace=nowarn', str(patch)], cwd=ROOT, check=True)
    subprocess.run(['git', 'apply', '--whitespace=nowarn', str(patch)], cwd=ROOT, check=True)
    applied[relative] = digest
    changed = True
    print(f'Applied {relative}: {digest}')
if changed:
    marker.write_text(json.dumps(applied, indent=2) + '\n', encoding='utf-8')
