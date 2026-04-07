# Amazon Affiliate Social Publisher

A one-page web app to scrape Amazon products, generate affiliate links, shorten them, and publish posts to Instagram, Facebook, and Pinterest — all from a single dashboard.

---

## Features

- **Secure login** — single-user auth via environment variables
- **Amazon product scraper** — paste any Amazon.in product URL to extract title, image, price, and description
- **SiteStripe affiliate links** — generates affiliate links via your Amazon Associates SiteStripe API
- **Custom URL shortener** — shortens affiliate links via [url.haxcode.com](https://url.haxcode.com)
- **Auto-generated captions** — pre-fills post caption with product details, short link, and hashtags
- **Multi-platform publishing** — publish to Instagram, Facebook Page, and Pinterest in one click
- **Per-platform status** — live publish status badge for each selected platform

---

## Stack

- **Backend:** Node.js + Express
- **Frontend:** Single HTML page (vanilla JS, no build step)
- **APIs:** Amazon SiteStripe, url.haxcode.com, Instagram Graph API, Facebook Graph API, Pinterest API v5

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/erankitsrivastava/amazon-product-search
cd amazon-product-search
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

| Variable | Description |
|----------|-------------|
| `APP_USERNAME` | Login username |
| `APP_PASSWORD` | Login password |
| `SESSION_SECRET` | Random secret string for sessions |
| `AMAZON_STORE_ID` | Your Amazon Associates store ID (e.g. `kikikart-21`) |
| `AMAZON_MARKETPLACE_ID` | Marketplace ID (`44571` for amazon.in) |
| `AMAZON_COOKIES` | Full cookie string from your Amazon Associates session |
| `URL_SHORTENER_TOKEN` | Bearer token for url.haxcode.com |
| `URL_SHORTENER_BASE` | Shortener base URL (`https://url.haxcode.com`) |
| `FB_PAGE_ACCESS_TOKEN` | Facebook Page Access Token |
| `FB_INSTAGRAM_ACCOUNT_ID` | Instagram Business Account ID |
| `FB_PAGE_ID` | Facebook Page ID |
| `PINTEREST_ACCESS_TOKEN` | Pinterest OAuth access token |
| `PINTEREST_BOARD_ID` | Target Pinterest Board ID |

### 3. Start

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000) and log in.

---

## Workflow

1. **Fetch Product** — paste an Amazon.in product URL
2. **Generate Affiliate Link** — calls SiteStripe API, then shortens the URL automatically
3. **Edit Caption** — auto-generated caption ready to tweak
4. **Publish** — select Instagram, Facebook, and/or Pinterest → click Publish

---

## Social Media Setup

### Instagram & Facebook

1. Create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
2. Add the **Instagram Graph API** product to your app
3. Connect your Instagram Business Account to a Facebook Page
4. Generate a **Page Access Token** (request scopes: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`)
5. Exchange for a long-lived token (valid 60 days):
   ```
   GET https://graph.facebook.com/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app_id}
     &client_secret={app_secret}
     &fb_exchange_token={short_lived_token}
   ```
6. Get your Instagram Business Account ID:
   ```
   GET https://graph.facebook.com/me/accounts         → find your page_id
   GET https://graph.facebook.com/{page_id}?fields=instagram_business_account
   ```

### Pinterest

1. Create an app at [developers.pinterest.com](https://developers.pinterest.com)
2. Request **Standard access** for `pins:write` and `boards:read` scopes
3. Complete the OAuth flow to get an access token
4. Find your Board ID:
   ```
   GET https://api.pinterest.com/v5/boards
   Authorization: Bearer <your_token>
   ```

---

## Project Structure

```
amazon-product-search/
├── server.js          # Express backend — all API endpoints
├── public/
│   └── index.html     # Single-page UI
├── .env               # Your credentials (gitignored)
├── .env.example       # Credentials template
└── package.json
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/login` | Authenticate |
| `POST` | `/api/logout` | End session |
| `GET` | `/api/me` | Check auth status |
| `POST` | `/api/scrape` | Scrape Amazon product URL |
| `POST` | `/api/affiliate-link` | Get SiteStripe affiliate link |
| `POST` | `/api/shorten-url` | Shorten URL via url.haxcode.com |
| `POST` | `/api/publish/instagram` | Publish to Instagram |
| `POST` | `/api/publish/facebook` | Post to Facebook Page |
| `POST` | `/api/publish/pinterest` | Create Pinterest pin |
