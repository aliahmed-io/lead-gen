# Google Maps Lead Scraper v2

Automated lead-generation pipeline that scrapes Google Maps for furniture and home decor stores across **Texas, Florida, and North Carolina**, visits their websites to extract email addresses, detects their e-commerce platform, and exports everything to an Excel spreadsheet.

---

## What's New in v2

- **Sleep & lid-close prevention** — blocks system sleep and ignores lid closing on Windows (using `caffeinate` or `systemd-inhibit` on macOS/Linux).
- **Query-level resumption** — tracks fully completed search queries in the database so restarted runs skip them instantly.
- **Persistent JSON database** — re-run safely without duplicating leads.
- **Up to 300 results per query** — scrolls until exhausted or limit reached.
- **Automatic breaks** every 100 results (3–5 min pause) to avoid bans.
- **Longer, randomised delays** (3–6s between results, 8–15s between queries).
- **Playwright email fallback** — renders JS-heavy sites when axios finds nothing.
- **Dynamic contact-link discovery** — follows "Contact" / "About" nav links.
- **Structured data parsing** — extracts emails from JSON-LD schema.
- **Email deobfuscation** — catches `[at]` / `(at)` / `&#64;` patterns.
- **Chain-domain skipping** — saves time by skipping retailers that never expose emails.
- **More data** — price level, open status, social links, description.
- **Graceful shutdown** (Ctrl+C) — saves database and exports partial results.
- **~120 search queries** covering major cities in TX, FL, NC.

---

## Prerequisites

- **Node.js** ≥ 18.0.0
- A stable internet connection

---

## Installation

```bash
# 1. Navigate into the project directory
cd lead-scraper

# 2. Install Node.js dependencies
npm install

# 3. Install the Chromium browser for Playwright
npx playwright install chromium
```

---

## Usage

```bash
# Run the scraper
node index.js
```

The script will:

1. Load the existing database (or create a new one).
2. Search Google Maps for each query — only new businesses are added.
3. Take a 3–5 minute break every 100 results.
4. Visit each new business's website to extract emails (axios, then Playwright fallback).
5. Export the **full database** to Excel.
6. Print a summary with email hit rate, platform, and state breakdowns.

### Re-running

Simply run `node index.js` again. The database (`leads_db.json`) prevents duplicates — only new businesses are scraped and scanned.

### Stopping safely

Press **Ctrl+C** at any time. The script will:
- Save the database
- Export whatever leads it has to Excel
- Exit cleanly

---

## Configuration

All settings are in [`config.js`](./config.js):

| Setting                       | Default       | Description                                       |
| ----------------------------- | ------------- | ------------------------------------------------- |
| `OUTPUT_FILE`                 | `"leads.xlsx"`| Path for the Excel output                         |
| `DB_FILE`                     | `"leads_db.json"` | Path for the persistent JSON database          |
| `MAX_RESULTS_PER_QUERY`       | `300`         | Max results per query (stops when feed exhausted)  |
| `CONCURRENCY`                 | `2`           | Concurrent axios requests for email scanning       |
| `PLAYWRIGHT_EMAIL_CONCURRENCY`| `2`           | Concurrent Playwright pages for fallback           |
| `HEADLESS`                    | `true`        | Set `false` to watch the browser                   |
| `USE_PLAYWRIGHT_FALLBACK`     | `true`        | Enable/disable the Playwright email fallback phase |
| `BREAK_AFTER_RESULTS`         | `100`         | Take a break after this many results               |
| `BREAK_DURATION_MIN`          | `180000`      | Minimum break (3 min in ms)                        |
| `BREAK_DURATION_MAX`          | `300000`      | Maximum break (5 min in ms)                        |
| `RESULT_DELAY_MIN`            | `3000`        | Min delay between individual results (ms)          |
| `RESULT_DELAY_MAX`            | `6000`        | Max delay between individual results (ms)          |
| `QUERY_DELAY_MIN`             | `8000`        | Min delay between search queries (ms)              |
| `QUERY_DELAY_MAX`             | `15000`       | Max delay between search queries (ms)              |
| `WEBSITE_TIMEOUT`             | `12000`       | Timeout for axios requests (ms)                    |
| `DB_AUTOSAVE_INTERVAL`        | `10`          | Auto-save database every N new records             |

### Changing search queries

Edit the `SEARCH_QUERIES` array in `config.js`:

```js
const SEARCH_QUERIES = [
  'furniture store Texas',
  'furniture store California',
  'home decor store New York',
  // Add or remove as needed...
];
```

---

## Output

### Excel file

Appears as **`leads.xlsx`** in the project root (or wherever `OUTPUT_FILE` points).

| Column         | Description                                        |
| -------------- | -------------------------------------------------- |
| Business Name  | Name from Google Maps                              |
| Email          | Extracted email(s), semicolon-separated             |
| Website        | Business website URL                               |
| Phone          | Phone number                                        |
| City           | Parsed city from address                           |
| State          | US state abbreviation                              |
| Rating         | Google Maps star rating                            |
| Reviews        | Number of Google reviews                           |
| Platform       | Shopify, WooCommerce, WordPress, or Other          |
| Category       | Google Maps business category                      |
| Price Level    | $ / $$ / $$$ / $$$$ (if available)                 |
| Social Links   | Facebook, Instagram, etc. URLs                     |
| Description    | Business description (up to 300 chars)             |
| Maps URL       | Direct link to the Google Maps listing             |
| Scraped Date   | Date of export (YYYY-MM-DD)                        |

### Database file

`leads_db.json` stores all scraped data persistently. You can:
- Back it up at any time
- Inspect it with any text editor
- Delete it to start fresh

---

## Project Structure

```
lead-scraper/
├── index.js          Main orchestrator (3-phase pipeline)
├── scraper.js        Google Maps scraping (Playwright)
├── emailFinder.js    Email extraction (axios + Playwright fallback)
├── keepAwake.js      Sleep and lid-close prevention
├── exporter.js       Excel export & summary
├── config.js         All configuration
├── db.js             JSON-file database
├── package.json      Dependencies
├── README.md         This file
├── leads_db.json     Persistent database (auto-created)
└── leads.xlsx        Excel output (auto-created)
```

---

## Anti-Ban Measures

| Measure                           | Detail                                            |
| --------------------------------- | ------------------------------------------------- |
| Random delays                     | 3–6s between results, 8–15s between queries       |
| Automatic breaks                  | 3–5 min pause every 100 results                   |
| User-agent rotation               | 5 realistic Chrome UAs, rotated per query          |
| Viewport randomisation            | 5 different screen sizes                           |
| WebDriver flag masking            | Stealth script removes automation fingerprints     |
| Image/media blocking              | Reduces bandwidth and page load time               |
| CAPTCHA detection                 | Auto-pauses 90s for manual solve                   |
| Graceful error handling           | One failed site never crashes the whole run         |

---

## Troubleshooting

### CAPTCHA

Set `HEADLESS = false` in `config.js`, re-run, and solve CAPTCHAs in the visible browser. The script pauses 90 seconds automatically.

### Low email hit rate

- Ensure `USE_PLAYWRIGHT_FALLBACK = true` (default).
- Increase `WEBSITE_TIMEOUT` for slow sites.
- Check `leads_db.json` — some businesses genuinely don't publish emails.

### Script runs too long

- Reduce `SEARCH_QUERIES` to fewer cities.
- Lower `MAX_RESULTS_PER_QUERY` (e.g., 100).
- Shorten `BREAK_DURATION_MIN` / `BREAK_DURATION_MAX`.

---

## Platform Compatibility

Tested on **Windows 10/11**, **macOS 12+**, and **Ubuntu 22.04+**.

---

## Legal Disclaimer

This tool is for **research and educational purposes only**. Ensure your use complies with Google's Terms of Service, local laws, and the privacy policies of visited websites.
#   l e a d - g e n  
 