# Shop demo (shop.html): how it works and how to go live with Shopify

The page at https://tenshisystems.com/shop.html (menu: Services > Shop demo) shows clients that Tenshi can design and
host a Shopify store. It is a headless storefront: our own HTML/CSS in the neon look, with products, cart and
checkout from Shopify.

| File | What |
|---|---|
| `shop.js` | Everything that moves: product grid, filters, quick view, cart drawer, checkout. No Shopify SDK; plain `fetch()` to the Storefront API. |
| `shop.css` | The look (linked after `sandbox/neon-pages.css` by `tools/build-pages.mjs`). |
| `data/shop-config.json` | **The switch**: `mode`, `storeDomain`, `storefrontAccessToken`, `apiVersion`, `collectionHandle`, `productCount`. |
| `data/shop-demo.json` | The 6 sample products used in demo mode (also written into shop.html at build time for search engines). |
| `img/shop/*.webp` | Sample product pictures, drawn from site art by `tools/make-shop-art.mjs` (needs Chrome). |
| `tools/build-pages.mjs` | "Shop demo (Shopify)" section builds shop.html; texts are the `shop*` / `navShop` keys in `translations.js` (English; other languages fall back to English). |

## Demo mode (today)
`"mode": "demo"`. Products come from `data/shop-demo.json`; the cart is kept in the visitor's browser
(localStorage `tse-shop-cart-demo`); Checkout shows "Demo store: checkout is disabled." Nothing talks to Shopify.

## Live mode
`shop.js` then:
1. reads products from `https://<storeDomain>/api/<apiVersion>/graphql.json` (Storefront API, `products` query, or the
   products of `collectionHandle` if set), sending `X-Shopify-Storefront-Access-Token` when a token is set;
2. keeps the cart in the visitor's browser (localStorage `tse-shop-cart-<storeDomain>`, variant IDs + quantities);
3. on Checkout, calls the Cart API (`cartCreate` with the lines) and sends the buyer to the returned `checkoutUrl`,
   Shopify's own hosted checkout (payments, taxes, shipping, order emails all stay in Shopify).
If the store can't be reached it falls back to the demo products (warning in the browser console).

Tested 2026-11-25 against Shopify's public Hydrogen demo store (`hydrogen-preview.myshopify.com`, API 2026-10):
products render and `cartCreate` returns a checkout URL.

### Switch to live
1. In the store's Shopify admin: install the free **Headless** sales channel (Shopify App Store) > **Create storefront**.
2. Headless > the storefront > **Storefront API permissions** > Edit: tick at least
   `unauthenticated_read_product_listings` (products, collections) and `unauthenticated_write_checkouts` +
   `unauthenticated_read_checkouts` (Cart API). Optional: `unauthenticated_read_product_inventory`,
   `unauthenticated_read_product_tags`.
3. Copy the **Public access token** (NOT the private token, NOT an Admin API token: those are secrets and must never be
   in this repo or the browser).
4. Products > select the products > **Include in sales channels > Headless** (products not published to the channel
   don't show). Optional: make a collection and put its handle in `collectionHandle`.
5. Edit `data/shop-config.json`:
   ```json
   { "mode": "live", "storeDomain": "your-store.myshopify.com", "storefrontAccessToken": "<public token>",
     "apiVersion": "2026-10", "collectionHandle": "", "productCount": 12 }
   ```
6. `node tools/build-pages.mjs && node tools/stamp-assets.mjs`, commit to `tenshi-cms`, push; check the page.
7. If the server's Content-Security-Policy is enforced later, allow `connect-src https://*.myshopify.com` and
   `img-src https://cdn.shopify.com` (it is report-only today).

Notes:
- Dev stores (free, from the Shopify Dev Dashboard / Partner account) work for testing, but they are always password
  protected: the password page also stands in front of checkout, and only test orders are possible. A real store needs
  a paid Shopify plan.
- Prices and currency come from Shopify in live mode. Shopify "Title / Default Title" options are hidden.
- To change the sample products, edit `data/shop-demo.json` (and `tools/make-shop-art.mjs` for pictures), then rebuild.
