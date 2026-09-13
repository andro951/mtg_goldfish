#!/usr/bin/env python3
"""Check the portable edition with no sibling assets, source, or network."""
from __future__ import annotations
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
checks, errors, requests, failures = [], [], [], []

def check(name, value):
    if not value:
        raise AssertionError(name)
    checks.append(name)
    print('PASS', name, flush=True)

try:
    with tempfile.TemporaryDirectory(prefix='astra-portable-') as temporary, sync_playwright() as p:
        destination = Path(temporary) / 'Astra-standalone.html'
        shutil.copy2(ROOT / 'Astra-standalone.html', destination)
        check('portable folder contains only the delivered HTML', len(list(Path(temporary).iterdir())) == 1)
        browser = p.chromium.launch(args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, offline=True)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('request', lambda r: requests.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
        page.goto(destination.as_uri())
        page.wait_for_function('() => window.astra?.engine')
        check('single file starts while browser is offline', page.locator('.toolbar').is_visible() and page.evaluate('astra.version') == '1.4.7')
        count = page.evaluate('Object.keys(window.ASTRA_IMAGES || {}).length')
        check('all 351 card/face images and the real Magic back are embedded', count == 352)
        image_report = page.evaluate('''async () => {
            const values = Object.values(window.ASTRA_IMAGES);
            const results = await Promise.all(values.map(src => new Promise(resolve => {
                const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0);
                image.onerror = () => resolve(false); image.src = src;
            })));
            return results.every(Boolean);
        }''')
        check('every embedded image decodes successfully', image_report)
        page.locator('[data-action="menu"]').click()
        page.locator('[data-dialog="labs"]').click()
        page.locator('[data-lab="breakfast"]').click()
        page.wait_for_function('() => astra.engine.state.seed === "lab-breakfast"')
        page.locator('[data-surface="battlefield"] .face').filter(has=page.locator('img[alt="Ancient Den"]')).click()
        check('portable UI records a real game action offline', page.evaluate('astra.engine.cursor') == 1)
        before = page.evaluate('astra.engine.exportSession().stateChecksum')
        page.evaluate('astra.flushSave()')
        page.reload()
        page.wait_for_function('() => window.astra?.engine')
        check('portable file restores its saved game after reload', before == page.evaluate('astra.engine.exportSession().stateChecksum'))
        check('portable source never stores embedded image bytes in game state', not page.evaluate('JSON.stringify(astra.engine.state).includes("data:image/")'))
        check('portable game has no external network requests', not requests)
        context.close()
        browser.close()
except Exception as error:
    failures.append(str(error))

report = {'testedBuildSHA256': hashlib.sha256((ROOT / 'Astra-standalone.html').read_bytes()).hexdigest(), 'uiVersion': '1.4.7', 'mode': 'isolated single-file Chromium with offline networking', 'checksPassed': len(checks), 'checks': checks, 'failures': failures, 'browserErrors': errors, 'externalRequests': requests, 'skipped': []}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'portable.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
raise SystemExit(bool(failures or errors or requests))
