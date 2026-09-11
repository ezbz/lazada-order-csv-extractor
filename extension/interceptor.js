// MAIN world, document_start (also injected on demand by the popup).
// Records the order-list request so it can be replayed page by page.
// Everything stays in this tab.
(() => {
  if (window.__LZX_INTERCEPTOR__) return;
  window.__LZX_INTERCEPTOR__ = true;

  const MAX_BODY = 400000;
  const interesting = (url) => {
    try {
      // Pathname only: a query string carries spm tokens and search terms that
      // would otherwise drag in cart, checkout and address-book responses.
      return /order/i.test(new URL(url, location.href).pathname);
    } catch (_) {
      return false;
    }
  };

  // Requests fire during page load, potentially before the ISOLATED-world
  // listener exists. Buffer them so they can be replayed on demand.
  const buffer = [];
  let port = null;
  const emit = (rec) => {
    try {
      if (port) port.postMessage({ __lzx: 'capture', rec });
      else window.postMessage({ __lzx: 'capture', rec }, '*');
    } catch (_) {}
  };
  const post = (rec) => {
    buffer.push(rec);
    if (buffer.length > 20) buffer.shift();
    emit(rec);
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__lzx === 'connect') {
      const ch = new MessageChannel();
      port = ch.port1;
      window.postMessage({ __lzx: 'port' }, '*', [ch.port2]);
      for (const rec of buffer) emit(rec);
      return;
    }
    if (e.data.__lzx === 'drain') for (const rec of buffer) emit(rec);
  });

  // Bodies arrive as strings, URLSearchParams or FormData; keep what is replayable.
  const readBody = (init) => {
    if (!init || init.body == null) return null;
    if (typeof init.body === 'string') return init.body;
    try {
      if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams) return init.body.toString();
    } catch (_) {}
    return null;
  };

  const headersToObject = (h) => {
    const out = {};
    try {
      if (!h) return out;
      if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach((v, k) => { out[k] = v; });
      else if (Array.isArray(h)) h.forEach(([k, v]) => { out[k] = v; });
      else if (typeof h === 'object') Object.keys(h).forEach((k) => { out[k] = String(h[k]); });
    } catch (_) {}
    return out;
  };

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      let url = '';
      let bodySource = null;
      try {
        url = typeof input === 'string' ? input : (input && input.url) || String(input);
        // A Request carries its body on the object, not in init.
        if (typeof Request !== 'undefined' && input instanceof Request && !(init && init.body)) {
          bodySource = input.clone();
        }
      } catch (_) {}
      const p = origFetch.apply(this, arguments);
      if (!interesting(url)) return p;
      return p.then((res) => {
        try {
          res.clone().text().then((body) => {
            if (!/^\s*[{[]/.test(body)) return;
            post({
              url: new URL(url, location.href).toString(),
              method: String((init && init.method) || (input && input.method) || 'GET').toUpperCase(),
              reqHeaders: headersToObject((init && init.headers) || (input && input.headers)),
              reqBody: readBody(init),
              status: res.status,
              body: body.slice(0, MAX_BODY),
              ts: Date.now(),
              pending: !!bodySource,
            });
            // A Request body only reads asynchronously; re-post once it resolves.
            if (bodySource) {
              bodySource.text().then((rb) => {
                if (rb) post({
                  url: new URL(url, location.href).toString(),
                  method: String((init && init.method) || (input && input.method) || 'GET').toUpperCase(),
                  reqHeaders: headersToObject((init && init.headers) || (input && input.headers)),
                  reqBody: rb, status: res.status, body: body.slice(0, MAX_BODY), ts: Date.now(),
                });
              }).catch(() => {});
            }
          }).catch(() => {});
        } catch (_) {}
        return res;
      });
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    const setHeader = XHR.prototype.setRequestHeader;

    XHR.prototype.open = function (method, url) {
      this.__lzx = { method: String(method || 'GET').toUpperCase(), url: String(url || ''), headers: {} };
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (k, v) {
      if (this.__lzx) this.__lzx.headers[k] = v;
      return setHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      const meta = this.__lzx;
      if (meta && interesting(meta.url)) {
        this.addEventListener('load', () => {
          try {
            const text = (this.responseType === '' || this.responseType === 'text')
              ? this.responseText
              : (typeof this.response === 'string' ? this.response : '');
            if (!/^\s*[{[]/.test(text || '')) return;
            post({
              url: new URL(meta.url, location.href).toString(),
              method: meta.method,
              reqHeaders: meta.headers,
              reqBody: typeof body === 'string' ? body
                : (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams ? body.toString() : null),
              status: this.status,
              body: (text || '').slice(0, MAX_BODY),
              ts: Date.now(),
            });
          } catch (_) {}
        });
      }
      return send.apply(this, arguments);
    };
  }
})();
