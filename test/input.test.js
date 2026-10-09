import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeInput } from '../src/input.js';
import {
    MAX_CONCURRENCY,
    MIN_REQUEST_DELAY_SECS,
    SERP_PROXY_CONFIGURATION,
    buildSearchUrl,
    shouldFetchNextPage,
    userAgentFor,
} from '../src/searchUrl.js';

const schema = JSON.parse(readFileSync(new URL('../.actor/input_schema.json', import.meta.url), 'utf8'));

test('prefill is one low-volume keyword and a single results page', () => {
    assert.equal(schema.properties.keywords.prefill.length, 1);
    assert.equal(schema.properties.keywords.prefill[0].domain, 'docs.apify.com');
    assert.equal(schema.properties.keywords.prefill[0].keyword, 'apify google serp proxy cheerio crawler example');
    assert.equal(schema.properties.maxPages.prefill, 1);
    assert.equal(schema.properties.maxPages.default, 1);
});

test('normalizeInput fills location, device, and page defaults', () => {
    const input = normalizeInput({
        keywords: [{
            keyword: '  apify google serp proxy cheerio crawler example  ',
            domain: 'https://www.docs.apify.com/proxy',
        }],
    });
    assert.equal(input.maxPages, 1);
    assert.deepEqual(input.keywords[0], {
        keyword: 'apify google serp proxy cheerio crawler example',
        domain: 'docs.apify.com',
        location: 'United States',
        device: 'desktop',
        gl: 'us',
        host: 'www.google.com',
        hl: 'en',
    });
});

test('normalizeInput accepts a country alias and mobile', () => {
    const input = normalizeInput({
        keywords: [{ keyword: 'rank check', domain: 'example.co.uk', location: 'UK', device: 'Mobile' }],
        maxPages: 3,
    });
    assert.equal(input.maxPages, 3);
    assert.equal(input.keywords[0].location, 'United Kingdom');
    assert.equal(input.keywords[0].host, 'www.google.co.uk');
    assert.equal(input.keywords[0].gl, 'uk');
    assert.equal(input.keywords[0].device, 'mobile');
});

test('normalizeInput rejects an empty list, a city, and a bad device', () => {
    assert.throws(() => normalizeInput({ keywords: [] }), /at least one keyword/);
    assert.throws(() => normalizeInput({
        keywords: [{ keyword: 'dentists', domain: 'example.com', location: 'Austin, TX' }],
    }), /not supported/);
    assert.throws(() => normalizeInput({
        keywords: [{ keyword: 'dentists', domain: 'example.com', device: 'tablet' }],
    }), /desktop or mobile/);
    assert.throws(() => normalizeInput({ keywords: [{ keyword: 'dentists', domain: 'not a domain' }] }), /not a hostname/);
    assert.throws(() => normalizeInput({ keywords: [{ keyword: 'dentists', domain: 'example.com' }], maxPages: 11 }), /maxPages/);
});

test('search URL uses the SERP proxy HTTP form and omits num', () => {
    const target = {
        keyword: 'apify google serp proxy',
        hl: 'en',
        gl: 'us',
        host: 'www.google.com',
    };
    const first = new URL(buildSearchUrl(target, 0));
    assert.equal(first.protocol, 'http:');
    assert.equal(first.hostname, 'www.google.com');
    assert.equal(first.pathname, '/search');
    assert.equal(first.searchParams.get('q'), 'apify google serp proxy');
    assert.equal(first.searchParams.get('gl'), 'us');
    assert.equal(first.searchParams.get('hl'), 'en');
    assert.equal(first.searchParams.get('pws'), '0');
    assert.equal(first.searchParams.has('start'), false);
    assert.equal(first.searchParams.has('num'), false);

    const second = new URL(buildSearchUrl({ ...target, host: 'www.google.co.uk', gl: 'uk' }, 10));
    assert.equal(second.hostname, 'www.google.co.uk');
    assert.equal(second.searchParams.get('start'), '10');
    assert.equal(second.searchParams.has('num'), false);
});

test('device changes the user agent and not the search URL', () => {
    const target = { keyword: 'rank', hl: 'en', gl: 'us', host: 'www.google.com' };
    assert.equal(buildSearchUrl({ ...target, device: 'desktop' }), buildSearchUrl({ ...target, device: 'mobile' }));
    assert.match(userAgentFor('mobile'), /Mobile/);
    assert.doesNotMatch(userAgentFor('desktop'), /Mobile/);
});

test('requests stay serial and at least two seconds apart', () => {
    assert.equal(SERP_PROXY_CONFIGURATION.groups[0], 'GOOGLE_SERP');
    assert.deepEqual(SERP_PROXY_CONFIGURATION, { groups: ['GOOGLE_SERP'] });
    assert.equal(MAX_CONCURRENCY, 1);
    assert.ok(MIN_REQUEST_DELAY_SECS >= 2);
});

test('paging stops when the domain is found, the page is short, or the cap is hit', () => {
    const base = { organicOnPage: 10, pagesFetched: 1, maxPages: 3, found: false };
    assert.equal(shouldFetchNextPage(base), true);
    assert.equal(shouldFetchNextPage({ ...base, found: true }), false);
    assert.equal(shouldFetchNextPage({ ...base, maxPages: 1 }), false);
    assert.equal(shouldFetchNextPage({ ...base, organicOnPage: 4 }), false);
    assert.equal(shouldFetchNextPage({ ...base, pagesFetched: 3 }), false);
    assert.equal(shouldFetchNextPage({ ...base, organicOnPage: 6, hasNextPage: true }), true);
    assert.equal(shouldFetchNextPage({ ...base, organicOnPage: 6, hasNextPage: false }), false);
    assert.equal(shouldFetchNextPage({ ...base, organicOnPage: 0, hasNextPage: true }), false);
});
