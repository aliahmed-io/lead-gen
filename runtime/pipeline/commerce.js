'use strict';

const { allowed } = require('./robots');

const FURNITURE_TERMS = /\b(?:furniture|furnishings?|sofas?|couch(?:es)?|sectionals?|loveseats?|chairs?|armchairs?|recliners?|ottomans?|stools?|benches|bench|tables?|desks?|beds?|headboards?|nightstands?|dressers?|chest of drawers|storage chests?|cabinets?|bookcases?|shelv(?:es|ing)|shelf|sideboards?|buffets?|credenzas?|console tables?|wardrobes?|armoires?|mattress(?:es)?|lamps?|lighting|chandeliers?|pendant lights?|pendant lamps?|sconces?|rugs?|mirrors?|vases?|home decor|wall decor|cushions?|pillows?|throws?|curtains?|wall art|futons?|daybeds?|outdoor seating)\b/i;
const OFF_TOPIC = /\b(?:necklaces?|earrings?|bracelets?|jewell?ery|gemstones?|watches?|playstation|xbox|nintendo|game consoles?|tennis|tabletop games?|table saws?|tablet|smartphones?|laptops?|computer memory|dress shirts?|t-shirts?|perfume|lipstick)\b/i;
const COMMERCE_PLATFORMS = new Set(['Shopify', 'WooCommerce', 'BigCommerce', 'Magento', 'PrestaShop', 'OpenCart', 'Ecwid']);
const HOSTED_STORE_PLATFORMS = new Set(['Shopify', 'BigCommerce', 'Ecwid', 'Wix Stores', 'Squarespace Commerce']);

function detectPlatforms(html = '', headers = {}) {
  const found = [];
  const generator = (html.match(/<meta[^>]+name=["']generator["'][^>]*>/i) || [''])[0];
  if (/cdn\.shopify\.com|Shopify\.(?:shop|theme)|myshopify\.com/i.test(html) || headers['x-shopid'] || headers['x-shopify-stage']) found.push('Shopify');
  if (/\/wp-content\/plugins\/woocommerce|class=["'][^"']*\bwoocommerce\b|wc-add-to-cart|woocommerce_params/i.test(html)) found.push('WooCommerce');
  if (/cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-/i.test(html)) found.push('BigCommerce');
  if (/data-mage-init|Mage\.Cookies|Magento_[A-Z]|\/static\/version\d+\/frontend\//i.test(html) || /magento/i.test(generator)) found.push('Magento');
  if (/prestashop/i.test(generator) || /\/modules\/ps_/i.test(html)) found.push('PrestaShop');
  if (/catalog\/view\/theme\//i.test(html)) found.push('OpenCart');
  if (/app\.ecwid\.com|ecwid-productbrowser/i.test(html)) found.push('Ecwid');
  if (/wixstores|wix-stores|\/product-page\//i.test(html)) found.push('Wix Stores');
  else if (/static\.parastorage\.com|wix\.com website builder/i.test(html)) found.push('Wix');
  if (/static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/i.test(html)) found.push(/sqs-add-to-cart|data-commerce|sqs-money-native/i.test(html) ? 'Squarespace Commerce' : 'Squarespace');
  return [...new Set(found)];
}

function productFurnitureShare(products) {
  if (!products.length) return 0;
  const hits = products.filter(p => {
    const text = [p.title, p.type, p.tags, p.category].filter(Boolean).join(' ');
    return !OFF_TOPIC.test([p.title, p.type, p.category].join(' ')) && FURNITURE_TERMS.test(text);
  }).length;
  return hits / products.length;
}

async function getJson(url, ctx) {
  if (!allowed(ctx.robots, url)) return { skipped: 'robots-disallowed' };
  await ctx.pace();
  try {
    const response = await ctx.fetchPage(url, { signal: ctx.signal, timeoutMs: 15000, maxBytes: 4 * 1024 * 1024 });
    if (response.url && new URL(response.url).origin !== new URL(url).origin) return { skipped: 'cross-origin-resource-redirect' };
    if (response.status < 200 || response.status >= 300) return { status: response.status };
    try { return { status: response.status, json: JSON.parse(response.text), headers: response.headers }; } catch { return { status: response.status, notJson: true }; }
  } catch (error) { return { error: error.kind || 'error' }; }
}

async function shopifyCatalog(origin, ctx) {
  const r = await getJson(new URL('/products.json?limit=250', origin).href, ctx);
  if (!Array.isArray(r.json?.products)) return null;
  const products = r.json.products.slice(0, 250).map(p => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const purchasable = variants.some(v => v.available === true && Number(v.price) > 0);
    const availabilityKnown = variants.length > 0 && variants.every(v => typeof v.available === 'boolean');
    return { title: String(p.title || ''), type: String(p.product_type || ''), tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''), price: Number(variants.map(v => Number(v.price)).find(n => n > 0) || 0), purchasable: purchasable ? true : availabilityKnown ? false : null };
  });
  return { source: 'shopify-products-json', count: products.length, countIsLowerBound: products.length >= 250, priced: products.filter(p => p.price > 0).length, products };
}

async function wooCatalog(origin, ctx) {
  const r = await getJson(new URL('/wp-json/wc/store/v1/products?per_page=100', origin).href, ctx);
  if (!Array.isArray(r.json)) return null;
  const products = r.json.slice(0, 100).map(p => ({ title: String(p.name || ''), type: '', tags: '', category: (p.categories || []).map(c => c.name).join(' '), price: Number(p.prices?.price || 0), purchasable: typeof p.is_purchasable === 'boolean' ? p.is_purchasable && (p.is_in_stock !== false || p.backorders_allowed === true) : null }));
  const total = Number(r.headers?.['x-wp-total']) || products.length;
  return { source: 'woocommerce-store-api', count: total, countIsLowerBound: false, priced: products.filter(p => p.price > 0).length, products };
}

async function sitemapProductCount(origin, robots, ctx) {
  const sameOrigin = raw => { try { return new URL(raw).origin === new URL(origin).origin; } catch { return false; } };
  const roots = [...(robots.sitemaps || []).filter(sameOrigin), new URL('/sitemap.xml', origin).href].slice(0, 3);
  let count = 0;
  const seen = new Set();
  const visit = async (url, depth) => {
    if (!sameOrigin(url) || seen.has(url) || seen.size >= 5 || !allowed(robots, url)) return;
    seen.add(url);
    await ctx.pace();
    let response;
    try { response = await ctx.fetchPage(url, { signal: ctx.signal, timeoutMs: 15000, maxBytes: 4 * 1024 * 1024 }); } catch { return; }
    if (response.status < 200 || response.status >= 300) return;
    if (response.url && !sameOrigin(response.url)) return;
    const locs = [...response.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]);
    if (/<sitemapindex/i.test(response.text) && depth < 1) { for (const loc of locs.filter(l => /product/i.test(l)).slice(0, 2)) await visit(loc, depth + 1); return; }
    count += locs.filter(l => /\/(?:products?|shop|item|p)\//i.test(l)).length;
  };
  for (const root of roots) { await visit(root, 0); if (count) break; }
  return count;
}

// Decides ecommerce / furniture-decor from active evidence, not from a platform label alone.
async function assessCommerce({ origin, html, headers, crawl, robots, fetchPage, signal }) {
  let last = 0;
  const ctx = { robots, fetchPage, signal, pace: async () => { const wait = Math.max(0, (robots.delay || 800) - (Date.now() - last)); if (wait) await new Promise(r => setTimeout(r, Math.min(wait, 10000))); last = Date.now(); } };
  const platforms = [...new Set([...detectPlatforms(html, headers), ...(crawl?.platforms || [])])];
  const evidence = [];
  let catalog = null;
  if (platforms.includes('Shopify')) catalog = await shopifyCatalog(origin, ctx);
  if (!catalog && platforms.includes('WooCommerce')) catalog = await wooCatalog(origin, ctx);
  if (!catalog && !platforms.length) catalog = await shopifyCatalog(origin, ctx) || await wooCatalog(origin, ctx);
  const commerce = crawl?.commerce || [];
  const purchase = commerce.some(c => c.kind === 'purchase-control');
  const cart = commerce.some(c => c.kind === 'cart-route');
  const offer = commerce.some(c => c.kind === 'product-offer');
  const platformCommerce = platforms.some(p => COMMERCE_PLATFORMS.has(p) || /Commerce|Stores/.test(p));
  let sitemapProducts = 0;
  if (!catalog || catalog.count < 3) sitemapProducts = await sitemapProductCount(origin, robots, ctx);
  if (catalog) evidence.push(catalog.source + ': ' + catalog.count + (catalog.countIsLowerBound ? '+' : '') + ' products, ' + catalog.priced + ' priced');
  if (purchase) evidence.push('add-to-cart/buy control on a crawled page');
  if (cart) evidence.push('cart or checkout route linked');
  if (offer) evidence.push('Product structured data with an offer');
  if (sitemapProducts) evidence.push('sitemap lists ' + sitemapProducts + ' product URLs');
  const purchasable = catalog ? catalog.products.filter(p => p.purchasable === true).length : 0;
  const explicitlyUnavailable = catalog ? catalog.products.filter(p => p.purchasable === false).length : 0;
  const availabilityUnknown = catalog ? catalog.products.filter(p => p.purchasable === null).length : 0;
  if (catalog) evidence.push('Catalogue sample: ' + purchasable + ' explicitly purchasable; ' + explicitlyUnavailable + ' unavailable; ' + availabilityUnknown + ' availability unknown');
  const hostedStorePlatform = platforms.some(p => HOSTED_STORE_PLATFORMS.has(p));
  const platformWithStoreSignal = platformCommerce && (cart || sitemapProducts > 0 || Boolean(catalog && catalog.count > 0));
  let ecommerce = 'none';
  if (catalog && catalog.priced >= 3 && purchasable > 0 && (platformCommerce || purchase || cart)) ecommerce = 'confirmed';
  else if (purchase || offer && cart || platformCommerce && sitemapProducts >= 10 || catalog && catalog.priced >= 3 || hostedStorePlatform || platformWithStoreSignal) ecommerce = 'likely';
  else if (catalog && catalog.count > 0 || sitemapProducts > 0 || offer) ecommerce = 'catalog-only';
  if (hostedStorePlatform && ecommerce === 'likely') evidence.push('Hosted store platform detected: ' + platforms.filter(p => HOSTED_STORE_PLATFORMS.has(p)).join(', '));
  else if (platformWithStoreSignal && ecommerce === 'likely') evidence.push('Commerce platform detected with cart, catalogue or product sitemap evidence');
  const share = catalog ? productFurnitureShare(catalog.products) : 0;
  let niche = 'none';
  if (catalog && catalog.products.length >= 3 && share >= 0.35) niche = 'confirmed';
  else if (catalog && catalog.products.length >= 3 && share === 0) niche = 'off-topic';
  else if ((crawl?.niche || []).length || share >= 0.15) niche = 'likely';
  return {
    ecommerce, niche, platforms, evidence, productFurnitureShare: Number(share.toFixed(2)), catalogSource: catalog?.source || null,
    productCount: catalog ? catalog.count : sitemapProducts || 0, productCountIsLowerBound: catalog ? Boolean(catalog.countIsLowerBound) : sitemapProducts > 0,
    purchasableProductsInSample: purchasable, explicitlyUnavailableProductsInSample: explicitlyUnavailable, availabilityUnknownProductsInSample: availabilityUnknown,
    inventoryStatus: purchasable ? 'purchasable-products-published' : explicitlyUnavailable && !availabilityUnknown ? 'sample-unavailable' : 'not-established',
    purchasingFlowTested: false, productSampleSize: catalog?.products.length || 0,
    sampleProducts: (catalog?.products || []).slice(0, 5).map(p => p.title), nicheTerms: [...new Set((crawl?.niche || []).flatMap(n => n.terms || []))].slice(0, 10),
  };
}

module.exports = { assessCommerce, detectPlatforms, productFurnitureShare, FURNITURE_TERMS };
