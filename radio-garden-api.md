# Radio Garden API Research

## Overview

[Radio Garden](https://radio.garden/) is a web platform for listening to live radio stations worldwide via an interactive 3D globe. The project is **not open source**, but the community has reverse-engineered its API.

## Base URL

```
https://radio.garden/api
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ara/content/places` | GET | All locations with radio stations (~1.4MB JSON) |
| `/ara/content/page/{id}` | GET | Details for a specific place or country |
| `/ara/content/channel/{id}` | GET | Metadata for a specific radio station |
| `/ara/content/listen/{id}/channel.mp3` | GET | Stream audio (returns HTTP redirect to MP3 stream) |
| `/search?q={query}` | GET | Search countries, places, and radio stations |
| `/ara/content/static-pages/our-favorites` | GET | Staff picks / favorite stations |
| `/geo` | GET | Client geolocation information |

## Authentication

- **None required** — the API is completely public
- No API keys or headers needed

## Rate Limits

- No documented rate limits
- Region-based restrictions are **client-side only** (frontend JS, not server-enforced)

## Response Format

All data endpoints return JSON with this general structure:

```json
{
  "apiVersion": 1,
  "version": "...",
  "data": { ... }
}
```

### Places Response Example

Each place object includes:

- `id` — unique identifier
- `title` — location name
- `country` — country/region
- `url` — relative path
- `size` — station count
- `boost` — boolean flag
- `geo` — `[longitude, latitude]`

## Community Resources

- [radio-garden-openapi](https://github.com/jonasrmichel/radio-garden-openapi) — Unofficial OpenAPI spec with [interactive docs](https://jonasrmichel.github.io/radio-garden-openapi/)
- [radio-garden-go](https://github.com/jonasrmichel/radio-garden-go) — Go client library and CLI (Apache 2.0)
- [Radio-Garden-API](https://github.com/MrMirhan/Radio-Garden-API) — Reverse-engineered API documentation
- [radiogarden-wrapper](https://www.jsdelivr.com/package/npm/radiogarden-wrapper) — JavaScript wrapper (npm)
- [radio.garten](https://github.com/BttrDrgn/radio.garten) — Desktop app / game overlay (SDL2 + ImGui)

## References

- [Loading radio.garden into SQLite using jq](https://til.simonwillison.net/jq/radio-garden-jq)
- [Bypassing Region Restrictions](https://danq.me/2023/03/15/radio-garden-region-unlock/)
- [Free API to Access 90,000+ Radio Stations](https://medium.com/@herihermawan/free-api-to-access-90-000-radio-stations-worldwide-33768facc0de)
