#!/bin/bash
# Stamp one version across index.html and every module import, whether or not the file
# already carries one. An earlier loop asserted mid-way and left some imports unversioned.
set -e
cd "$(dirname "$0")"
V=${1:-$(date +%Y%m%d%H%M%S)}
/opt/anaconda3/bin/python3 - "$V" <<'PY'
import sys, re, pathlib
V = sys.argv[1]
idx = pathlib.Path("index.html"); s = idx.read_text()
s2 = re.sub(r'src="js/main\.js(\?v=\d+)?"', f'src="js/main.js?v={V}"', s)
assert 'main.js?v=' + V in s2, "index.html entry not stamped"
idx.write_text(s2)
n = 0
for f in sorted(pathlib.Path("js").glob("*.js")):
    t = f.read_text()
    t2 = re.sub(r'from "\./([a-z-]+)\.js(\?v=\d+)?"', lambda m: f'from "./{m.group(1)}.js?v={V}"', t)
    if t2 != t: f.write_text(t2); n += 1
    for m in re.finditer(r'from "\./[a-z-]+\.js(\?v=\d+)?"', t2):
        assert m.group(1) == f"?v={V}", f"{f}: {m.group(0)} not stamped"
print(f"version {V} — index + {n} module files")
PY
