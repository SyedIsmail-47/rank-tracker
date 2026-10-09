/** Countries the SERP proxy can target by Google domain. */
const COUNTRIES = [
    { name: 'United States', gl: 'us', host: 'www.google.com', hl: 'en' },
    { name: 'United Kingdom', gl: 'uk', host: 'www.google.co.uk', hl: 'en' },
    { name: 'Canada', gl: 'ca', host: 'www.google.ca', hl: 'en' },
    { name: 'Australia', gl: 'au', host: 'www.google.com.au', hl: 'en' },
    { name: 'New Zealand', gl: 'nz', host: 'www.google.co.nz', hl: 'en' },
    { name: 'Ireland', gl: 'ie', host: 'www.google.ie', hl: 'en' },
    { name: 'Germany', gl: 'de', host: 'www.google.de', hl: 'de' },
    { name: 'Austria', gl: 'at', host: 'www.google.at', hl: 'de' },
    { name: 'Switzerland', gl: 'ch', host: 'www.google.ch', hl: 'de' },
    { name: 'France', gl: 'fr', host: 'www.google.fr', hl: 'fr' },
    { name: 'Spain', gl: 'es', host: 'www.google.es', hl: 'es' },
    { name: 'Italy', gl: 'it', host: 'www.google.it', hl: 'it' },
    { name: 'Netherlands', gl: 'nl', host: 'www.google.nl', hl: 'nl' },
    { name: 'Belgium', gl: 'be', host: 'www.google.be', hl: 'nl' },
    { name: 'Portugal', gl: 'pt', host: 'www.google.pt', hl: 'pt' },
    { name: 'Sweden', gl: 'se', host: 'www.google.se', hl: 'sv' },
    { name: 'Norway', gl: 'no', host: 'www.google.no', hl: 'no' },
    { name: 'Denmark', gl: 'dk', host: 'www.google.dk', hl: 'da' },
    { name: 'Finland', gl: 'fi', host: 'www.google.fi', hl: 'fi' },
    { name: 'Poland', gl: 'pl', host: 'www.google.pl', hl: 'pl' },
    { name: 'Czechia', gl: 'cz', host: 'www.google.cz', hl: 'cs' },
    { name: 'Romania', gl: 'ro', host: 'www.google.ro', hl: 'ro' },
    { name: 'Greece', gl: 'gr', host: 'www.google.gr', hl: 'el' },
    { name: 'Hungary', gl: 'hu', host: 'www.google.hu', hl: 'hu' },
    { name: 'Brazil', gl: 'br', host: 'www.google.com.br', hl: 'pt' },
    { name: 'Mexico', gl: 'mx', host: 'www.google.com.mx', hl: 'es' },
    { name: 'Argentina', gl: 'ar', host: 'www.google.com.ar', hl: 'es' },
    { name: 'Chile', gl: 'cl', host: 'www.google.cl', hl: 'es' },
    { name: 'Colombia', gl: 'co', host: 'www.google.com.co', hl: 'es' },
    { name: 'India', gl: 'in', host: 'www.google.co.in', hl: 'en' },
    { name: 'Japan', gl: 'jp', host: 'www.google.co.jp', hl: 'ja' },
    { name: 'South Korea', gl: 'kr', host: 'www.google.co.kr', hl: 'ko' },
    { name: 'Singapore', gl: 'sg', host: 'www.google.com.sg', hl: 'en' },
    { name: 'Indonesia', gl: 'id', host: 'www.google.co.id', hl: 'id' },
    { name: 'Philippines', gl: 'ph', host: 'www.google.com.ph', hl: 'en' },
    { name: 'Malaysia', gl: 'my', host: 'www.google.com.my', hl: 'en' },
    { name: 'Thailand', gl: 'th', host: 'www.google.co.th', hl: 'th' },
    { name: 'Vietnam', gl: 'vn', host: 'www.google.com.vn', hl: 'vi' },
    { name: 'South Africa', gl: 'za', host: 'www.google.co.za', hl: 'en' },
    { name: 'United Arab Emirates', gl: 'ae', host: 'www.google.ae', hl: 'en' },
    { name: 'Saudi Arabia', gl: 'sa', host: 'www.google.com.sa', hl: 'ar' },
    { name: 'Turkey', gl: 'tr', host: 'www.google.com.tr', hl: 'tr' },
    { name: 'Israel', gl: 'il', host: 'www.google.co.il', hl: 'en' },
];

const ALIASES = {
    usa: 'United States',
    'united states of america': 'United States',
    gb: 'United Kingdom',
    'great britain': 'United Kingdom',
    uk: 'United Kingdom',
    uae: 'United Arab Emirates',
    korea: 'South Korea',
    'republic of korea': 'South Korea',
    'czech republic': 'Czechia',
    holland: 'Netherlands',
    turkiye: 'Turkey',
    türkiye: 'Turkey',
};

const byKey = new Map();
for (const country of COUNTRIES) {
    byKey.set(country.name.toLowerCase(), country);
    byKey.set(country.gl, country);
}
for (const [alias, name] of Object.entries(ALIASES)) {
    byKey.set(alias, byKey.get(name.toLowerCase()));
}

/**
 * @param {string} value Country name or code, such as "United States" or "uk".
 */
export function resolveLocation(value) {
    const key = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const country = byKey.get(key);
    if (!country) {
        throw new Error(`Location "${value}" is not supported. Use a country name such as United States, United Kingdom, or Canada.`);
    }
    return country;
}
