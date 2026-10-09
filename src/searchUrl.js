/** Apify SDK proxy group for Google Search. Sessions are not supported on this group. */
export const SERP_PROXY_CONFIGURATION = { groups: ['GOOGLE_SERP'] };

/** One request at a time, with at least this many seconds between them. */
export const MIN_REQUEST_DELAY_SECS = 2;
export const MAX_CONCURRENCY = 1;

/** Google returns about 10 organic results per page. The `num` parameter is ignored. */
export const RESULTS_PER_PAGE = 10;

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/**
 * @param {'desktop' | 'mobile'} device
 */
export function userAgentFor(device) {
    return device === 'mobile' ? MOBILE_UA : DESKTOP_UA;
}

/**
 * HTTP URL on a www.google host. The SERP proxy rejects https and hosts without www.
 * @param {{ keyword: string, hl: string, gl: string, host: string }} target
 * @param {number} [start]
 */
export function buildSearchUrl(target, start = 0) {
    const params = new URLSearchParams({
        q: target.keyword,
        hl: target.hl,
        gl: target.gl,
        pws: '0',
        nfpr: '1',
        ie: 'UTF-8',
        oe: 'UTF-8',
    });
    if (start > 0) params.set('start', String(start));
    return `http://${target.host}/search?${params.toString()}`;
}

/**
 * Stop once the domain is found, the page is short, or the page cap is hit.
 * @param {{ organicOnPage: number, pagesFetched: number, maxPages: number, found: boolean }} state
 */
export function shouldFetchNextPage(state) {
    if (state.found) return false;
    if (state.pagesFetched >= state.maxPages) return false;
    if (state.organicOnPage === 0) return false;
    if (state.hasNextPage === false) return false;
    if (state.hasNextPage === true) return true;
    return state.organicOnPage >= RESULTS_PER_PAGE;
}
