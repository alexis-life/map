# map.alexischao.com

A personal travel map — pins for places I've been and places I want to go.
Part of the `alexischao.com` family of subdomains (`cysa`, `data`, `budget`, `map`),
sharing a design system and a common data-pipeline pattern.

## Stack

- Vite + React
- `react-leaflet` + `leaflet` for the map, tiles from CARTO Positron (no API key)
- Static data: `src/data/places.json`, read at build time — no backend
- Shared theme loaded from `https://alexischao.com/theme.css` (not bundled locally)

## Data pipeline

Place data lives as a markdown table in my Obsidian vault (`Places.md`):

```
| place_name | lat | lng | visited | note | date_visited | trip |
|---|---|---|---|---|---|---|
| Kyoto, Japan | 35.0116 | 135.7681 | true | Cherry blossom season | 2024-04-10 | Japan 2024 |
```

The shared `vault-sync` tool's `map` job (configured in `vault-sync/sync.config.json`)
parses that table and overwrites `src/data/places.json` in this repo, coercing
`lat`/`lng` to numbers, `visited` to a boolean, and empty cells to `null`.

**This repo does not contain a sync script.** The only contract this app relies on
is that `src/data/places.json` is an array of objects shaped like:

```json
{
  "place_name": "string",
  "lat": 0,
  "lng": 0,
  "visited": true,
  "note": "string or null",
  "date_visited": "YYYY-MM-DD or null",
  "trip": "string or null"
}
```

### Adding a place

1. Open `Places.md` in Obsidian.
2. Add a new row to the table with at least `place_name`, `lat`, `lng`. Leave
   `visited` as `false`/empty until you've been, and fill in `note`,
   `date_visited`, `trip` whenever you like.
3. Run the `map` job in `vault-sync`. It regenerates `src/data/places.json`.
4. Commit and push — the GitHub Actions workflow rebuilds and redeploys
   automatically.

## Map behavior

- Filled rose pins = visited, light outlined pins = want-to-go.
- Click a pin to see its name, note, and visit date.
- If a place belongs to a `trip`, its popup has a "Part of: {trip}" button —
  clicking it highlights every pin in that trip (glow + dim the rest). Click
  it again, or click the map background, to clear the highlight.
- Route lines connecting pins in the same trip are a planned v2 — the data
  model (`trip` field) is already shaped to support it.

## Deploy

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
Vite app and publishes `dist/` to GitHub Pages via the official Pages actions.
The custom domain is set via the `public/CNAME` file plus a Cloudflare CNAME
record pointing `map.alexischao.com` at `alexis-life.github.io`.

## Local development

```bash
npm install
npm run dev
```
