#!/usr/bin/env python3
"""Repair a CSV produced before the status mapping was fixed.

Rewrites `status` from the shop.status passthrough (the human text) instead of
delivery.status (a colour token), surfaces item-level states as `itemStatus`,
and drops columns that are empty on every row. No re-scraping needed.

    python3 tools/clean-export.py output/lazada-orders-*.csv
"""
import csv, sys, os

def clean(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        print(f"{path}: empty"); return

    for r in rows:
        r["status"] = (r.get("shop.status") or r.get("shop.orderInfo.status")
                       or r.get("status") or "").strip()
        r["itemStatus"] = (r.get("raw.status") or "").strip()

    before = len(rows[0])
    cols = [c for c in rows[0] if any((r.get(c) or "").strip() for r in rows)]
    # Keep the repaired columns even if they came out empty, and never assume
    # "status" survived the empty-column filter.
    for name in ("itemStatus", "status"):
        if name not in cols:
            anchor = cols.index("status") + 1 if name == "itemStatus" and "status" in cols else 0
            cols.insert(anchor, name)

    out = os.path.splitext(path)[0] + "-clean.csv"
    with open(out, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    dropped = max(0, before - len(cols))
    print(f"{out}\n  {len(rows)} rows, {len(cols)} columns ({dropped} always-empty columns dropped)")
    from collections import Counter
    print("  status:", dict(Counter(r["status"] for r in rows).most_common(8)))
    it = Counter(r["itemStatus"] for r in rows if r["itemStatus"])
    print("  itemStatus:", dict(it.most_common(6)) or "none")

for p in sys.argv[1:]:
    clean(p)
