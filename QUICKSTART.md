# Quick start

From zero to a spreadsheet of everything you have ever bought on Lazada. About five
minutes, most of which is waiting.

---

## 1. Install

The extension is not on the Chrome Web Store yet, so it installs from source. This is
normal and takes a minute.

1. Download this repository — **Code → Download ZIP** on GitHub — and unzip it somewhere
   you will not delete by accident. `~/Documents` is fine; your Downloads folder is not,
   because Chrome loads the extension from this folder every time it starts.
2. Open a new tab and go to `chrome://extensions`.
3. Turn on **Developer mode** — the toggle is in the top-right corner.
4. Click **Load unpacked** (top-left) and select the **`extension`** folder inside the
   unzipped folder. Not the outer folder — the one containing `manifest.json`.
5. You should now see *Lazada Order CSV Extractor* in the list, with a teal download icon.

**Pin it, or you will not find it again.** Click the puzzle-piece icon to the right of
Chrome's address bar, find *Lazada Order CSV Extractor*, and click the pin next to it.
The icon then sits in your toolbar. Chrome hides new extensions by default — this step is
not optional in practice.

## 2. Export your orders

1. Go to Lazada and **sign in**. The extension only ever sees what your own session sees,
   so if you are signed out it will find nothing.
2. Open **My Orders** — your account menu → *My Orders*, or
   `https://my.lazada.co.th/customer/order/index/` (swap in your country's domain).
3. Wait for your orders to appear, then click the extension icon.
4. The popup shows how many pages it found. Click **Export all orders to CSV**.

It walks every page at a polite pace — roughly two minutes for 120 pages. You can close
the popup; it keeps going. When it finishes, your browser downloads
`lazada-orders-YYYY-MM-DD.csv`.

**One row per item, not per order.** An order containing three products becomes three
rows sharing an `orderId`. That is usually what you want for analysis; group by `orderId`
to get per-order totals.

## 3. Add purchase dates — optional, and slower

Lazada's order list does not return order dates. Not "the extension misses them" — the
API returns them as empty on every single row. Dates exist only on each order's own
detail page.

So if you need dates:

1. **Click into any one of your orders.** Any order, once. This lets the extension see
   what an order-detail request looks like so it can repeat it.
2. Go back to your order list and open the popup. **Add purchase dates** is now enabled
   and shows an estimate for your order count.
3. Click it. This reads one order at a time — budget roughly ten minutes per thousand
   orders. A fresh CSV downloads when it finishes, with `purchasedAt` filled in.

**Skip this** if you only need what you bought, what it cost, and its status.
**Run it** if you need spending over time, or anything ordered by date.

Without dates you are not stuck: sorting by `orderId` ascending gives you oldest-to-newest
almost perfectly, because Lazada issues order ids in time order.

## 4. What you get

| Column | |
|---|---|
| `orderId`, `lineId` | Order, and the specific line within it |
| `title`, `variation`, `quantity`, `price` | What you bought |
| `status` | Delivered, Cancelled, Paid, Closed, … |
| `itemStatus` | Line-level state such as *Refund issued* — often more interesting than `status` |
| `shopName`, `shopId`, `sellerId` | Who you bought from |
| `orderDetailUrl`, `itemUrl`, `picUrl` | Links back to Lazada |
| `purchasedAt` | Only after step 3 |
| `raw.*`, `shop.*` | Every other field Lazada returned, untouched |

Open it in Excel, Numbers, or Google Sheets. It is UTF-8 with a BOM, so Thai text and ฿
display correctly without any import fiddling.

---

## If something goes wrong

**The popup is missing.** It is behind the puzzle-piece icon. Pin it — see step 1.

**"Add purchase dates" stays greyed out.** You have not opened an order yet, or the page
had not finished loading when you went back. Open one order, let it settle, reopen the
popup. Still stuck? Expand **Details** in the popup — it now names exactly what it saw and
what was missing.

**The count stops climbing partway.** Lazada rate-limited you. Open **Details**, raise
**Pause (ms)** to 1200, and run it again — it starts over cleanly.

**Nothing happens at all.** You are probably not on the order list page, or not signed in.
The popup says which.

**It found far fewer orders than you expected.** Check the filter tabs on Lazada's own
order page — if the page is filtered to *To Ship* or similar, the extension exports what
the page is showing. Set it to show all orders first.
