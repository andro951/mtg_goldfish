#!/usr/bin/env python3
"""Validate a tested build, create an integrity-manifest ZIP, then read it back."""
from __future__ import annotations
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
DIST = ROOT / 'dist'

def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def read_json(path: str):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

def safe_file(name: str) -> Path:
    path = PurePosixPath(name)
    require(not path.is_absolute() and '..' not in path.parts, f'Unsafe release path: {name}')
    target = (ROOT / name).resolve()
    require(target.is_relative_to(ROOT) and target.is_file(), f'Missing release file: {name}')
    return target

def browser_report(path: str) -> dict:
    result = read_json(path)
    require(result.get('checksPassed', 0) > 0, f'No browser checks in {path}')
    for key in ('failures', 'browserErrors', 'externalRequests', 'skipped'):
        require(key in result and result[key] == [], f'{path} contains {key}: {result.get(key)}')
    return result

cards = read_json('data/cards.json')
assets = read_json('data/assets-manifest.json')
ui_assets = read_json('data/ui-assets.json')
require(sum(bool(c.get('candidate')) for c in cards) == 317, 'Expected exactly 317 candidates.')
require(len(cards) == 348 and len(assets) == 351, 'Expected 348 definitions and 351 local card/face images.')
for name, entry in {**assets, **ui_assets}.items():
    contents = safe_file(name).read_bytes()
    require(len(contents) == entry['bytes'] and digest(contents) == entry['sha256'], f'Asset mismatch: {name}')
for card in cards:
    for key in ('image', 'backImage'):
        if card.get(key):
            require(card[key] in assets, f'Unmanifested image for {card["name"]}: {card[key]}')

for folder in ('data', 'src', 'tools', 'tests', 'docs'):
    for path in (ROOT / folder).rglob('*'):
        if not path.is_file() or '__pycache__' in path.parts:
            continue
        if path.suffix in ('.json', '.js', '.mjs', '.py', '.md', '.txt', '.css'):
            text = path.read_text(encoding='utf-8')
            require(not re.search(r'^(?:<{7}|={7}|>{7})(?: |$)', text, re.M), f'Unresolved merge marker: {path.relative_to(ROOT)}')
            if path.suffix == '.json':
                json.loads(text)

tap = (OUT / 'engine.tap').read_text(encoding='utf-8')
def total(label: str) -> int:
    matches = re.findall(r'^# ' + re.escape(label) + r' (\d+)\s*$', tap, re.M)
    require(len(matches) == 1, f'Missing or ambiguous test total: {label}')
    return int(matches[0])
engine_tests = total('tests')
require(engine_tests >= 1118 and total('pass') == engine_tests, 'Engine acceptance is incomplete.')
for label in ('fail', 'cancelled', 'skipped', 'todo'):
    require(total(label) == 0, f'Engine test {label} must be zero.')
browser = browser_report('test-results/browser.json')
portable = browser_report('test-results/portable.json')
require(browser['mode'] == 'HTTP and direct-file Chromium', 'A memory-only browser report is not a release check.')
require(browser.get('uiVersion') == '1.4.8', 'The tested UI must be the compact tabletop, not the retired interface.')
require(browser['checksPassed'] >= 690, 'Browser regression suite is incomplete.')

require(browser.get('testedBuildSHA256') == digest(safe_file('index.html').read_bytes()), 'Browser report belongs to a different build.')
require(portable.get('uiVersion') == read_json('package.json')['version'], 'Portable report is for an older release.')
require(portable.get('testedBuildSHA256') == digest(safe_file('Astra-standalone.html').read_bytes()), 'Portable report belongs to a different build.')

performance = read_json('test-results/performance.json')
require(performance.get('testedBuildSHA256') == digest(safe_file('index.html').read_bytes()), 'Performance report belongs to a different build.')
require(len(performance['checks']) >= 6 and all(performance['checks'].values()) and not performance['errors'], 'Long-session performance regression failed.')

subprocess.run(['node', 'tools/verify-card-support.mjs'], cwd=ROOT, check=True)
support = read_json('test-results/card-support.json')
require(support['allRequestedNamesSupported'] and support['allNewNamesHaveFocusedTests'], 'Requested card support is incomplete.')

builds = []
for name, report_path, arguments in (
    ('index.html', 'test-results/build.json', []),
    ('Astra-standalone.html', 'test-results/build-standalone.json', ['--standalone']),
):
    original = safe_file(name).read_bytes()
    report = read_json(report_path)
    require(report['sha256'] == digest(original), f'Build report does not match {name}.')
    require(report['runtimeDependencies'] == [] and report['networkRequired'] is False, 'Runtime dependency policy changed.')
    subprocess.run(['node', 'tools/build.mjs', *arguments], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    require(safe_file(name).read_bytes() == original, f'{name} is stale or not reproducible from included source.')
    builds.append({'path': name, 'bytes': len(original), 'sha256': digest(original)})

report = {
    'status': 'passed', 'version': read_json('package.json')['version'],
    'engineTestsPassed': engine_tests, 'browserChecksPassed': browser['checksPassed'],
    'portableChecksPassed': portable['checksPassed'], 'failedOrSkippedChecks': 0, 'performanceChecksPassed': len(performance['checks']),
    'candidateCards': 317, 'localDefinitions': len(cards), 'verifiedLocalImages': len(assets), 'verifiedUIImages': len(ui_assets), 'requestedListsVerified': len(support['lists']), 'allRequestedNamesSupported': True, 'latestRequestedNames': support['latestRequestNames'], 'latestRequestedSupported': support['latestRequestSupported'],
    'reproducibleBuilds': builds, 'archive': 'dist/AstraSimulator.zip',
    'scope': 'supplied-pool goldfish; abstract opponents, automatic unblocked combat damage, no blocker AI',
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'release.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

names = {'README.md', 'package.json', 'index.html', '.checkpoints-applied.json'}
if (ROOT / '.gitignore').exists():
    names.add('.gitignore')
for folder in ('src', 'data', 'assets', 'tools', 'tests', 'docs', '.github', 'checkpoints'):
    for path in (ROOT / folder).rglob('*'):
        if path.is_file() and '__pycache__' not in path.parts and path.suffix not in ('.pyc', '.log'):
            names.add(path.relative_to(ROOT).as_posix())
for name in ('build.json', 'build-standalone.json', 'browser.json', 'portable.json', 'engine.tap', 'release.json', 'card-support.json', 'requested-card-audit.json', 'performance.json'):
    names.add('test-results/' + name)
for path in (OUT / 'screenshots').glob('*.png'):
    if not path.name.startswith('FAIL-'):
        names.add(path.relative_to(ROOT).as_posix())

files = {name: safe_file(name).read_bytes() for name in sorted(names)}
manifest = {name: {'sha256': digest(contents), 'bytes': len(contents)} for name, contents in files.items()}
files['MANIFEST.sha256.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
DIST.mkdir(parents=True, exist_ok=True)
archive = DIST / 'AstraSimulator.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
    for name, contents in sorted(files.items()):
        info = zipfile.ZipInfo('AstraSimulator/' + name, date_time=(2026, 9, 13, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        zipped.writestr(info, contents)
with zipfile.ZipFile(archive) as zipped:
    require(zipped.testzip() is None, 'Archive CRC validation failed.')
    require(len(zipped.namelist()) == len(files), 'Archive entry count mismatch.')
    for name, expected in manifest.items():
        contents = zipped.read('AstraSimulator/' + name)
        require(digest(contents) == expected['sha256'] and len(contents) == expected['bytes'], f'Archive verification failed: {name}')
archive_hash = digest(archive.read_bytes())
verification = {'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': archive_hash, 'entriesVerified': len(files), 'allManifestHashesMatch': True}
(OUT / 'package-verification.json').write_text(json.dumps(verification, indent=2) + '\n', encoding='utf-8')
(DIST / 'SHA256SUMS.txt').write_text(archive_hash + '  AstraSimulator.zip\n' + builds[1]['sha256'] + '  Astra-standalone.html\n', encoding='utf-8')
print(json.dumps({'release': report, 'verification': verification}, indent=2))
