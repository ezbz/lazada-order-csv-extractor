/*
 * Lazada order history -> CSV.  Targets the real endpoint:
 *   POST /customer/api/async/order-list   (Ultron async protocol)
 *
 * Paste on your logged-in order list page. It will:
 *   1. record one real order-list request (auto-clicking the pager if needed),
 *   2. replay it for every page with lifecycle.pageNum swapped,
 *   3. download a CSV (and the raw JSON).
 *
 * lzxStop() aborts; partial results still download.
 */
(async () => {
  const OPTS = {
    startPage: 1,
    endPage: 0,        // 0 = use module.lifecycle.totalPageNum from the response
    delayMs: 600,
    pageSize: 0,       // 0 = leave untouched. Try 50 to cut the number of requests;
                       // verified against the server's echoed pageSize before use.
  };

  let stopped = false;
  window.lzxStop = () => { stopped = true; console.log('[lzx] stopping…'); };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const isScalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  const safeParse = (t) => { try { return JSON.parse(t); } catch (_) { return null; } };
  const PAGE_KEYS = /^(page|pagenum|pageno|pageindex|pagenumber|currentpage|curpage|pn)$/i;
  const SIZE_KEYS = /^(pagesize|size|limit|rows)$/i;
  const ENDPOINT = /\/customer\/api\/async\/order-list/i;

  // ---- deep page-key handling (pageNum lives inside `lifecycle`) -----------
  function deepFindKey(node, re, depth = 0) {
    if (!isObj(node) || depth > 6) return null;
    for (const [k, v] of Object.entries(node)) {
      if (re.test(k) && (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)))) {
        return [{ k, leaf: true, str: typeof v === 'string' }];
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (isObj(v)) { const s = deepFindKey(v, re, depth + 1); if (s) return [{ k, json: false }, ...s]; }
      else if (typeof v === 'string' && /^\s*[{[]/.test(v)) {
        const p = safeParse(v);
        if (isObj(p)) { const s = deepFindKey(p, re, depth + 1); if (s) return [{ k, json: true }, ...s]; }
      }
    }
    return null;
  }

  function deepSet(node, path, value) {
    const [head, ...rest] = path;
    const out = { ...node };
    if (head.leaf) { out[head.k] = head.str ? String(value) : value; return out; }
    const child = head.json ? safeParse(node[head.k]) : node[head.k];
    const next = deepSet(child, rest, value);
    out[head.k] = head.json ? JSON.stringify(next) : next;
    return out;
  }

  // ---- Ultron response -> rows -------------------------------------------
  function scalars(obj, prefix) {
    const out = {};
    if (!isObj(obj)) return out;
    for (const [k, v] of Object.entries(obj)) {
      if (isScalar(v)) out[prefix + k] = v;
      else if (isObj(v)) for (const [k2, v2] of Object.entries(v)) if (isScalar(v2)) out[`${prefix}${k}.${k2}`] = v2;
    }
    return out;
  }

  function parseUltron(json, page) {
    const mod = json && json.module;
    const data = mod && mod.data;
    if (!isObj(data)) return null;

    const ents = [];
    for (const [key, v] of Object.entries(data)) {
      if (isObj(v) && isObj(v.fields)) ents.push({ key, id: v.id, fields: v.fields });
    }
    const items = ents.filter((e) => /^orderItem/i.test(e.key));
    if (!items.length) return null;

    // Shops join to items by tradeOrderLineIds (precise) and fall back to
    // tradeOrderId. The two are NOT interchangeable in this payload, so the
    // output records which join was used.
    const shops = ents.filter((e) => /^orderShop/i.test(e.key));
    const shopByLineId = new Map();
    const shopByOrderId = new Map();
    for (const s of shops) {
      const lineIds = s.fields.tradeOrderLineIds;
      const list = Array.isArray(lineIds) ? lineIds
        : (typeof lineIds === 'string' ? lineIds.split(/[,;\s]+/) : []);
      for (const id of list) if (id) shopByLineId.set(String(id).trim(), s.fields);
      const oid = s.fields.tradeOrderId;
      if (oid && !shopByOrderId.has(String(oid))) shopByOrderId.set(String(oid), s.fields);
    }

    const rows = items.map((e) => {
      const f = e.fields;
      const d = isObj(f.delivery) ? f.delivery : {};
      const sku = isObj(f.sku) ? f.sku : {};
      const lineId = String(e.id || e.key.replace(/^orderItem_/i, ''));

      let shop = shopByLineId.get(lineId);
      let match = 'lineId';
      if (!shop) { shop = shopByOrderId.get(String(f.tradeOrderId)); match = shop ? 'orderId' : 'none'; }
      if (!shop) shop = {};
      const oi = isObj(shop.orderInfo) ? shop.orderInfo : {};

      return {
        _page: page,
        _shopMatch: match,
        orderId: f.tradeOrderId ?? '',
        lineId,
        purchasedAt: '',   // not present in the list endpoint; see the extension's detail pass
        paidAt: '',
        status: shop.status || oi.status || d.status || '',
        itemStatus: f.status || '',
        title: f.title ?? '',
        variation: sku.skuText ?? sku.productVariant ?? '',
        quantity: f.quantity ?? '',
        price: f.price ?? '',
        orderTotal: d.orderDetailPrice ?? '',
        paymentMethod: oi.paymentDes ?? '',
        deliveryMethod: d.method ?? '',
        deliveryPrice: d.price ?? '',
        deliverySummary: d.deliverySummary ?? '',
        brand: sku.brand ?? '',
        shopName: shop.name ?? '',
        shopId: shop.shopId ?? '',
        sellerId: f.sellerId ?? shop.sellerId ?? '',
        itemId: f.itemId ?? '',
        skuId: f.skuId ?? '',
        orderDetailUrl: f.orderDetailUrl ?? (isObj(shop.order) ? shop.order.orderDetailUrl : '') ?? '',
        itemUrl: f.itemUrl ?? '',
        picUrl: f.picUrl ?? '',
        ...scalars(f, 'raw.'),
        ...scalars(shop, 'shop.'),
      };
    });

    const lc = isObj(mod.lifecycle) ? mod.lifecycle : {};
    return {
      rows,
      raw: items.map((i) => i.fields),
      totalPages: Number(lc.totalPageNum) || 0,
      pageNum: Number(lc.pageNum) || page,
      pageSize: Number(lc.pageSize) || 0,
    };
  }

  // ---- record one real request (with headers) ------------------------------
  function installRecorder() {
    if (window.__lzxCap) return;
    window.__lzxCap = [];
    const oo = XMLHttpRequest.prototype.open;
    const os = XMLHttpRequest.prototype.send;
    const osh = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (m, u) { this.__lzx = { m, u, h: {} }; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__lzx) this.__lzx.h[k] = v; return osh.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      const meta = this.__lzx;
      if (meta && ENDPOINT.test(meta.u)) {
        this.addEventListener('load', () => {
          window.__lzxCap.push({ url: new URL(meta.u, location.href).toString(), method: meta.m, headers: meta.h, body: typeof b === 'string' ? b : null, resp: this.responseText });
        });
      }
      return os.apply(this, arguments);
    };
    const of = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const p = of.apply(this, arguments);
      if (ENDPOINT.test(url)) {
        p.then((r) => r.clone().text().then((t) => {
          const h = {};
          try { new Headers((init && init.headers) || {}).forEach((v, k) => { h[k] = v; }); } catch (_) {}
          window.__lzxCap.push({ url, method: (init && init.method) || 'POST', headers: h, body: (init && typeof init.body === 'string') ? init.body : null, resp: t });
        }).catch(() => {})).catch(() => {});
      }
      return p;
    };
  }

  function clickAnotherPage() {
    const btns = [...document.querySelectorAll('.next-pagination-item, [class*="pagination-item"]')]
      .filter((b) => /^\d+$/.test((b.textContent || '').trim()) && !b.disabled);
    if (!btns.length) return false;
    const current = btns.find((b) => /current|active/i.test(b.className));
    const target = btns.find((b) => b !== current) || btns[btns.length - 1];
    target.click();
    return true;
  }

  async function getCapture() {
    const usable = () => (window.__lzxCap || []).find((c) => c.body && safeParse(c.body));
    installRecorder();
    if (usable()) return usable();

    // Reuse a capture from diagnose.js if one is there (may lack headers).
    const old = (window.__lzxRec || []).find((r) => ENDPOINT.test(r.url) && r.body && safeParse(r.body));
    if (old) { console.log('[lzx] reusing capture from diagnose.js'); return { ...old, headers: old.headers || {} }; }

    console.log('[lzx] recording a real request — clicking the pager…');
    if (!clickAnotherPage()) {
      console.error('[lzx] could not find a pager button. Click any page number yourself, then re-run this script.');
      return null;
    }
    for (let i = 0; i < 40 && !usable(); i++) await sleep(500);
    return usable() || null;
  }

  // ---- output --------------------------------------------------------------
  function toCsv(rows) {
    if (!rows.length) return '';
    const cols = []; const seen = new Set();
    for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  }

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ---- run -----------------------------------------------------------------
  const cap = await getCapture();
  if (!cap) return;

  const body = safeParse(cap.body);
  const pagePath = deepFindKey(body, PAGE_KEYS);
  if (!pagePath) {
    console.error('[lzx] no page field found in the request body. Keys:', Object.keys(body));
    window.lzxBody = body;
    return;
  }
  console.log(`[lzx] page field: body.${pagePath.map((p) => p.k).join('.')}`);

  const headers = { ...(cap.headers || {}) };
  ['host', 'cookie', 'content-length', 'connection', 'origin', 'referer', 'user-agent']
    .forEach((h) => Object.keys(headers).forEach((k) => { if (k.toLowerCase() === h) delete headers[k]; }));
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';

  let template = body;
  let sizePath = null;
  if (OPTS.pageSize) {
    sizePath = deepFindKey(body, SIZE_KEYS);
    if (sizePath) template = deepSet(template, sizePath, OPTS.pageSize);
  }

  async function fetchPage(page) {
    const res = await fetch(cap.url, {
      method: cap.method || 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(deepSet(template, pagePath, page)),
    });
    const json = safeParse(await res.text());
    if (!json) throw new Error(`page ${page}: response was not JSON (HTTP ${res.status})`);
    if (json.success === false) throw new Error(`page ${page}: server returned success=false (${json.errorCode || 'no code'})`);
    const parsed = parseUltron(json, page);
    if (!parsed) throw new Error(`page ${page}: no orderItem entities in response`);
    return parsed;
  }

  let first;
  try { first = await fetchPage(OPTS.startPage); }
  catch (e) { console.error('[lzx] first page failed:', e.message); return; }

  // Honour the server's echoed pageSize rather than assuming our bump worked.
  if (OPTS.pageSize && sizePath && first.pageSize && first.pageSize !== OPTS.pageSize) {
    console.warn(`[lzx] server kept pageSize=${first.pageSize}; ignoring the requested ${OPTS.pageSize}`);
    template = body;
    first = await fetchPage(OPTS.startPage);
  }

  const total = OPTS.endPage || first.totalPages || 1;
  console.log(`[lzx] ${total} pages, pageSize ${first.pageSize || '?'} — starting`);

  const rows = [...first.rows];
  const raw = [...first.raw];
  const seen = new Set(rows.map((r) => `${r.orderId}|${r.lineId}`));

  for (let page = OPTS.startPage + 1; page <= total && !stopped; page++) {
    await sleep(OPTS.delayMs + Math.random() * 200);
    let out;
    try { out = await fetchPage(page); }
    catch (e) { console.warn(`[lzx] ${e.message} — stopping`); break; }
    let added = 0;
    for (const r of out.rows) {
      const k = `${r.orderId}|${r.lineId}`;
      if (seen.has(k)) continue;
      seen.add(k); rows.push(r); added++;
    }
    raw.push(...out.raw);
    console.log(`[lzx] page ${page}/${total} — ${out.rows.length} items (${added} new), ${rows.length} total`);
  }

  window.lzxRows = rows;
  window.lzxRaw = raw;
  if (!rows.length) { console.error('[lzx] no rows extracted'); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  download(`lazada-orders-${stamp}.csv`, toCsv(rows), 'text/csv');
  download(`lazada-orders-${stamp}.json`, JSON.stringify(raw, null, 2), 'application/json');
  console.log(`[lzx] done — ${rows.length} item rows across ${new Set(rows.map((r) => r.orderId)).size} orders. Also on window.lzxRows`);
})();
