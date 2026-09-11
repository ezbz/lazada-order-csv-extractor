#!/usr/bin/env python3
"""Recompute the money columns from the raw `charges` breakdown.

The extension classified breakdown lines by loose keyword match and kept only the
first hit per category. Several labels collide ("Shipping Fee" vs "Shipping Fee
Voucher" vs "Standard Delivery"), and discounts are spread over many lines, so
single-match columns were wrong. `charges` holds every line verbatim, so the
columns can be rebuilt without re-scraping.

    python3 tools/fix-charges.py output/lazada-orders-*.csv
"""
import csv, os, re, sys, collections

def money(s):
    s = (s or '').strip()
    if not s or re.search(r'free', s, re.I): return 0.0
    neg = s.lstrip().startswith('-')
    n = re.sub(r'[^0-9.]', '', s)
    try: v = float(n)
    except ValueError: return 0.0
    return -v if neg else v

def classify(label):
    l = label.strip().lower()
    if re.match(r'^total\b', l):                       return 'total'
    if re.match(r'^sub\s*total', l):                   return 'subtotal'
    if 'shipping fee' in l:
        # "Shipping Fee Voucher" / "... Promotion" are discounts, not the fee.
        return 'ship_discount' if re.search(r'voucher|promo|discount', l) else 'shipping'
    # "Standard Delivery" / "Economy Delivery" head a package block and carry
    # that package's total, not a shipping charge: they equal "Total:" in 2223
    # of 2227 rows that have both. Used only as a fallback for the total.
    if re.search(r'\bdelivery\b', l):                  return 'package_total'
    if 'cashback' in l:                                return 'cashback'
    if re.search(r'voucher|discount|promo|coupon|coins|rebate', l): return 'discount'
    return 'other'          # product lines and anything unrecognised

def parse(charges):
    out = collections.defaultdict(float)
    labels = collections.defaultdict(list)
    for part in (charges or '').split(' | '):
        if '=' not in part: continue
        label, value = part.rsplit('=', 1)
        kind = classify(label)
        if kind == 'other': continue
        out[kind] += money(value)
        labels[kind].append(label.strip())
    return out, labels

def fix(path):
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig'), ))
    if not rows: print(f'{path}: empty'); return

    stats = collections.Counter()
    for r in rows:
        v, _ = parse(r.get('charges'))
        # Discounts are stored negative; report them as positive magnitudes.
        disc = abs(v['discount']) + abs(v['ship_discount'])
        r['subtotal']       = f"{v['subtotal']:.2f}"        if v['subtotal'] else ''
        r['shippingFee']    = f"{v['shipping']:.2f}"        if v['shipping'] else ''
        total = v['total'] or v['package_total']
        r['discount']       = f"{disc:.2f}"                 if disc else ''
        r['cashback']       = f"{v['cashback']:.2f}"        if v['cashback'] else ''
        r['orderTotal']     = f"{total:.2f}"                if total else ''
        # refundAmount previously swallowed "Cashback earned"; it is not a refund.
        if 'cashback' in (r.get('refundAmount') or '').lower() or r.get('refundAmount') == r.get('cashback'):
            r['refundAmount'] = ''
        if total: stats['total'] += 1
        if not v['total'] and v['package_total']: stats['total_via_package'] += 1
        if v['subtotal']: stats['subtotal'] += 1
        if v['shipping']: stats['shipping'] += 1
        if disc: stats['discount'] += 1
        if v['cashback']: stats['cashback'] += 1

    # Does subtotal + shipping - discount reconcile to the stated total?
    ok = off = 0
    for r in rows:
        t, s = money(r['orderTotal']), money(r['subtotal'])
        if not t or not s: continue
        calc = s + money(r['shippingFee']) - money(r['discount'])
        (ok := ok + 1) if abs(calc - t) < 1.0 else (off := off + 1)
    cols = list(rows[0].keys())
    for extra in ('cashback',):
        if extra not in cols: cols.insert(cols.index('discount') + 1, extra)

    out = os.path.splitext(path)[0] + '-charges.csv'
    with open(out, 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader(); w.writerows(rows)

    n = len(rows)
    print(f'{out}\n  {n} rows')
    for k in ('total','total_via_package','subtotal','shipping','discount','cashback'):
        print(f'  {k:<10} {stats[k]:>5} rows')
    tot = ok + off
    if tot:
        print(f'  reconciles  {ok}/{tot} rows where subtotal+shipping-discount == total '
              f'({100*ok/tot:.1f}%)')

for p in sys.argv[1:]:
    fix(p)
