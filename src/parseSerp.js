import { load } from 'cheerio';

const EXCLUDE = [
    '#tads',
    '#tadsb',
    '#bottomads',
    '.uEierd',
    '.related-question-pair',
    '[jsname="yEVEwb"]',
    '[jsname="Cpkphb"]',
    '.VkpGBb',
    '.rllt__details',
    '#rl_ist0',
    '#iur',
    '.commercial-unit-desktop-top',
    '.cu-container',
    '.pla-unit',
    '.sh-dgr__grid-result',
    '.RzdJxc',
    'video-voyager',
].join(', ');

/**
 * @param {unknown} value
 */
export function normalizeDomain(value) {
    let raw = String(value ?? '').trim().toLowerCase();
    if (!raw) throw new Error('Domain is required.');
    raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
    raw = raw.split('/')[0].split('?')[0].split('#')[0].replace(/\.$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) || raw.includes('..') || raw.startsWith('.') || raw.endsWith('.')) {
        throw new Error(`Domain "${value}" is not a hostname.`);
    }
    return raw;
}

/**
 * @param {string} hostname
 * @param {string} domain Normalized hostname, without www.
 */
export function domainMatches(hostname, domain) {
    const host = String(hostname).toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    const target = domain.toLowerCase().replace(/^www\./, '');
    return host === target || host.endsWith(`.${target}`);
}

/**
 * Unwrap Google's /url?q= redirect and drop Google's own search links.
 * @param {string | undefined} href
 */
export function resolveResultUrl(href) {
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return null;
    let url;
    try {
        url = new URL(href, 'http://www.google.com');
    } catch {
        return null;
    }
    const wrapped = url.searchParams.get('q') || url.searchParams.get('url');
    if ((url.pathname === '/url' || url.pathname === '/url/') && wrapped) {
        return resolveResultUrl(wrapped);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const internalPath = url.pathname.startsWith('/search')
        || url.pathname.startsWith('/url')
        || url.pathname.startsWith('/aclk')
        || url.pathname.startsWith('/maps');
    if (host.startsWith('maps.') || (isGoogleHost(host) && internalPath)) {
        return null;
    }
    url.hash = '';
    return url.toString();
}

/**
 * A normal results page mentions recaptcha in its scripts. Only the
 * traffic-interstitial title and the detected-traffic message count as a block.
 * @param {string} html
 */
export function isBlockedResponse(html) {
    const head = String(html).slice(0, 15000).toLowerCase();
    const title = (head.match(/<title>([^<]*)<\/title>/) || ['', ''])[1];
    if (title.includes('unusual traffic') || title.includes('sorry')) return true;
    return head.includes('our systems have detected unusual traffic')
        || head.includes('detected unusual traffic from your computer');
}

/**
 * @param {string} html
 */
export function isResultsPage(html) {
    return /id=["'](?:search|rso)["']/.test(String(html));
}

/**
 * Organic results in document order, plus which SERP features are on the page.
 * Position is assigned later, across pages. Features describe the page, not the domain.
 * @param {string} html
 */
export function parseSerp(html) {
    const $ = load(html);
    return {
        organic: parseOrganic($),
        features: detectFeatures($),
        hasNextPage: $('a#pnnext, a[aria-label="Next"]').length > 0,
    };
}

/**
 * 1-based organic position. Null when the domain is absent.
 * @param {{ url: string }[]} organic
 * @param {string} domain
 */
export function rankingFor(organic, domain) {
    const index = organic.findIndex((item) => {
        try {
            return domainMatches(new URL(item.url).hostname, domain);
        } catch {
            return false;
        }
    });
    if (index === -1) return { position: null, rankingUrl: null };
    return { position: index + 1, rankingUrl: organic[index].url };
}

export function emptyFeatures() {
    return {
        featuredSnippet: false,
        localPack: false,
        peopleAlsoAsk: false,
        imagePack: false,
        video: false,
        shopping: false,
        ads: false,
    };
}

/**
 * @param {import('cheerio').CheerioAPI} $
 */
function parseOrganic($) {
    const fromCite = collectCitedBlocks($);
    if (fromCite.length) return fromCite;
    return collectClassicBlocks($);
}

/**
 * Live SERP proxy pages put the visible URL in the cite. The href is an opaque
 * `/goto?url=` token, and `div.g` is absent. `.yuRUbf` is the result block.
 * @param {import('cheerio').CheerioAPI} $
 */
function collectCitedBlocks($) {
    /** @type {{ url: string }[]} */
    const organic = [];
    const seen = new Set();
    $('#rso .yuRUbf, #search .yuRUbf').each((_, el) => {
        const block = $(el);
        if (block.closest(EXCLUDE).length) return;
        if (!block.find('h3').length) return;
        const url = urlFromCite(block);
        if (!url || seen.has(url)) return;
        seen.add(url);
        organic.push({ url });
    });
    return organic;
}

/**
 * The cite reads `https://host › path › slug`. Join the pieces only when each
 * piece is a real URL path segment. A trailing `...`, or a breadcrumb label
 * such as "In the Kitchen", is not a path: the `/goto?url=` href is an opaque
 * token with no URL inside it, so the result falls back to the site origin.
 * @param {import('cheerio').Cheerio<import('cheerio').Element>} block
 */
function urlFromCite(block) {
    const cite = block.find('cite').first();
    if (!cite.length) return null;
    const parts = cite.text().replace(/\s+/g, ' ').trim().split('›').map((part) => part.trim()).filter(Boolean);
    if (!parts[0] || !/^https?:\/\//i.test(parts[0])) return null;
    let base;
    try {
        base = new URL(parts[0]);
    } catch {
        return null;
    }
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
    const origin = base.origin;
    const segments = [];
    for (const part of parts.slice(1)) {
        if (part.includes('...')) return `${origin}/`;
        const segment = part.replace(/^\/+|\/+$/g, '');
        if (!segment) continue;
        if (!isUrlPathSegment(segment)) return `${origin}/`;
        segments.push(segment);
    }
    if (!segments.length) {
        if (base.pathname && base.pathname !== '/') {
            base.hash = '';
            base.search = '';
            return base.toString();
        }
        return `${origin}/`;
    }
    return `${origin}/${segments.join('/')}`;
}

/**
 * Breadcrumb labels contain spaces or other characters a URL path cannot.
 * @param {string} segment
 */
function isUrlPathSegment(segment) {
    return /^[A-Za-z0-9._~!$&'()*+,;=:@%-]+$/.test(segment);
}

/**
 * @param {import('cheerio').CheerioAPI} $
 */
function collectClassicBlocks($) {
    const root = $('#rso').length ? $('#rso') : $('#search');
    /** @type {{ url: string }[]} */
    const organic = [];
    const seen = new Set();

    root.find('div.g').each((_, el) => {
        const block = $(el);
        if (block.parents('div.g').length) return;
        if (block.closest(EXCLUDE).length) return;
        const heading = block.find('h3').first();
        if (!heading.length) return;
        const link = heading.closest('a[href]');
        if (!link.length) return;
        const href = link.attr('href') || '';
        if (href.includes('/goto?')) return;
        const url = resolveResultUrl(href);
        if (!url || seen.has(url)) return;
        seen.add(url);
        organic.push({ url });
    });

    return organic;
}

/**
 * @param {import('cheerio').CheerioAPI} $
 */
function detectFeatures($) {
    return {
        featuredSnippet: $('.c2xzTb, .xpdopen, .hgKElc, .LGOjhe, .ifM9O').length > 0,
        localPack: $('.VkpGBb, .rllt__details, #rl_ist0, a[data-cid]').length > 0,
        peopleAlsoAsk: $('.related-question-pair, [jsname="yEVEwb"], [jsname="Cpkphb"]').length > 0
            || hasExactText($, 'span, h2, h3, [role="heading"]', 'People also ask'),
        imagePack: $('#iur, .eA0Zlc, .islrc').length > 0,
        video: $('.RzdJxc, video-voyager, [data-vid]').length > 0
            || hasExactText($, 'h2, h3, [role="heading"]', 'Videos'),
        shopping: $('.commercial-unit-desktop-top, .cu-container, .pla-unit, .sh-dgr__grid-result, .top-pla-group-inner').length > 0
            || hasExactText($, 'h2, h3, [role="heading"], span', 'Popular products'),
        ads: $('#tads a[href], #bottomads a[href], #tadsb a[href], .uEierd a[href], [data-text-ad] a[href]').length > 0
            || hasExactText($, 'span', 'Sponsored'),
    };
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} selector
 * @param {string} label
 */
function hasExactText($, selector, label) {
    const wanted = label.toLowerCase();
    return $(selector).toArray().some((el) => {
        return $(el).text().replace(/\s+/g, ' ').trim().toLowerCase() === wanted;
    });
}

/**
 * @param {string} host
 */
function isGoogleHost(host) {
    return /(^|\.)google\.[a-z.]+$/.test(host);
}
