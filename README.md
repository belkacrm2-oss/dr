# DR Checker

A lightweight GitHub Pages Domain Rating checker. The static page calls a server-side Pikapuka JSON proxy, and Pikapuka calls Ahrefs with its protected API key.

## Features

- ✅ **Single domain check** — instant DR score for any domain or URL
- ✅ **Bulk check** — paste up to 1000 domains, checked with limited concurrency
- ✅ **Progress bar** — real-time progress during bulk checks
- ✅ **Export CSV** — download all results as a CSV file
- ✅ **No exposed keys** — the Ahrefs key stays on the Pikapuka server

## Usage

1. Open `index.html` in your browser (or serve it with any static file server)
2. Enter a domain (e.g. `ahrefs.com`) and click **Check DR**
3. For bulk: paste domains in the text area and click **Check All**
4. Export results as CSV

## API

Endpoint used:

```
GET https://pikapuka.com/public/dr-checker?target=<domain>
```

Expected sanitized response shape:

```json
{
  "domain": "example.com",
  "dr": 91.2,
  "ahrefs_status": "ok",
  "ahrefs_license": "Domain Rating by Ahrefs"
}
```

The browser origin allowed by the proxy is `https://belkacrm2-oss.github.io`.

## Attribution

As required by the license: **Domain Rating by [Ahrefs](https://ahrefs.com/)**

## DR Score Scale

| Range | Label |
|-------|-------|
| 60–100 | 🟢 High |
| 30–59 | 🟡 Medium |
| 0–29 | 🔴 Low |
