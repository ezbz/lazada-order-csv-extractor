const $ = (id) => document.getElementById(id);
// Bind defensively: a missing element must not throw at load and take the
// whole popup down with it.
const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
const ORDER_PATH = '/customer/order/index/';
const n = (v) => (v || 0).toLocaleString();

let tabId = null;
let ready = false;

const send = (msg) => new Promise((resolve) => {
  if (typeof tabId !== 'number') { resolve({ ok: false, error: 'no tab' }); return; }
  chrome.tabs.sendMessage(tabId, msg, (res) => {
    resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (res || { ok: false }));
  });
});

// Loading an extension does not inject content scripts into already-open tabs,
// so inject on demand rather than making people reload.
async function ensureInjected() {
  if ((await send({ cmd: 'ping' })).ok) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['interceptor.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'], world: 'ISOLATED' });
  } catch (e) {
    $('sub').textContent = 'Cannot attach to this page';
    $('phase').textContent = e.message;
    return false;
  }
  return (await send({ cmd: 'ping' })).ok;
}

function paint(s) {
  const p = s.progress || {};

  if (s.rows) {
    $('count').textContent = n(s.rows);
    $('sub').textContent = `items from ${n(s.orders)} orders`;
  } else {
    $('count').textContent = s.totalPages ? n(s.totalPages) : '—';
    $('sub').textContent = s.totalPages === 1 ? 'page ready to export' : 'pages ready to export';
  }

  if (s.running) {
    $('phase').textContent = s.phase === 'details'
      ? `Reading order ${n(p.done)} of ${n(p.total)}`
      : `Page ${n(p.done)} of ${n(p.total)}`;
  } else {
    $('phase').textContent = s.done ? (p.message || 'Finished') : '';
  }

  $('fill').style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';

  $('run').disabled = s.running;
  $('stop').disabled = !s.running;
  $('csv').disabled = !s.rows || s.running;
  $('json').disabled = !s.rows || s.running;
  $('sample').disabled = s.running || !s.captures;

  const dates = $('dates');
  dates.disabled = s.running || !s.rows || !s.hasDetailApi;
  dates.textContent = s.hasDetailApi && s.rows ? `Add purchase dates (${n(s.orders)} orders)` : 'Add purchase dates';

  // A concrete estimate beats a vague "this is slow".
  if (s.orders) {
    const mins = Math.max(1, Math.round(s.orders * ((Number($('delay').value) || 600) + 300) / 60000));
    $('datesNote').innerHTML = s.hasDetailApi
      ? `Adds the date each order was placed. Reads one order at a time — <strong>about ${mins} minutes</strong> for your ${n(s.orders)} orders. Skip it unless you need spending over time.`
      : `Adds the date each order was placed. <strong>Open any one of your orders</strong>, then come back here and this turns on.`;
  }

  const lines = [...(s.log || [])];
  if (!s.running && s.rows && !s.hasDetailApi && (s.detailDiag || []).length) {
    lines.push('', 'Dates unavailable because:', ...s.detailDiag.map((d) => '  ' + d));
  }
  $('log').textContent = lines.join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}

async function refresh() {
  if (!ready) return;
  const s = await send({ cmd: 'status' });
  if (s.ok) paint(s);
}

on('run', async () => {
  await send({ cmd: 'run', opts: {
    startPage: Math.max(1, Number($('start').value) || 1),
    endPage: Math.max(0, Number($('end').value) || 0),
    delayMs: Math.max(0, Number($('delay').value) || 0),
  } });
  refresh();
});
on('dates', async () => {
  await send({ cmd: 'details', delayMs: Math.max(0, Number($('delay').value) || 0) });
  refresh();
});
on('stop', () => send({ cmd: 'cancel' }).then(refresh));
on('csv', () => send({ cmd: 'csv' }));
on('json', () => send({ cmd: 'json' }));
on('sample', () => send({ cmd: 'sample' }));

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/lazada\./i.test(tab.url || '')) {
    $('sub').textContent = 'Open Lazada to begin';
    $('phase').textContent = 'Sign in, then go to My Orders.';
    $('run').disabled = true;
    return;
  }
  tabId = tab.id;

  if (!/order/i.test(new URL(tab.url).pathname)) {
    $('sub').textContent = 'This is not your order list';
    $('phase').textContent = '';
    $('run').textContent = 'Go to My Orders';
    $('run').onclick = async () => {
      await chrome.tabs.update(tabId, { url: new URL(ORDER_PATH, tab.url).toString() });
      window.close();
    };
    return;
  }

  ready = await ensureInjected();
  if (!ready) return;
  refresh();
  setInterval(refresh, 700);
})();
