require('dotenv').config();

const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
}));

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ─── Auth routes ─────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.APP_USERNAME &&
    password === process.env.APP_PASSWORD
  ) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// ─── Amazon Scraper ───────────────────────────────────────────────────────────

app.post('/api/scrape', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('amazon')) {
    return res.status(400).json({ error: 'Please provide a valid Amazon product URL' });
  }

  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(html);

    const title = $('#productTitle').text().trim() ||
                  $('h1.a-size-large').first().text().trim() ||
                  $('h1').first().text().trim();

    // Try multiple image selectors
    let image = '';
    const imgSelectors = [
      '#landingImage',
      '#imgBlkFront',
      '#main-image',
      '.a-dynamic-image',
      '#imageBlock img',
    ];
    for (const sel of imgSelectors) {
      const el = $(sel).first();
      image = el.attr('src') || el.attr('data-old-hires') || el.attr('data-src') || '';
      if (image && image.startsWith('http')) break;
    }

    // Try to get high-res from data attribute
    const hiResData = $('#landingImage').attr('data-old-hires');
    if (hiResData && hiResData.startsWith('http')) image = hiResData;

    const price = $('.a-price .a-offscreen').first().text().trim() ||
                  $('#priceblock_ourprice').text().trim() ||
                  $('#priceblock_dealprice').text().trim() ||
                  $('.a-price-whole').first().text().trim() ||
                  '';

    const bulletPoints = [];
    $('#feature-bullets li span.a-list-item').each((_, el) => {
      const text = $(el).text().trim();
      if (text) bulletPoints.push(text);
    });
    const description = bulletPoints.slice(0, 4).join('\n') ||
                        $('#productDescription p').first().text().trim() ||
                        '';

    if (!title) {
      return res.status(422).json({ error: 'Could not extract product details. Amazon may have blocked the request — try again or check the URL.' });
    }

    res.json({ title, image, price, description, url });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(500).json({ error: 'Failed to scrape product: ' + err.message });
  }
});

// ─── SiteStripe Affiliate Link ────────────────────────────────────────────────

app.post('/api/affiliate-link', requireAuth, async (req, res) => {
  const { productUrl } = req.body;
  if (!productUrl) return res.status(400).json({ error: 'productUrl is required' });

  const storeId = process.env.AMAZON_STORE_ID || 'kikikart-21';
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID || '44571';
  const cookies = process.env.AMAZON_COOKIES || '';

  const siteStripeUrl = `https://www.amazon.in/associates/sitestripe/getShortUrl` +
    `?longUrl=${encodeURIComponent(productUrl)}` +
    `&marketplaceId=${marketplaceId}` +
    `&storeId=${storeId}`;

  try {
    const { data } = await axios.get(siteStripeUrl, {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.amazon.in',
      },
      timeout: 10000,
    });

    // Response is typically: { shortUrl: "https://amzn.to/XXXXX" }
    const affiliateUrl = data.shortUrl || data.url || (typeof data === 'string' ? data : null);
    if (!affiliateUrl) {
      console.error('SiteStripe response:', data);
      return res.status(502).json({ error: 'SiteStripe did not return a URL. Check AMAZON_COOKIES in .env.' });
    }

    res.json({ affiliateUrl });
  } catch (err) {
    console.error('SiteStripe error:', err.message);
    res.status(500).json({ error: 'Failed to get affiliate link: ' + err.message });
  }
});

// ─── URL Shortener ────────────────────────────────────────────────────────────

app.post('/api/shorten-url', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const token = process.env.URL_SHORTENER_TOKEN || '';
  const base = process.env.URL_SHORTENER_BASE || 'https://url.haxcode.com';

  try {
    const { data } = await axios.post(`${base}/api/url/add`, { url }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Response shape: { shortUrl, short_url, or data.url }
    const shortUrl = data.shortUrl || data.short_url || data.url ||
                     (data.data && (data.data.shortUrl || data.data.url)) || '';

    if (!shortUrl) {
      console.error('Shortener response:', data);
      return res.status(502).json({ error: 'Shortener did not return a URL', raw: data });
    }

    res.json({ shortUrl });
  } catch (err) {
    console.error('Shorten error:', err.message);
    res.status(500).json({ error: 'Failed to shorten URL: ' + err.message });
  }
});

// ─── Instagram Publishing ─────────────────────────────────────────────────────

app.post('/api/publish/instagram', requireAuth, async (req, res) => {
  const { imageUrl, caption } = req.body;
  if (!imageUrl || !caption) return res.status(400).json({ error: 'imageUrl and caption are required' });

  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const igAccountId = process.env.FB_INSTAGRAM_ACCOUNT_ID;

  if (!token || !igAccountId) {
    return res.status(503).json({
      error: 'Instagram not configured. Add FB_PAGE_ACCESS_TOKEN and FB_INSTAGRAM_ACCOUNT_ID to .env',
    });
  }

  const graphBase = 'https://graph.facebook.com/v19.0';

  try {
    // Step 1: Create media container
    const { data: containerData } = await axios.post(
      `${graphBase}/${igAccountId}/media`,
      null,
      {
        params: {
          image_url: imageUrl,
          caption,
          access_token: token,
        },
        timeout: 30000,
      }
    );

    const creationId = containerData.id;
    if (!creationId) throw new Error('No creation_id returned from Instagram');

    // Step 2: Wait for media to be ready (poll up to 30s)
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const { data: statusData } = await axios.get(`${graphBase}/${creationId}`, {
        params: { fields: 'status_code', access_token: token },
        timeout: 10000,
      });
      if (statusData.status_code === 'FINISHED') { ready = true; break; }
      if (statusData.status_code === 'ERROR') throw new Error('Instagram media processing failed');
    }

    if (!ready) throw new Error('Instagram media processing timed out');

    // Step 3: Publish
    const { data: publishData } = await axios.post(
      `${graphBase}/${igAccountId}/media_publish`,
      null,
      {
        params: { creation_id: creationId, access_token: token },
        timeout: 15000,
      }
    );

    res.json({ success: true, postId: publishData.id });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('Instagram error:', msg);
    res.status(500).json({ error: 'Instagram publish failed: ' + msg });
  }
});

// ─── Facebook Page Publishing ─────────────────────────────────────────────────

app.post('/api/publish/facebook', requireAuth, async (req, res) => {
  const { imageUrl, caption } = req.body;
  if (!imageUrl || !caption) return res.status(400).json({ error: 'imageUrl and caption are required' });

  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;

  if (!token || !pageId) {
    return res.status(503).json({
      error: 'Facebook not configured. Add FB_PAGE_ACCESS_TOKEN and FB_PAGE_ID to .env',
    });
  }

  const graphBase = 'https://graph.facebook.com/v19.0';

  try {
    const { data } = await axios.post(
      `${graphBase}/${pageId}/photos`,
      null,
      {
        params: {
          url: imageUrl,
          message: caption,
          access_token: token,
        },
        timeout: 30000,
      }
    );

    res.json({ success: true, postId: data.id, postUrl: `https://facebook.com/${data.post_id || data.id}` });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('Facebook error:', msg);
    res.status(500).json({ error: 'Facebook publish failed: ' + msg });
  }
});

// ─── Pinterest Publishing ─────────────────────────────────────────────────────

app.post('/api/publish/pinterest', requireAuth, async (req, res) => {
  const { imageUrl, title, caption, link } = req.body;
  if (!imageUrl || !title) return res.status(400).json({ error: 'imageUrl and title are required' });

  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;

  if (!token || !boardId) {
    return res.status(503).json({
      error: 'Pinterest not configured. Add PINTEREST_ACCESS_TOKEN and PINTEREST_BOARD_ID to .env',
    });
  }

  try {
    const { data } = await axios.post(
      'https://api.pinterest.com/v5/pins',
      {
        board_id: boardId,
        title: title.substring(0, 100),
        description: caption ? caption.substring(0, 500) : '',
        link: link || '',
        media_source: {
          source_type: 'image_url',
          url: imageUrl,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    res.json({ success: true, pinId: data.id, pinUrl: `https://pinterest.com/pin/${data.id}` });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('Pinterest error:', msg);
    res.status(500).json({ error: 'Pinterest publish failed: ' + msg });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Amazon Affiliate Social Publisher`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  Login with: ${process.env.APP_USERNAME || '(APP_USERNAME not set)'}\n`);
});
