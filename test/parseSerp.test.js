import assert from 'node:assert/strict';
import test from 'node:test';

import {
    domainMatches,
    isBlockedResponse,
    isResultsPage,
    parseSerp,
    rankingFor,
    resolveResultUrl,
} from '../src/parseSerp.js';

function page(body) {
    return `<!doctype html><html><body><div id="search">${body}</div></body></html>`;
}

test('organic position uses the result URL and skips ads, sitelinks, PAA, and packs', () => {
    const html = page(`
        <div id="tads"><div class="uEierd"><div class="g"><a href="https://ads.example.com/buy"><h3>Sponsored result</h3></a></div></div></div>
        <span>Sponsored</span>
        <div class="c2xzTb"><span class="hgKElc">A short answer from the first result.</span></div>
        <div id="rso">
            <div class="related-question-pair">
                <div class="g"><a href="https://paa.example.com/q"><h3>People also ask this</h3></a></div>
            </div>
            <div class="g">
                <a href="/url?q=https://example.com/first&amp;sa=U"><h3>First result</h3></a>
                <a href="https://example.com/sitelink"><h3>Sitelink</h3></a>
            </div>
            <div class="g">
                <div class="g"><a href="https://nested.example.com/inner"><h3>Nested duplicate</h3></a></div>
            </div>
            <div class="VkpGBb"><a data-cid="1" href="https://local.example.com/shop"><h3>Local place</h3></a></div>
            <div id="iur"><div class="g"><a href="https://images.example.com/pic"><h3>Image result</h3></a></div></div>
            <div class="RzdJxc"></div>
            <div class="commercial-unit-desktop-top"></div>
            <div class="g"><a href="https://www.docs.apify.com/proxy/google-serp-proxy"><h3>Google SERP proxy</h3></a></div>
        </div>
        <div id="bottomads"></div>
    `);

    const parsed = parseSerp(html);
    assert.deepEqual(parsed.organic.map((item) => item.url), [
        'https://example.com/first',
        'https://nested.example.com/inner',
        'https://www.docs.apify.com/proxy/google-serp-proxy',
    ]);
    assert.deepEqual(rankingFor(parsed.organic, 'docs.apify.com'), {
        position: 3,
        rankingUrl: 'https://www.docs.apify.com/proxy/google-serp-proxy',
    });
    assert.deepEqual(parsed.features, {
        featuredSnippet: true,
        localPack: true,
        peopleAlsoAsk: true,
        imagePack: true,
        video: true,
        shopping: true,
        ads: true,
    });
});

test('a bare results page has no features and a null position when the domain is absent', () => {
    const html = page(`
        <div id="rso">
            <div class="g"><a href="https://example.com/a"><h3>Example</h3></a></div>
        </div>
    `);
    const parsed = parseSerp(html);
    assert.equal(parsed.organic.length, 1);
    assert.deepEqual(rankingFor(parsed.organic, 'docs.apify.com'), {
        position: null,
        rankingUrl: null,
    });
    assert.deepEqual(parsed.features, {
        featuredSnippet: false,
        localPack: false,
        peopleAlsoAsk: false,
        imagePack: false,
        video: false,
        shopping: false,
        ads: false,
    });
});

test('feature labels count when the class names are absent', () => {
    const withLabels = parseSerp(page(`
        <div id="rso"></div>
        <span>People also ask</span>
        <h3>Videos</h3>
        <span>Popular products</span>
    `));
    assert.equal(withLabels.features.peopleAlsoAsk, true);
    assert.equal(withLabels.features.video, true);
    assert.equal(withLabels.features.shopping, true);

    const navOnly = parseSerp(page('<div id="rso"></div><span>Videos</span>'));
    assert.equal(navOnly.features.video, false);
});

test('position continues across pages and matches subdomains only', () => {
    const page1 = Array.from({ length: 10 }, (_, index) => ({ url: `https://other.example/p${index}` }));
    const found = rankingFor([...page1, { url: 'https://blog.docs.apify.com/guide' }], 'docs.apify.com');
    assert.equal(found.position, 11);
    assert.equal(found.rankingUrl, 'https://blog.docs.apify.com/guide');
    assert.equal(domainMatches('myexample.com', 'example.com'), false);
    assert.equal(domainMatches('example.com.evil.com', 'example.com'), false);
    assert.equal(domainMatches('www.example.com', 'example.com'), true);
});

test('Google search and ad redirects are not ranking URLs', () => {
    assert.equal(resolveResultUrl('/url?q=https://docs.apify.com/sdk&sa=U'), 'https://docs.apify.com/sdk');
    assert.equal(resolveResultUrl('https://www.google.com/search?q=apify'), null);
    assert.equal(resolveResultUrl('https://www.google.com/aclk?sa=l'), null);
    assert.equal(resolveResultUrl('/maps/place/Cafe'), null);
});

test('live SERP proxy markup uses the cite, ignores opaque goto links, and ignores an empty ad slot', () => {
    const html = page(`
        <div id="tads"><div></div></div>
        <div id="rso">
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=OPAQUE"><h3>What Is Wikipedia?</h3></a>
                <cite>https://www.businessinsider.com › reference › what-is-...</cite>
            </div>
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=OPAQUE2"><h3>Wikipedia.de</h3></a>
                <cite>https://www.wikipedia.de</cite>
            </div>
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=OPAQUE3"><h3>Wikipedia</h3></a>
                <cite>355K+ followers</cite>
            </div>
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=OPAQUE4"><h3>Wiki</h3></a>
                <cite>https://simple.wikipedia.org › wiki › Wiki</cite>
            </div>
        </div>
        <a id="pnnext" href="/search?q=wikipedia&amp;start=10">Next</a>
        <div data-vid="abc"></div>
    `);
    const parsed = parseSerp(html);
    assert.deepEqual(parsed.organic.map((item) => item.url), [
        'https://www.businessinsider.com/',
        'https://www.wikipedia.de/',
        'https://simple.wikipedia.org/wiki/Wiki',
    ]);
    assert.deepEqual(rankingFor(parsed.organic, 'wikipedia.org'), {
        position: 3,
        rankingUrl: 'https://simple.wikipedia.org/wiki/Wiki',
    });
    assert.equal(parsed.features.ads, false);
    assert.equal(parsed.features.video, true);
    assert.equal(parsed.hasNextPage, true);
});

test('a breadcrumb cite saves the site origin, and a clean path cite stays a URL', () => {
    const html = page(`
        <div id="rso">
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=CAESopaque"><h3>How to Boil an Egg</h3></a>
                <cite>https://www.allrecipes.com › In the Kitchen › How To</cite>
            </div>
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=CAESopaque2"><h3>Wiki</h3></a>
                <cite>https://simple.wikipedia.org › wiki › Wiki</cite>
            </div>
            <div class="yuRUbf">
                <a class="zReHs" href="/goto?url=CAESopaque3"><h3>About</h3></a>
                <cite>https://en.wikipedia.org › wiki › Wikipedia:About</cite>
            </div>
        </div>
    `);
    const parsed = parseSerp(html);
    assert.deepEqual(parsed.organic.map((item) => item.url), [
        'https://www.allrecipes.com/',
        'https://simple.wikipedia.org/wiki/Wiki',
        'https://en.wikipedia.org/wiki/Wikipedia:About',
    ]);
    assert.deepEqual(rankingFor(parsed.organic, 'allrecipes.com'), {
        position: 1,
        rankingUrl: 'https://www.allrecipes.com/',
    });
    assert.deepEqual(rankingFor(parsed.organic, 'simple.wikipedia.org'), {
        position: 2,
        rankingUrl: 'https://simple.wikipedia.org/wiki/Wiki',
    });
});

test('block pages are not treated as an empty results page', () => {
    const blocked = '<html><title>unusual traffic</title><p>Our systems have detected unusual traffic</p></html>';
    assert.equal(isBlockedResponse(blocked), true);
    assert.equal(isBlockedResponse(page('<div id="rso"></div>')), false);
    const liveSerp = page('<div id="rso"></div><script src="https://www.google.com/recaptcha/api.js"></script><div class="g-recaptcha"></div><a href="/sorry/index">about</a>');
    assert.equal(isBlockedResponse(liveSerp), false);
    assert.equal(isResultsPage(page('<div id="rso"></div>')), true);
    assert.equal(isResultsPage('<html>no results markup</html>'), false);
});
