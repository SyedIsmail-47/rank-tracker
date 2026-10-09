import { Actor } from 'apify';
import { CheerioCrawler, log } from 'crawlee';

import { emptyFeatures, isBlockedResponse, isResultsPage, parseSerp, rankingFor } from './parseSerp.js';
import {
    MAX_CONCURRENCY,
    MIN_REQUEST_DELAY_SECS,
    RESULTS_PER_PAGE,
    SERP_PROXY_CONFIGURATION,
    buildSearchUrl,
    shouldFetchNextPage,
    userAgentFor,
} from './searchUrl.js';

export const KEYWORD_CHECKED_EVENT = 'keyword-checked';

/**
 * Fetch each keyword through the Google SERP proxy and save one position record.
 * @param {ReturnType<import('./input.js').normalizeInput>} input
 */
export async function runRankCheck(input) {
    const proxyConfiguration = await Actor.createProxyConfiguration(SERP_PROXY_CONFIGURATION);
    const jobs = new Map(input.keywords.map((keyword, index) => {
        const jobId = String(index);
        return [jobId, {
            ...keyword,
            jobId,
            organic: [],
            features: null,
            pagesFetched: 0,
            pushed: false,
        }];
    }));

    let lastRequestAt = 0;
    const crawler = new CheerioCrawler({
        proxyConfiguration,
        // This proxy group rejects a session id in the username.
        useSessionPool: false,
        maxConcurrency: MAX_CONCURRENCY,
        sameDomainDelaySecs: MIN_REQUEST_DELAY_SECS,
        maxRequestRetries: 2,
        navigationTimeoutSecs: 60,
        requestHandlerTimeoutSecs: 60,
        preNavigationHooks: [
            async ({ request }, gotOptions) => {
                const waitMs = lastRequestAt + MIN_REQUEST_DELAY_SECS * 1000 - Date.now();
                if (waitMs > 0) await sleep(waitMs);
                lastRequestAt = Date.now();
                const headers = { ...gotOptions.headers };
                headers['user-agent'] = userAgentFor(request.userData.device);
                headers['accept-language'] = 'en-US,en;q=0.9';
                gotOptions.headers = headers;
            },
        ],
        async requestHandler({ request, body, crawler: activeCrawler }) {
            const job = jobs.get(request.userData.jobId);
            const html = toHtml(body);
            if (isBlockedResponse(html) || !isResultsPage(html)) {
                throw new Error(`Google did not return a results page for "${job.keyword}".`);
            }

            const parsed = parseSerp(html);
            if (request.userData.start === 0) job.features = parsed.features;
            job.organic.push(...newOrganic(job.organic, parsed.organic));
            job.pagesFetched += 1;

            const ranking = rankingFor(job.organic, job.domain);
            log.info(`"${job.keyword}" page ${job.pagesFetched}: ${parsed.organic.length} organic results`);

            if (shouldFetchNextPage({
                organicOnPage: parsed.organic.length,
                pagesFetched: job.pagesFetched,
                maxPages: input.maxPages,
                found: ranking.position !== null,
                hasNextPage: parsed.hasNextPage,
            })) {
                await activeCrawler.addRequests([
                    pageRequest(job, job.pagesFetched * RESULTS_PER_PAGE),
                ]);
                return;
            }
            await pushJob(job);
        },
        async failedRequestHandler({ request, error }) {
            const job = jobs.get(request.userData.jobId);
            log.error(`SERP request failed for "${job?.keyword ?? request.url}": ${redact(error?.message ?? 'unknown error')}`);
            if (!job || job.pushed) return;
            if (job.pagesFetched === 0) {
                log.error(`No results page was parsed for "${job.keyword}". That keyword was not saved.`);
                return;
            }
            await pushJob(job);
        },
    });

    log.info(`Checking ${jobs.size} keyword${jobs.size === 1 ? '' : 's'} through the GOOGLE_SERP proxy`);
    await crawler.run([...jobs.values()].map((job) => pageRequest(job, 0)));

    const saved = [...jobs.values()].filter((job) => job.pushed).length;
    log.info(`Summary: ${saved} keywords saved, ${jobs.size - saved} not saved.`);
}

/**
 * @param {{ jobId: string, keyword: string, hl: string, gl: string, host: string, device: string }} job
 * @param {number} start
 */
function pageRequest(job, start) {
    return {
        url: buildSearchUrl(job, start),
        uniqueKey: `${job.jobId}:${start}`,
        userData: {
            jobId: job.jobId,
            device: job.device,
            start,
        },
    };
}

/**
 * @param {{ url: string }[]} existing
 * @param {{ url: string }[]} pageOrganic
 */
function newOrganic(existing, pageOrganic) {
    const seen = new Set(existing.map((item) => item.url));
    return pageOrganic.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

/**
 * @param {{
 *   keyword: string,
 *   domain: string,
 *   location: string,
 *   device: string,
 *   organic: { url: string }[],
 *   features: ReturnType<typeof emptyFeatures> | null,
 *   pagesFetched: number,
 *   pushed: boolean,
 * }} job
 */
async function pushJob(job) {
    if (job.pushed) return;
    job.pushed = true;

    const ranking = rankingFor(job.organic, job.domain);
    const record = {
        keyword: job.keyword,
        domain: job.domain,
        location: job.location,
        device: job.device,
        position: ranking.position,
        rankingUrl: ranking.rankingUrl,
        serpFeatures: job.features ?? emptyFeatures(),
        pagesChecked: job.pagesFetched,
    };

    if (ranking.position) {
        log.info(`"${job.keyword}" ranks ${job.domain} at position ${ranking.position}`);
    } else {
        log.info(`"${job.keyword}" did not find ${job.domain} in ${job.organic.length} organic results`);
    }

    const chargeResult = await pushCheckedKeyword(record);
    if (chargeResult?.eventChargeLimitReached) {
        log.warning('Spending limit reached. Stopping before more keywords are checked.');
        await Actor.exit('Spending limit reached');
    }
}

/**
 * Charge one keyword-checked event when the Actor is on pay-per-event pricing.
 * @param {Record<string, unknown>} record
 */
async function pushCheckedKeyword(record) {
    try {
        const pricing = Actor.getChargingManager()?.getPricingInfo?.();
        if (pricing?.isPayPerEvent) {
            return await Actor.pushData(record, KEYWORD_CHECKED_EVENT);
        }
    } catch (error) {
        log.warning(`Pricing check failed (${error.message}). Saving this keyword without a charge event.`);
    }
    await Actor.pushData(record);
    return { eventChargeLimitReached: false };
}

function toHtml(body) {
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf8');
    return String(body ?? '');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value) {
    return String(value).replace(/\/\/[^/\s@]+@/g, '//');
}
