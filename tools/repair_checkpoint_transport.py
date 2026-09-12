#!/usr/bin/env python3
"""Repair only known rejected transport bytes; verify the complete source hash.
No applied source or unknown checkpoint is modified by this script.
"""
import base64
import hashlib
import json
import zlib
from pathlib import Path

REPAIRS = [
    {
        'path': 'checkpoints/032-tutors-recursion.json',
        'before': '7029adea73b969458056bf009acd4569327cc181bb84829bed8fdd7451418297',
        'after': '79716182a4b48ce11403001065d2600ea4ec2198ee2313180b9d42f98ea97e81',
        'changes': [[318,318,'1'],[895,895,'r'],[2607,2608,''],[5305,5307,''],[8550,8551,''],[10230,10231,''],[10451,10452,''],[10649,10650,''],[10705,10706,''],[11155,11156,''],[11341,11342,'']],
    },
    {
        'path': 'checkpoints/044-compact-table-views.json',
        'before': '8c7517175d4f95574dce71b8fbed9375cdc10342c04672319c6bf95bc10effc7',
        'after': '6a4c0f8e9cb6743da0b0194bb6ada68c8333e1b0119646cc9ce836122f4c009c',
        'changes': [[4384,4385,'']],
    },
]
root = Path(__file__).resolve().parents[1]
for repair in REPAIRS:
    path = root / repair['path']
    if not path.exists():
        continue
    before = path.read_bytes()
    digest = hashlib.sha256(before).hexdigest()
    if digest == repair['after']:
        continue
    if digest != repair['before']:
        raise RuntimeError('Unknown checkpoint transport; refusing to modify ' + str(path))
    envelope = json.loads(before)
    data = envelope['data']
    for start, end, replacement in reversed(repair['changes']):
        data = data[:start] + replacement + data[end:]
    envelope['data'] = data
    raw = zlib.decompress(base64.b64decode(data, validate=True))
    if hashlib.sha256(raw).hexdigest() != envelope['sha256']:
        raise RuntimeError('Repaired source checksum mismatch')
    after = (json.dumps(envelope, separators=(',', ':')) + '\n').encode()
    if hashlib.sha256(after).hexdigest() != repair['after']:
        raise RuntimeError('Repaired transport checksum mismatch')
    temporary = path.with_suffix('.repair-tmp')
    temporary.write_bytes(after)
    temporary.replace(path)
    print('Verified transport restored: ' + repair['path'])

# Restore two known transcription substitutions in the new, unapplied envelope.
# The full decompressed source hash remains the authority, never fuzzy repair.
path = root / 'checkpoints/088-expanded-engine.json'
expected = '98d07d8564132f7dc50a59904d3c01b62dc2a4f6a2d12af466610fec30bfa411'
if path.exists():
    envelope = json.loads(path.read_text())
    if envelope.get('sha256') != expected:
        raise RuntimeError('Unexpected expanded-engine checkpoint')
    data = envelope['data']
    try:
        raw = zlib.decompress(base64.b64decode(data, validate=True))
        valid = hashlib.sha256(raw).hexdigest() == expected
    except (ValueError, zlib.error):
        valid = False
    if not valid:
        if path.relative_to(root).as_posix() in json.loads((root / '.checkpoints-applied.json').read_text()):
            raise RuntimeError('Refusing to modify an applied checkpoint')
        data = data.replace('eTg6Ojs1O3', 'eTg6ujs1O3').replace('VacHGS/qHVpUC', 'VacHGS/qjjpUC')
        raw = zlib.decompress(base64.b64decode(data, validate=True))
        if hashlib.sha256(raw).hexdigest() != expected:
            raise RuntimeError('Expanded checkpoint repair does not match source hash')
        envelope['data'] = data
        path.write_text(json.dumps(envelope, separators=(',', ':')) + '\n')
        print('Verified expanded-engine transport restored')
