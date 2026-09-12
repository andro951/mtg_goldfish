#!/usr/bin/env python3
"""Developer-only, resumable Scryfall importer. Gameplay never calls this code.

Pins Oracle identity, a printing, full rules text, rulings and local front/back
images. Existing pins are retained. Uses only Python's standard library.
Run: python tools/import_cards.py [--refresh] [--deck data/candidate-pool.txt]
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = 'https://api.scryfall.com'
HEADERS = {'User-Agent': 'AstraGoldfish/1.0 (personal MTG simulator; github.com/andro951/mtg_goldfish)', 'Accept': 'application/json'}
LAST_REQUEST = 0.0


def request(url: str, body: dict | None = None, api: bool = True) -> bytes:
    global LAST_REQUEST
    for attempt in range(6):
        if api:
            time.sleep(max(0, .55 - (time.monotonic() - LAST_REQUEST)))
        data = None if body is None else json.dumps(body).encode()
        headers = dict(HEADERS)
        if data is not None:
            headers['Content-Type'] = 'application/json'
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            LAST_REQUEST = time.monotonic()
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (400, 401, 403, 404):
                raise
            if attempt == 5:
                raise
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError('unreachable')


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def normalize(name: str) -> str:
    return re.sub(r'\s+', ' ', name.replace('’', "'").strip()).casefold()


def slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', normalize(name)).strip('-')


def parse_deck(text: str) -> list[dict]:
    section, result = 'main', []
    for line_no, original in enumerate(text.splitlines(), 1):
        line = original.strip()
        if not line:
            continue
        if line.startswith('//') or line.startswith('#'):
            label = line.lstrip('/# ').casefold()
            if 'commander' in label:
                section = 'command'
            elif 'outside' in label or 'sideboard' in label or 'maybeboard' in label:
                section = 'outside'
            elif 'main' in label:
                section = 'main'
            continue
        match = re.fullmatch(r'(\d+)\s*x?\s+(.+)', line)
        if not match or not 1 <= int(match[1]) <= 1000:
            raise ValueError(f'Invalid deck line {line_no}: {original}')
        result.append({'pool': section, 'quantity': int(match[1]), 'name': match[2].strip()})
    return result


def compact(raw: dict, image: str, back: str | None, rulings: list) -> dict:
    faces = raw.get('card_faces', [])
    face = faces[0] if faces else raw
    type_line = face.get('type_line', raw.get('type_line', ''))
    left, _, right = type_line.partition(' — ')
    types = [t for t in ('Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery', 'Kindred') if t in left.split()]
    return {
        'id': raw.get('oracle_id', raw['id']), 'key': slug(raw['name']),
        'name': raw['name'], 'manaCost': face.get('mana_cost', ''),
        'manaValue': raw.get('cmc', 0), 'typeLine': type_line, 'types': types,
        'subtypes': right.split(), 'supertypes': [t for t in ('Basic', 'Legendary', 'Snow', 'World') if t in left.split()],
        'oracleText': face.get('oracle_text', ''),
        'colors': face.get('colors', raw.get('colors', [])),
        'colorIdentity': raw.get('color_identity', []), 'keywords': raw.get('keywords', []),
        'power': face.get('power'), 'toughness': face.get('toughness'),
        'loyalty': face.get('loyalty'), 'defense': face.get('defense'),
        'layout': raw.get('layout', 'normal'), 'faces': faces,
        'image': image, 'backImage': back, 'printId': raw['id'],
        'set': raw.get('set'), 'collectorNumber': raw.get('collector_number'),
        'source': raw.get('scryfall_uri'), 'rulings': rulings,
        'related': raw.get('all_parts', []), 'metadataStatus': 'canonical',
        'oracleSnapshotAt': datetime.now(timezone.utc).isoformat(),
    }


def image_bytes_ok(data: bytes) -> bool:
    return data.startswith(b'\xff\xd8\xff') or data.startswith(b'\x89PNG\r\n\x1a\n') or (data.startswith(b'RIFF') and b'WEBP' in data[:16])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deck', default='data/candidate-pool.txt')
    parser.add_argument('--refresh', action='store_true', help='Explicitly re-pin metadata; never performed at runtime.')
    parser.add_argument('--no-rulings', action='store_true', help='Development only: do not fetch official ruling records.')
    args = parser.parse_args()
    data_dir = ROOT / 'data'
    data_dir.mkdir(exist_ok=True)
    records = parse_deck((ROOT / args.deck).read_text(encoding='utf-8'))
    names = list(dict.fromkeys(r['name'] for r in records))
    raw_path = data_dir / 'oracle-snapshot.json'
    snapshots = {} if args.refresh or not raw_path.exists() else json.loads(raw_path.read_text(encoding='utf-8'))
    missing = [n for n in names if normalize(n) not in snapshots]
    for start in range(0, len(missing), 75):
        response = json.loads(request(API + '/cards/collection', {'identifiers': [{'name': n} for n in missing[start:start + 75]]}))
        if response.get('not_found'):
            write_json(data_dir / 'missing-cards.json', response['not_found'])
            raise RuntimeError('Canonical lookup failed: ' + repr(response['not_found']))
        for card in response['data']:
            snapshots[normalize(card['name'])] = card
        write_json(raw_path, snapshots)
    cards_path = data_dir / 'cards.json'
    previous = {} if not cards_path.exists() else {c['id']: c for c in json.loads(cards_path.read_text(encoding='utf-8'))}
    # Only related tokens/meld results, not unrelated cards named in a printing's parts.
    related = {p['uri'] for raw in list(snapshots.values()) for p in raw.get('all_parts', []) if p.get('component') in ('token', 'meld_result')}
    known_prints = {r['id'] for r in snapshots.values()}
    for uri in sorted(related):
        if uri.rsplit('/', 1)[-1] not in known_prints:
            raw = json.loads(request(uri))
            snapshots[normalize(raw['name'])] = raw
            known_prints.add(raw['id'])
            write_json(raw_path, snapshots)
    cards, assets = [], {}
    for index, (name_key, raw) in enumerate(sorted(snapshots.items())):
        oracle_id = raw.get('oracle_id', raw['id'])
        faces = raw.get('card_faces', [])
        front_uris = raw.get('image_uris') or (faces[0].get('image_uris', {}) if faces else {})
        if not front_uris:
            raise RuntimeError('No printing image for ' + raw['name'])
        image = f'assets/cards/{oracle_id}.jpg'
        back = f'assets/cards/{oracle_id}-back.jpg' if len(faces) > 1 and faces[1].get('image_uris') else None
        image_jobs = [(image, front_uris.get('normal') or front_uris['large'])]
        if back:
            image_jobs.append((back, faces[1]['image_uris'].get('normal') or faces[1]['image_uris']['large']))
        for path, url in image_jobs:
            target = ROOT / path
            if not target.exists() or args.refresh:
                target.parent.mkdir(parents=True, exist_ok=True)
                content = request(url, api=False)
                if not image_bytes_ok(content):
                    raise RuntimeError('Image validation failed: ' + url)
                target.write_bytes(content)
                time.sleep(.12)
            content = target.read_bytes()
            assets[path] = {'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content), 'source': url, 'printing': raw['id']}
        prev = previous.get(oracle_id, {})
        rulings = prev.get('rulings')
        if rulings is None:
            rulings = [] if args.no_rulings or not raw.get('rulings_uri') else json.loads(request(raw['rulings_uri']))['data']
        card = compact(raw, image, back, rulings)
        if prev and not args.refresh:
            card['oracleSnapshotAt'] = prev.get('oracleSnapshotAt', card['oracleSnapshotAt'])
        card['candidate'] = name_key in {normalize(n) for n in names}
        cards.append(card)
        print(f'[{index + 1}/{len(snapshots)}] {raw["name"]}', flush=True)
    by_name = {normalize(c['name']): c for c in cards}
    for record in records:
        card = by_name[normalize(record['name'])]
        record['id'] = card['id']
        record['isLand'] = 'Land' in card['types']
    write_json(cards_path, cards)
    write_json(data_dir / 'pool.json', records)
    write_json(data_dir / 'assets-manifest.json', assets)
    write_json(data_dir / 'import-report.json', {
        'version': '1.0.0', 'source': 'Scryfall REST API; pinned Oracle IDs and printings',
        # Stable when verification does not change the pinned metadata.
        'importedAt': max((c['oracleSnapshotAt'] for c in cards), default='unknown'),
        'contentSha256': hashlib.sha256(json.dumps([cards, records, assets], sort_keys=True).encode()).hexdigest(),
        'candidateCards': len(names),
        'definitionsIncludingDerived': len(cards), 'localImages': len(assets),
        'runtimeNetworkRequired': False, 'missing': [],
        'mainCopies': sum(r['quantity'] for r in records if r['pool'] == 'main'),
        'mainLands': sum(r['quantity'] for r in records if r['pool'] == 'main' and r['isLand']),
        'warnings': [f'{n}: {sum(r["quantity"] for r in records if r["name"] == n)} copies in source pool' for n in names if sum(r['quantity'] for r in records if r['name'] == n) > 1],
    })
    print('Import complete. Canonical data and all printing images are local.', flush=True)


if __name__ == '__main__':
    try:
        main()
        from import_table_art import main as import_table_art
        import_table_art()
    except Exception as exc:
        print(f'Import failed: {exc}', file=sys.stderr)
        raise
