# CLAUDE.md — Amazon Affiliate Social Publisher

## Project Overview

A single-page full-stack web app that scrapes Amazon.in product pages, generates affiliate links via Amazon SiteStripe, shortens them via a custom URL shortener, and publishes image posts to Instagram, Facebook, and Pinterest — all from one dashboard. Single-user, credential-based login with no database.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express (`server.js`) |
| Frontend | Single HTML file with vanilla JS — no build step (`public/index.html`) |
| Scraping | axios + cheerio (no headless browser) |
| Session | express-session (server-side, cookie-based) |
| Config | dotenv (`.env` file) |

---

## File Structure

```
amazon-product-search/
├── server.js          # Express backend — all routes and external API calls
├── public/
│   └── index.html     # Complete single-page UI (login + dashboard)
├── .env               # Credentials — gitignored, never commit
├── .env.example       # Credential template with setup instructions
├── package.json
└── CLAUDE.md          # This file
```

---

## Commands

```bash
# Install dependencies
npm install

# Start server (production)
node server.js

# Start with auto-reload (requires nodemon)
npm run dev

# Server starts at http://localhost:3000 (or $PORT)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Full instructions are in `.env.example`.

| Variable | Description |
|----------|-------------|
| `APP_USERNAME` | Login username for the dashboard |
| `APP_PASSWORD` | Login password for the dashboard |
| `SESSION_SECRET` | Random string used to sign session cookies |
| `PORT` | Server port (default: `3000`) |
| `AMAZON_STORE_ID` | Amazon Associates store ID (e.g. `kikikart-21`) |
| `AMAZON_MARKETPLACE_ID` | Marketplace ID (`44571` = amazon.in) |
| `AMAZON_COOKIES` | Full cookie string copied from your Amazon Associates session |
| `URL_SHORTENER_TOKEN` | Bearer token for url.haxcode.com |
| `URL_SHORTENER_BASE` | Shortener base URL (`https://url.haxcode.com`) |
| `FB_PAGE_ACCESS_TOKEN` | Facebook long-lived Page Access Token (valid 60 days) |
| `FB_INSTAGRAM_ACCOUNT_ID` | Instagram Business Account ID (not the username) |
| `FB_PAGE_ID` | Facebook Page ID |
| `PINTEREST_ACCESS_TOKEN` | Pinterest OAuth access token |
| `PINTEREST_BOARD_ID` | ID of the target Pinterest board |

---

## API Endpoints

All endpoints under `/api/*` except `/api/login` and `/api/me` require an active session (enforced by the `requireAuth` middleware).

### Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/login` | `{ username, password }` | `{ success: true }` or `401` |
| `POST` | `/api/logout` | — | `{ success: true }` |
| `GET` | `/api/me` | — | `{ authenticated: bool }` |

### Core workflow

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/scrape` | `{ url }` | `{ title, image, price, description, url }` |
| `POST` | `/api/affiliate-link` | `{ productUrl }` | `{ affiliateUrl }` |
| `POST` | `/api/shorten-url` | `{ url, custom? }` | `{ shortUrl }` |

### Publishing

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/publish/instagram` | `{ imageUrl, caption }` | `{ success, postId }` |
| `POST` | `/api/publish/facebook` | `{ imageUrl, caption }` | `{ success, postId, postUrl }` |
| `POST` | `/api/publish/pinterest` | `{ imageUrl, title, caption, link }` | `{ success, pinId, pinUrl }` |

---

## Key Implementation Details

### Authentication
- `requireAuth` middleware checks `req.session.authenticated === true`
- Sessions last 24 hours (`maxAge: 24 * 60 * 60 * 1000`)
- `GET /api/me` is called on page load to restore session state without re-login

### Amazon Scraper (`/api/scrape`)
Uses axios with realistic browser headers (Chrome User-Agent, `Accept-Language: en-IN`). Cheerio selectors in priority order:

- **Title:** `#productTitle` → `h1.a-size-large` → `h1`
- **Image:** `#landingImage` → `#imgBlkFront` → `#main-image` → `.a-dynamic-image` → `#imageBlock img`; upgrades to `data-old-hires` if present
- **Price:** `.a-price .a-offscreen` → `#priceblock_ourprice` → `#priceblock_dealprice` → `.a-price-whole`
- **Description:** `#feature-bullets li span.a-list-item` (up to 4 bullet points) → `#productDescription p`

Returns `422` if title cannot be extracted (Amazon may have blocked the request).

### SiteStripe Affiliate Link (`/api/affiliate-link`)
```
GET https://www.amazon.in/associates/sitestripe/getShortUrl
  ?longUrl={encodeURIComponent(productUrl)}
  &marketplaceId={AMAZON_MARKETPLACE_ID}
  &storeId={AMAZON_STORE_ID}
Headers: Cookie: {AMAZON_COOKIES}, Referer: https://www.amazon.in
```
Response shape: `{ shortUrl: "https://amzn.to/XXXXX" }`. Also checks `data.url` and string responses as fallbacks. If cookies are expired, SiteStripe returns a non-URL response → `502` error with a hint to check `AMAZON_COOKIES`.

### URL Shortener (`/api/shorten-url`)
```
POST https://url.haxcode.com/api/url/add
Authorization: Bearer {URL_SHORTENER_TOKEN}
Body: { url, custom? }
```
If no `custom` slug is provided, one is auto-generated from the last path segment of the affiliate URL (e.g. `amzn.to/AbCdEf` → slug `AbCdEf`). Response shape varies — checks `shortUrl`, `short_url`, `url`, and `data.url`/`data.shortUrl`.

### Instagram Publishing (`/api/publish/instagram`)
Three-step Facebook Graph API v19.0 flow:
1. `POST /{ig_account_id}/media` with `image_url` + `caption` → returns `creation_id`
2. Poll `GET /{creation_id}?fields=status_code` every 3s (up to 10 attempts / 30s) until `status_code === 'FINISHED'`
3. `POST /{ig_account_id}/media_publish` with `creation_id`

The `image_url` must be a publicly accessible URL — Amazon CDN product image URLs work directly.

### Facebook Publishing (`/api/publish/facebook`)
```
POST /v19.0/{page_id}/photos?url={imageUrl}&message={caption}&access_token={token}
```
Uses the same `FB_PAGE_ACCESS_TOKEN` as Instagram. Page Access Token must have `pages_manage_posts` scope.

### Pinterest Publishing (`/api/publish/pinterest`)
```
POST https://api.pinterest.com/v5/pins
Authorization: Bearer {PINTEREST_ACCESS_TOKEN}
Body: { board_id, title, description, link, media_source: { source_type: "image_url", url } }
```
Field limits enforced before sending: title truncated to 100 chars, description to 500 chars.

---

## Architecture Decisions

These decisions were made at project inception and should not be changed without good reason:

| Decision | Rationale |
|----------|-----------|
| Vanilla JS frontend (not React) | No build step — `node server.js` is all that's needed. The old React 15 codebase was replaced entirely as the new app has nothing in common with it. |
| cheerio for scraping (not Puppeteer) | Lightweight, fast, sufficient for Amazon product pages. Puppeteer adds ~300MB and complexity with no benefit for static product pages. |
| `express-session` (not JWT) | Single-user app — server-side sessions are simpler. No need for token refresh logic. |
| Single-user login via `.env` | No database required. Username/password stored in `APP_USERNAME` / `APP_PASSWORD`. Not designed for multi-user. |
| All external API calls go through Express | Avoids CORS issues, keeps all credentials server-side, and allows centralized error handling. The frontend never calls Amazon/Facebook/Pinterest directly. |
| Amazon product image URL passed directly to Instagram | Amazon CDN images (`m.media-amazon.com`) are publicly accessible URLs, which is what Instagram Graph API requires. |

---

## Development Branch

Active feature branch: `claude/affiliate-sharing-automation-hUAzF`

Always develop on this branch and push to `origin/claude/affiliate-sharing-automation-hUAzF`.
