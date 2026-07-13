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

Place data lives in my Obsidian vault as one file per trip-visit-to-a-place,
grouped into folders by trip: `atlas/cards/trips/{trip name}/{place name}.md`.
Each file has an inline frontmatter block plus a `Highlights` table for
specific spots (restaurants, viewpoints, etc.) worth flagging within that
place:

```
place_name:: kyoto, japan
lat:: 35.0116
lng:: 135.7681
trip:: japan 2024
visited:: true
date_start:: 2024-04-10
date_end:: 2024-04-12
note:: cherry blossom season

# kyoto, japan

## Highlights
| name | category | favorite | note |
|---|---|---|---|
| Nishiki Market | food | true | best matcha soft serve |
| Fushimi Inari | sight | true | go at sunrise, way less crowded |
```

A repeat visit to a place you've already been (e.g. `trips/japan 2025/kyoto,
japan.md`) is just another file — copy `lat`/`lng` from any prior visit to
that place rather than looking them up again.

The shared `vault-sync` tool's `map` job (configured in `vault-sync/sync.config.json`,
job type `place-cards`) parses each file's frontmatter into one record and its
`Highlights` table into a nested `highlights` array, then overwrites
`src/data/places.json` in this repo, coercing `lat`/`lng` to numbers, `visited`/
`favorite` to booleans, and empty cells to `null`.

**This repo does not contain a sync script.** The only contract this app relies on
is that `src/data/places.json` is an array of objects shaped like:

```json
{
  "place_name": "string",
  "lat": 0,
  "lng": 0,
  "visited": true,
  "note": "string or null",
  "date_start": "YYYY-MM-DD or null",
  "date_end": "YYYY-MM-DD or null",
  "trip": "string or null",
  "highlights": [
    { "name": "string", "category": "string or null", "favorite": true, "note": "string or null" }
  ]
}
```

### Adding a place

1. In `atlas/cards/trips/` in Obsidian, create `{trip name}/{place name}.md`
   (create the trip folder if it's a new trip).
2. Fill in the frontmatter — at least `place_name`, `lat`, `lng`. If you've
   been to this place before, copy `lat`/`lng` from that earlier visit's file
   instead of looking them up again. Leave `visited` as `false`/empty until
   you've been, and fill in `note`, `date_start`/`date_end` (same day for a
   day trip, a range for a multi-day stay), `trip` whenever you like.
3. Optionally add rows to the `Highlights` table for specific spots worth
   flagging — set `favorite` to `true` for the ones you really liked.
4. Run the `map` job in `vault-sync`. It regenerates `src/data/places.json`.
5. Commit and push — the GitHub Actions workflow rebuilds and redeploys
   automatically.

## Map behavior

- Filled rose pins = visited, light outlined pins = want-to-go.
- Click a pin to see its name, note, visit date, and any `Highlights` for that
  visit (favorites are starred).
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
