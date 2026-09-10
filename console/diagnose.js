/*
 * Lazada extractor — diagnostics.
 *
 * Paste this on your LOGGED-IN order list page (the one with the 1/124 pager).
 * It prints a compact structural report: selectors, pager links, and whether the
 * page HTML is server-rendered or a JS shell.
 *
 * It reports key NAMES, counts and URL shapes — not your order contents.
 *
 * Then:
 *   1. It installs a network recorder.
 *   2. You click page 2 in Lazada's pager.
 *   3. Run  lzxReport()  to see which request carried the orders.
 */
(async () => {
  const out = { step1_page: {}, step2_dom: {}, step3_pager: {}, step4_fetch: {} };

  // ---- 1. where are we -----------------------------------------------------
  out.step1_page = {
    url: location.origin + location.pathname,
    queryParams: [...new URLSearchParams(location.search).keys()],
    title: document.title,
  };

  // ---- 2. does the LIVE dom contain recognisable orders? -------------------
  const sels = {
    'order-item': '[class*="order-item"]',
    orderItem: '[class*="orderItem"]',
    'order-card': '[class*="order-card"]',
    'order-box': '[class*="order-box"]',
    'order-list-item': '[class*="order-list-item"]',
    tradeOrderIdLinks: 'a[href*="tradeOrderId"]',
    orderDetailLinks: 'a[href*="order/detail"]',
    orderIdLinks: 'a[href*="orderId="]',
    productLinks: 'a[href*="/products/"]',
    imgAlts: 'img[alt]',
  };
  out.step2_dom.selectorCounts = {};
  for (const [k, s] of Object.entries(sels)) {
    try { out.step2_dom.selectorCounts[k] = document.querySelectorAll(s).length; } catch (_) {}
  }

  // Auto-discover the repeating "order card" class by looking for repeated
  // elements whose text contains a price.
  const priceRe = /(?:฿|THB|RM|Rp|S\$|₱|₫)\s?\d/;
  const classCount = {};
  document.querySelectorAll('div,li,section,article').forEach((el) => {
    const cn = typeof el.className === 'string' ? el.className.trim() : '';
    if (!cn) return;
    const t = el.innerText || '';
    if (t.length < 30 || t.length > 4000 || !priceRe.test(t)) return;
    cn.split(/\s+/).forEach((c) => { classCount[c] = (classCount[c] || 0) + 1; });
  });
  out.step2_dom.candidateCardClasses = Object.entries(classCount)
    .filter(([, n]) => n >= 3 && n <= 80)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([c, n]) => `${c} (${n})`);

  // Server-rendered JSON globals present on this page?
  out.step2_dom.jsonGlobals = ['pageData', '__INITIAL_STATE__', '__moduleData__', '__INIT_DATA__', 'PAGE_DATA', 'g_config']
    .filter((k) => typeof window[k] !== 'undefined');

  // ---- 3. what does the pager actually do? --------------------------------
  const pagerEls = [...document.querySelectorAll(
    '[class*="pagination"] a, [class*="pagination"] li, [class*="pager"] a, [class*="next-pagination"] a, [class*="next-pagination"] button'
  )].slice(0, 25);
  out.step3_pager = {
    elementCount: pagerEls.length,
    samples: pagerEls.map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 12),
      href: el.getAttribute('href'),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
    })).filter((x) => x.text),
  };
  out.step3_pager.hrefsPresent = out.step3_pager.samples.some((s) => s.href && s.href !== '#' && s.href !== 'javascript:void(0)');

  // ---- 4. is fetched HTML server-rendered, or a JS shell? -----------------
  try {
    const u = new URL(location.href);
    u.searchParams.set('page', '2');
    const res = await fetch(u.toString(), { credentials: 'include' });
    const html = await res.text();
    out.step4_fetch = {
      status: res.status,
      finalUrl: res.url.split('?')[0],
      redirectedToLogin: /login|signin/i.test(res.url),
      bytes: html.length,
      mentionsTradeOrderId: html.includes('tradeOrderId'),
      mentionsOrderClass: /order-item|orderItem|order-card/.test(html),
      hasJsonGlobal: /(?:window\.)?(?:pageData|__INITIAL_STATE__|__moduleData__)\s*=/.test(html),
      liveDomBytes: document.documentElement.outerHTML.length,
    };
    out.step4_fetch.verdict = out.step4_fetch.bytes < out.step4_fetch.liveDomBytes / 3
      ? 'LIKELY JS SHELL — client-rendered, HTML mode cannot work'
      : 'HTML looks substantive';
  } catch (e) {
    out.step4_fetch = { error: e.message };
  }

  // ---- 5. install recorder ------------------------------------------------
  if (!window.__lzxRec) {
    window.__lzxRec = [];
    const interesting = (u) => /order/i.test(u) || /\/api\//i.test(u) || /mtop|h5api|\/gw\//i.test(u);
    const of = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const p = of.apply(this, arguments);
      if (interesting(url)) {
        p.then((r) => r.clone().text().then((b) => window.__lzxRec.push({
          kind: 'fetch', url, method: (init && init.method) || 'GET',
          body: (init && typeof init.body === 'string') ? init.body : null, resp: b,
        })).catch(() => {})).catch(() => {});
      }
      return p;
    };
    const oo = XMLHttpRequest.prototype.open;
    const os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      if (interesting(this.__u || '')) {
        this.addEventListener('load', () => {
          try { window.__lzxRec.push({ kind: 'xhr', url: this.__u, method: this.__m, body: typeof b === 'string' ? b : null, resp: this.responseText }); } catch (_) {}
        });
      }
      return os.apply(this, arguments);
    };
  }

  window.lzxReport = () => {
    const ORDER_KEYS = /"(?:tradeOrderId|orderId|orderNumber|orderNo|ordersn)"/i;
    const rows = window.__lzxRec.map((r) => {
      const url = new URL(r.url, location.href);
      let bodyKeys = null;
      try { const j = JSON.parse(r.body); bodyKeys = Object.keys(j); } catch (_) {}
      return {
        method: r.method,
        host: url.host,
        path: url.pathname,
        queryKeys: [...url.searchParams.keys()],
        bodyKeys,
        respBytes: (r.resp || '').length,
        hasOrders: ORDER_KEYS.test(r.resp || ''),
        topKeys: (() => { try { return Object.keys(JSON.parse(r.resp)).slice(0, 12); } catch (_) { return null; } })(),
      };
    });
    console.log('=== LZX RECORDED REQUESTS (copy this) ===');
    console.log(JSON.stringify(rows, null, 1));
    const hit = window.__lzxRec.find((r) => ORDER_KEYS.test(r.resp || ''));
    if (hit) {
      console.log('=== ORDER RESPONSE SHAPE (key names only) ===');
      const keyPaths = new Set();
      (function walk(n, path, d) {
        if (!n || typeof n !== 'object' || d > 6) return;
        if (Array.isArray(n)) { if (n[0]) walk(n[0], path + '[]', d + 1); return; }
        for (const k of Object.keys(n)) { keyPaths.add(path + '.' + k); walk(n[k], path + '.' + k, d + 1); }
      })(JSON.parse(hit.resp), '', 0);
      console.log([...keyPaths].slice(0, 200).join('\n'));
    } else {
      console.log('No recorded response contained order ids yet — click page 2 in the pager, then run lzxReport() again.');
    }
    return rows;
  };

  console.log('=== LZX DIAGNOSTICS (copy this) ===');
  console.log(JSON.stringify(out, null, 1));
  console.log('%c NEXT: click page 2 in Lazada\'s pager, then run  lzxReport()', 'font-weight:bold;font-size:13px');
})();
