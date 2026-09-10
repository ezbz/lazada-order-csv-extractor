#!/usr/bin/env bash
# Pre-release checks. A popup that throws at load looks identical to a hung
# extension, so the id cross-check is not optional.
set -u
cd "$(dirname "$0")/.."
fail=0

echo "syntax"
for f in extension/*.js console/*.js; do
  node --check "$f" >/dev/null 2>&1 && echo "  ok   $f" || { echo "  FAIL $f"; fail=1; }
done
python3 -c "import ast,sys; [ast.parse(open(f).read()) for f in sys.argv[1:]]" tools/*.py \
  && echo "  ok   tools/*.py" || { echo "  FAIL tools/*.py"; fail=1; }

echo "popup element ids"
python3 - <<'PY' || fail=1
import re, sys
js = open('extension/popup.js').read()
html = open('extension/popup.html').read()
ids_js = set(re.findall(r"\$\('([a-zA-Z]+)'\)", js)) | set(re.findall(r"on\('([a-zA-Z]+)'", js))
ids_html = set(re.findall(r'id="([a-zA-Z]+)"', html))
missing = sorted(ids_js - ids_html)
print('  referenced but not in the HTML:', missing or 'none')
sys.exit(1 if missing else 0)
PY

echo "manifest"
python3 - <<'PY' || fail=1
import json, os, sys
m = json.load(open('extension/manifest.json'))
need = set(m['icons'].values()) | {'popup.html'} | {f for c in m['content_scripts'] for f in c['js']}
missing = sorted(f for f in need if not os.path.exists(os.path.join('extension', f)))
print('  version', m['version'], '| files missing:', missing or 'none')
sys.exit(1 if missing else 0)
PY

[ $fail = 0 ] && echo "PASS" || echo "FAIL"
exit $fail
