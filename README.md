# Rank Tracker

A product of **Rodexco**. Check where a domain ranks on Google for a keyword, and which features are on that results page.

## What it does

For each keyword, the Actor fetches a Google results page through Apify's Google SERP proxy and saves one dataset record: the domain's organic position, the ranking URL, and the SERP features on the first page.

Position is empty when the domain is not in the organic results that were checked. Ads, the local pack, People Also Ask, and other feature boxes are not counted as organic positions. Those boxes are reported separately, as features present on the page.

## Input

| Field | Description | Default |
|---|---|---|
| `keywords` | One row per check: keyword, domain, country, and desktop or mobile | one documentation query for docs.apify.com |
| `maxPages` | Result pages to check per keyword. Each page is about 10 organic results. Stops early when the domain is found | 1 |

The default keyword is a low-volume documentation query, so a scheduled run of the default input stays on a single quiet search.

Location is a country, such as United States or United Kingdom. The Actor uses that country's Google domain, which is what the SERP proxy uses to localize results.

## Output

One dataset record per keyword:

```json
{
  "keyword": "apify google serp proxy cheerio crawler example",
  "domain": "docs.apify.com",
  "location": "United States",
  "device": "desktop",
  "position": 1,
  "rankingUrl": "https://docs.apify.com/proxy/google-serp-proxy",
  "serpFeatures": {
    "featuredSnippet": false,
    "localPack": false,
    "peopleAlsoAsk": true,
    "imagePack": false,
    "video": false,
    "shopping": false,
    "ads": true
  },
  "pagesChecked": 1
}
```

On pay-per-event pricing, a saved keyword is charged as one `keyword-checked` event. A keyword whose results page never comes back is not saved and not charged.

## Notes

- Requests go through the `GOOGLE_SERP` proxy group, one at a time, at least two seconds apart.
- Desktop and mobile send different user agents. The search URL follows Apify's SERP proxy rules: plain HTTP on a `www.google` host.
- Each run reports the position found on that run.

## Support

Built and maintained by Rodexco. For issues or feature requests, reach out via the Actor's Issues tab on Apify Store.
