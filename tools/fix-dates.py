#!/usr/bin/env python3
"""Normalise the date columns of an export into sortable ISO timestamps.

Lazada returns dates as display strings ("Placed on 23 Apr 2023  21:06:03"),
sometimes as epoch milliseconds, and — before the harvest was tightened — the
detail pass could pick up a delivery estimate ("Get by 13 Sep-20 Sep") instead
of a real timestamp. This rewrites what is parseable and quarantines what is not,
rather than leaving a column you cannot trust.

    python3 tools/fix-dates.py output/lazada-orders-*.csv

Writes <name>-dates.csv with:
    purchasedAt / paidAt        ISO 8601, sortable, blank when unusable
    purchasedAtRaw / paidAtRaw  exactly what Lazada returned
"""
import csv, os, re, sys
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=7))          # Indochina; Lazada TH renders local time
PLACED = re.compile(r'^Placed on\s+(.+)$', re.I)
PAID   = re.compile(r'^Paid on\s+(.+)$', re.I)
EPOCH  = re.compile(r'^\d{13}$')
FMT    = '%d %b %Y %H:%M:%S'


def parse(value):
    """-> (iso, kind) where kind is 'placed' | 'paid' | 'epoch' | None."""
    v = (value or '').strip()
    if not v:
        return '', None
    if EPOCH.match(v):
        return datetime.fromtimestamp(int(v) / 1000, TZ).isoformat(), 'epoch'
    kind = None
    m = PLACED.match(v)
    if m:
        kind, rest = 'placed', m.group(1)
    else:
        m = PAID.match(v)
        if m:
            kind, rest = 'paid', m.group(1)
        else:
            rest = v
    rest = re.sub(r'\s+', ' ', rest).strip()
    for fmt in (FMT, '%d %b %Y %H:%M', '%d %b %Y'):
        try:
            return datetime.strptime(rest, fmt).replace(tzinfo=TZ).isoformat(), kind
        except ValueError:
            continue
    return '', kind


def fix(path):
    with open(path, encoding='utf-8-sig', newline='') as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        print(f'{path}: empty'); return

    stats = {'purchased_ok': 0, 'purchased_dropped': 0, 'paid_ok': 0, 'paid_dropped': 0, 'paid_was_placed': 0}

    for r in rows:
        praw, qraw = r.get('purchasedAt', ''), r.get('paidAt', '')
        r['purchasedAtRaw'], r['paidAtRaw'] = praw, qraw

        iso, kind = parse(praw)
        # A purchase date may not come from a delivery estimate or a payment time.
        if iso and kind in ('placed', 'epoch'):
            r['purchasedAt'] = iso; stats['purchased_ok'] += 1
        else:
            r['purchasedAt'] = ''
            if (praw or '').strip():
                stats['purchased_dropped'] += 1

        iso, kind = parse(qraw)
        if kind == 'placed':
            # This is the purchase time echoed into the paid column, not a payment.
            r['paidAt'] = ''; stats['paid_was_placed'] += 1
        elif iso and kind in ('paid', 'epoch'):
            r['paidAt'] = iso; stats['paid_ok'] += 1
        else:
            r['paidAt'] = ''
            if (qraw or '').strip():
                stats['paid_dropped'] += 1

    cols = list(rows[0].keys())
    for extra in ('purchasedAtRaw', 'paidAtRaw'):
        if extra not in cols:
            cols.insert(cols.index('paidAt') + 1 if 'paidAt' in cols else len(cols), extra)

    out = os.path.splitext(path)[0] + '-dates.csv'
    with open(out, 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader(); w.writerows(rows)

    n = len(rows)
    good = [r['purchasedAt'] for r in rows if r['purchasedAt']]
    print(f'{out}\n  {n} rows')
    print(f"  purchasedAt  {stats['purchased_ok']:>5} parsed   {stats['purchased_dropped']:>4} unusable, blanked")
    print(f"  paidAt       {stats['paid_ok']:>5} parsed   {stats['paid_dropped']:>4} unusable"
          f"   {stats['paid_was_placed']:>4} were the purchase time, blanked")
    if good:
        print(f'  range        {min(good)[:10]} .. {max(good)[:10]}')
        late = sum(1 for r in rows if r['purchasedAt'] and r['paidAt'] and r['paidAt'] < r['purchasedAt'])
        print(f'  sanity       {late} rows where payment precedes purchase' + ('  <-- check' if late else ''))


for p in sys.argv[1:]:
    fix(p)
