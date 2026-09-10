# Chrome Web Store listing — copy & answers

Paste these into the Developer Dashboard. Everything here is factual; do not
embellish it, because reviewers check claims against the code.

## Name (45 char max)
Lazada Order CSV Extractor

## Short description (132 char max)
Export your Lazada order history to a CSV file. Every item, price, status and shop.
Runs locally — your data never leaves the browser.

## Detailed description

Lazada gives you no way to export your purchase history. If you want it in a
spreadsheet, you are left paging through your order list by hand.

This extension does it for you. Open My Orders, click once, and get a CSV of every
item you have ever bought.

What you get, one row per item:
• Item title, variation, quantity and price
• Order status, plus line-level states such as "Refund issued"
• Shop name and seller
• Links back to the order and the product
• Every other field Lazada returns, kept as extra columns

Optionally, a second pass adds the date each order was placed. Lazada's order list
does not include dates, so this reads each order individually — slower, and entirely
up to you whether to run it.

The file is UTF-8 with a BOM, so Thai text and ฿ open correctly in Excel, Numbers and
Google Sheets.

Privacy: there is no server, no account, no analytics. The extension only talks to
Lazada, using your existing signed-in session, and writes the CSV to your computer.
Nothing is transmitted anywhere else. Source code is public.

Not affiliated with, endorsed by, or connected to Lazada.

## Category
Workflow & Planning

## Single purpose (required field)
Export the signed-in user's own Lazada order history to a CSV file.

## Permission justifications

host_permissions (Lazada domains):
Required to read the user's order list page and to call the same order APIs that
Lazada's own page calls. Limited to the six Lazada country domains; no other sites.

scripting:
Required to attach the extension to a Lazada tab that is already open, so the user
does not have to reload the page before exporting.

storage / unlimitedStorage:
Required to hold the in-progress export locally so it survives page navigation and
reloads. A large order history exceeds the default storage quota.

## Data usage disclosures
• Does the extension collect user data? Yes — it reads the user's own order data in
  order to write it to their own file.
• Is data transmitted off-device? No.
• Is data sold to third parties? No.
• Is data used for purposes unrelated to the single purpose? No.
• Is data used to determine creditworthiness or for lending? No.
Certify all three compliance checkboxes.

## Privacy policy URL
https://github.com/<user>/<repo>/blob/main/PRIVACY.md

## Still needed before submitting
- [ ] Screenshots: 1280×800 or 640×400, at least one. Take them yourself — the popup
      mid-export, and a slice of the resulting CSV.
- [ ] A $5 one-time Chrome Web Store developer registration fee.
- [ ] Public privacy policy URL (works once the repo is public).
