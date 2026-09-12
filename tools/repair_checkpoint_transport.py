#!/usr/bin/env python3
"""One-time repair of a rejected, never-applied checkpoint transmission.

The ordinary source is untouched here. Both input and output transport hashes,
and the decompressed source checksum, must match before atomic replacement.
"""
import base64
import hashlib
import json
import zlib
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'checkpoints/032-tutors-recursion.json'
if path.exists():
    before = path.read_bytes()
    digest = hashlib.sha256(before).hexdigest()
    expected_before = '7029adea73b969458056bf009acd4569327cc181bb84829bed8fdd7451418297'
    expected_after = '79716182a4b48ce11403001065d2600ea4ec2198ee2313180b9d42f98ea97e81'
    if digest != expected_after:
        if digest != expected_before:
            raise RuntimeError('Unknown checkpoint transport; refusing to modify it')
        envelope = json.loads(before)
        data = envelope['data']
        repairs = [[318,318,'1'],[895,895,'r'],[2607,2608,''],[5305,5307,''],[8550,8551,''],[10230,10231,''],[10451,10452,''],[10649,10650,''],[10705,10706,''],[11155,11156,''],[11341,11342,'']]
        for start, end, replacement in reversed(repairs):
            data = data[:start] + replacement + data[end:]
        envelope['data'] = data
        raw = zlib.decompress(base64.b64decode(data, validate=True))
        if hashlib.sha256(raw).hexdigest() != envelope['sha256']:
            raise RuntimeError('Repaired source checksum mismatch')
        after = (json.dumps(envelope, separators=(',', ':')) + '\n').encode()
        if hashlib.sha256(after).hexdigest() != expected_after:
            raise RuntimeError('Repaired transport checksum mismatch')
        temporary = path.with_suffix('.repair-tmp')
        temporary.write_bytes(after)
        temporary.replace(path)
        print('Verified checkpoint 032 transport restored')
