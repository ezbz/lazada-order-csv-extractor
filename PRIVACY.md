# Privacy Policy — Order History to CSV

_Last updated: 10 September 2026_

## The short version

This extension does not collect, transmit, or sell any data. Everything happens inside
your own browser, in your own logged-in Lazada session. There is no server, no analytics,
no account, and no third party.

## What it does

When you click **Export all orders to CSV**, the extension asks Lazada for your order
list — the same request the page makes when you click a page number — and writes the
result to a CSV file that your browser downloads to your computer.

The optional **Add purchase dates** step does the same thing against your order detail
pages, to recover the order date, which the order list does not include.

## What it reads

Only pages on Lazada domains (`lazada.co.th`, `.sg`, `.com.my`, `.co.id`, `.com.ph`,
`.vn`), and only your own order data returned by Lazada to your own signed-in session:
item names, variations, quantities, prices, order status, shop names, order and product
links, and — if you run the optional step — order dates.

Your exported file may contain the email address on your Lazada account, because Lazada
includes it in its own order data. That file is written to your computer and nowhere else.

## What it stores

The extension keeps two things in your browser's local extension storage:

- the most recent request/response for each Lazada endpoint it uses, so it can page
  through your history and resume after a page reload;
- your most recent export, so the results survive navigating away from the order list.

Both are local to your browser and are removed when you uninstall the extension. You can
clear them at any time from `chrome://extensions` → **Order History to CSV** →
remove and reinstall.

## What it never does

- It never sends your data anywhere. There are no network requests to any domain other
  than Lazada's own, and those are the requests Lazada's own pages already make.
- It never reads pages other than Lazada order pages.
- It never touches passwords, payment details, or your Lazada credentials.
- It contains no analytics, telemetry, tracking, or advertising code.

## Permissions, and why each is needed

| Permission | Why |
|---|---|
| `host_permissions` for Lazada domains | To read your order pages and call the same order APIs those pages call. |
| `scripting` | To attach to an already-open Lazada tab, so you do not have to reload it. |
| `storage`, `unlimitedStorage` | To hold your in-progress export locally. A large history exceeds the default quota. |

There is no `tabs` permission, no `<all_urls>`, and no background network access.

## Contact

Questions or concerns: open an issue on the GitHub repository.
