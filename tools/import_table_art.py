#!/usr/bin/env python3
"""Development-only import of the real card back. Never used during play."""
import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering-card_back.jpg'
def main():
    target=ROOT/'assets/card-back.jpg'
    if not target.exists():
        request=urllib.request.Request(SOURCE,headers={'User-Agent':'AstraGoldfish/1.1 (personal offline playtest tool)'})
        with urllib.request.urlopen(request,timeout=30) as response:data=response.read(1024*1024)
        if not data.startswith(b'\xff\xd8') or len(data)<1000:raise ValueError('Expected a JPEG card back.')
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    data=target.read_bytes()
    (ROOT/'data/ui-assets.json').write_text(json.dumps({'assets/card-back.jpg':{'source':SOURCE,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'credit':'Magic: The Gathering card back; Wizards of the Coast. Low-resolution reference image, not licensed for commercial reproduction.'}},indent=2)+'\n')
if __name__=='__main__':main()
