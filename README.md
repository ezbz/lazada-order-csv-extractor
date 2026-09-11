# Order History to CSV

Lazada has no export. This gets your entire purchase history into a CSV — every item,
price, status and shop — instead of clicking through a hundred-plus pages by hand.

Runs entirely in your own signed-in browser session. No server, no account, no analytics;
nothing leaves the tab. [Privacy policy](PRIVACY.md) · [MIT licensed](LICENSE)

**→ [Quick start guide](QUICKSTART.md)** — install and first export, about five minutes.

Not affiliated with, endorsed by, or connected to Lazada.

## Use the extension

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick `extension/`.
2. Pin it: puzzle-piece icon in the toolbar → pin **Order History to CSV**.
3. Open Lazada → **My Orders** → click the icon.

### Step 1 — Export all orders to CSV

Every item you have ordered: title, variation, quantity, price, status, shop, links.
About two minutes for ~120 pages. This is the whole job for most people.

It does **not** include order dates. That is not an omission — Lazada's list API returns
`createdAt` as `null` on every row (verified across all 2,721 rows of a real export).

### Step 2 — Fetch purchase dates *(optional)*

Adds `purchasedAt`, plus totals and payment method where the detail response carries them.
Dates exist only on the order detail page, so this costs **one request per order** — roughly
10 minutes per 1,000 orders, against ~2 minutes for step 1.

It needs one sample of a detail request to replay, so **open any single order once**; the
button then enables and shows an estimate for your order count. Measured on a real account:
**100% of orders dated.**

**Skip step 2 if** you only need what you bought, what it cost, or its current status.
**Run it if** you need spending over time, or anything ordered chronologically by date.
Without it, sort by `orderId` ascending — it is a near-perfect chronological proxy
(see *Ordering without dates*).

## Console alternative

`console/lazada-orders.js` does the same list export with no install: paste it into DevTools on
the order list page (type `allow pasting` first if Chrome blocks it). Verified on a real account:
**2,721 item rows across 1,224 orders, 123 pages, in about two minutes.** It has no date pass —
use the extension for that.

`console/diagnose.js` is the troubleshooting tool — it reports page structure, pager behaviour,
and records the order API, printing key *names* and counts rather than order contents.

## How it works

Lazada's order list is client-rendered, so fetching `?page=N` as HTML returns an empty shell.
The real source is:

    POST /customer/api/async/order-list        (Alibaba Ultron async protocol)

The extension records one genuine request, finds the page field by **deep** search — it sits at
`lifecycle.pageNum`, nested inside the POST body, where a top-level scan misses it — and replays
that request per page with only that field changed. `module.lifecycle.totalPageNum` gives the
true page count. If no request can be recorded, it falls back to reading the rendered DOM.

### Response shape

`module.data` is a flat entity map, not an array:

    module.lifecycle                  pageNum, pageSize, totalPageNum
    module.data.orderItem_<lineId>    title, sku.skuText, quantity, price, itemUrl, orderDetailUrl
    module.data.order_<orderId>       tradeOrderId, sequence
    module.data.orderShop_<...>       name, shopId, status, tradeOrderLineIds

One CSV row per order item. Shop data joins to items via the shop's **`tradeOrderLineIds`**, not
`tradeOrderId` — item and shop entities carry different ids in this payload, so joining on order
id silently mismatches shop names. Each row records how it joined in `_shopMatch`
(`lineId` / `orderId` / `none`); the real export came back 100% `lineId`.

### Two field traps

- **`delivery.status` is a colour token** (`success`, `info`), not a status. The human-readable
  status is `orderShop.*.status` (Delivered, Cancelled, Paid, Closed, Partially Delivered…).
- **`status` on the item** is a separate, sparser field carrying line-level states like
  *Refund issued* / *Refund completed*. It is exported as `itemStatus`.

### Dates

The list endpoint returns **no dates**. `createdAt`, `paidAt`, `paymentDes` and `orderDetailPrice`
exist as schema keys but are empty on every row — verified across all 2,615 rows of a real export.
Dates live only on the order detail page, which is client-rendered like the list, so fetching its
HTML gets you a shell.

So the detail pass uses the same record-and-replay trick, one level down:

1. You open any single order. The extension records that page's order-detail request.
2. It locates the order id inside that request by **value** — searching the body for a leaf equal
   to an id it already has — so it works without knowing the endpoint's schema.
3. It replays the request once per order with that leaf swapped, and harvests any value under a
   date-like key (`gmtCreate`, `createTime`, `payTime`, …) wherever it sits in the response.

That is one request per order (~1,200 here, a few minutes). It gives up after 8 consecutive
responses with no dates rather than grinding through a thousand failing requests. Adds
`purchasedAt`, `paidAt`, and fills `orderTotal` / `paymentMethod` where the detail response has
them. Your list export is untouched either way.

**Why one manual click:** the recorder only sees requests made in a tab it is attached to. The
extension could open a detail tab itself, but that needs background tab orchestration that fails
in more ways than it fixes — one click is the honest trade.

### Ordering without dates

If you skip the detail pass, `orderId` is still a usable chronological proxy: on a real export,
Spearman correlation between page position and mean order id was **−0.9998** across 123 pages
(ids also widen 15→16 digits partway through, cleanly). Sorting by `orderId` ascending gives
oldest-to-newest. It gives you sequence, not calendar dates.

## Repairing an older export

`tools/clean-export.py` fixes a CSV exported before the status mapping was corrected, without
re-scraping — the right value is already in the `shop.status` passthrough column:

    python3 tools/clean-export.py output/lazada-orders-*.csv

It rewrites `status`, adds `itemStatus`, and drops always-empty columns.

## Columns

One row per order **item**. An order with three products is three rows sharing an `orderId`.

| Column | |
|---|---|
| `orderId`, `lineId` | Order, and the specific line within it |
| `purchasedAt`, `paidAt` | Detail pass only. Run `tools/fix-dates.py` to get sortable ISO timestamps |
| `title`, `variation`, `quantity`, `price` | The item, and its **list price** |
| `status` | Delivered, Cancelled, Paid, Closed, … |
| `itemStatus`, `refunded` | Line-level state (*Refund issued*, *Refund completed*) and a yes/blank flag |
| `orderTotal` | Detail pass only. What was actually **charged** |
| `subtotal`, `shippingFee`, `discount`, `refundAmount` | The checkout breakdown behind that total |
| `charges` | Every breakdown line verbatim, `Label=Value` separated by `\|` |
| `shopName`, `shopId`, `sellerId` | Who you bought from |
| `orderDetailUrl`, `itemUrl`, `picUrl` | Links back to Lazada |
| `raw.*`, `shop.*` | Every other field Lazada returned |

### Item prices are not what you paid

`price` is the line's list price. The amount charged differs — shipping is added and
vouchers deducted at checkout. On a real account the gap was a median of ฿50 and as much
as ฿288 per order, and **summed line prices matched the charged total on none of them**.

For anything money-related, use `orderTotal` and the breakdown columns, not `sum(price)`.
Those come from the detail pass; without it you have list prices only.

### Refunds

Lazada refunds to the Lazada Wallet, so a refunded order still looks like spend unless you
account for it. Two columns carry this: `refunded` flags lines whose status is a refund
state, and `refundAmount` holds the amount when the order's breakdown lists one. Net spend
is `orderTotal - refundAmount`; the extractor does not compute it for you, because a
partial refund on a multi-item order cannot be split across lines reliably.

## Notes

- Requests are throttled (600 ms + jitter). 124 pages takes roughly two minutes.
- The extension needs no tab reload: the popup injects its scripts on demand via
  `chrome.scripting`. Only the *content-script-at-page-load* path needs a reload, and it is not
  relied on.
- If an export comes back empty, run `console/diagnose.js` and check `step4_fetch.verdict` and
  the `lzxReport()` output.
