# DR Checker

A lightweight Domain Rating checker using the [Ahrefs free public API](https://docs.ahrefs.com/en/api/reference/public/get-domain-rating-free).

## Features

- ✅ **Single domain check** — instant DR score for any domain or URL
- ✅ **Bulk check** — paste up to 50 domains (one per line), checked sequentially
- ✅ **Progress bar** — real-time progress during bulk checks
- ✅ **Export CSV** — download all results as a CSV file
- ✅ **Dark / Light mode** — auto-detects system preference, manual toggle
- ✅ **No API key required** — uses Ahrefs free public endpoint

## Usage

1. Open `index.html` in your browser (or serve it with any static file server)
2. Enter a domain (e.g. `ahrefs.com`) and click **Check DR**
3. For bulk: paste domains in the text area and click **Check All**
4. Export results as CSV

## API

Endpoint used:

```
GET https://ahrefs.com/v3/public/domain-rating-free?target=<domain>&output=json
```

No API key required. Free to use under the [Domain Rating License](http://ahrefs.com/legal/domain-rating-license).

## Attribution

As required by the license: **Domain Rating by [Ahrefs](https://ahrefs.com/)**

## DR Score Scale

| Range | Label |
|-------|-------|
| 60–100 | 🟢 High |
| 30–59 | 🟡 Medium |
| 0–29 | 🔴 Low |
