# Stock photo library seed

The starter contents of the CMS's shared **Stock photos** library (`cms/stock.py`). On start-up the CMS imports any
photo here it hasn't imported before into `TENSHI_DATA/stock/` (and makes a 480 px preview), in the background. It's
safe on every restart: a photo an admin deleted is never brought back. Turn it off with `TENSHI_STOCK_SEED=0`.

* 1321 photos, 126.2 MB, all WebP. One folder per category.
* `manifest.json` lists every photo's licence, creator, source page, category, tags and alt text. These come from the
  collectors' own records (Img Bot's `cms-starter-images/manifest.json` and `madison-skyline/source.json`, and the photo
  scrapers' `CATALOG.csv` / `CREDITS.csv` files, the site's `data/news.json` for news photos). Nothing was made up: photos
  with no licence record were left out.
* Duplicates were removed (same file, or the same picture at another size, by perceptual hash).
* Size: Img Bot's starter images are kept as delivered (heroes up to 2400 px). The scraped collections were resized to
  at most 1600 px and compressed to about 100 KB each (some to 1280 px).
* 520 photos need a credit line (CC BY / BY-SA). The library marks them **Credit**, and the credit line is
  put in the photo's caption when it's added to a site. 801 need none (CC0, public domain, AI-generated).

| Category | Photos |
| --- | --- |
| aircraft | 160 |
| automotive | 12 |
| church | 12 |
| classifieds | 12 |
| cleaning | 12 |
| community | 12 |
| contractor | 12 |
| corporate | 12 |
| directory | 12 |
| ecommerce | 12 |
| farm-equipment | 12 |
| fitness | 12 |
| freelance | 12 |
| japan | 97 |
| landscaping | 12 |
| lawfirm | 12 |
| madison | 3 |
| medical | 12 |
| news | 71 |
| nonprofit | 12 |
| other | 12 |
| portfolio | 12 |
| realestate | 12 |
| restaurant | 12 |
| roofing | 12 |
| salon-spa | 12 |
| tech-saas | 12 |
| technology | 137 |
| tractors | 375 |
| trains | 202 |

To add more later, upload them in the library (admins), or add files and manifest entries here (each needs a unique `key`).
