import { resolveLocation } from './locations.js';
import { normalizeDomain } from './parseSerp.js';

/**
 * Apply the same defaults as `.actor/input_schema.json`.
 * @param {Record<string, unknown> | null | undefined} raw
 */
export function normalizeInput(raw = {}) {
    const input = raw ?? {};
    if (!Array.isArray(input.keywords) || input.keywords.length === 0) {
        throw new Error('Input keywords must contain at least one keyword and domain.');
    }

    return {
        keywords: input.keywords.map((item, index) => normalizeKeyword(item, index)),
        maxPages: requireInteger(input.maxPages, 1, 1, 10, 'maxPages'),
    };
}

/**
 * @param {unknown} item
 * @param {number} index
 */
function normalizeKeyword(item, index) {
    const row = index + 1;
    if (!item || typeof item !== 'object') {
        throw new Error(`Keyword ${row} must be an object with keyword and domain.`);
    }
    const record = /** @type {Record<string, unknown>} */ (item);
    const keyword = String(record.keyword ?? '').trim();
    if (!keyword) throw new Error(`Keyword ${row} is missing a keyword.`);

    const locationInput = record.location === undefined || String(record.location).trim() === ''
        ? 'United States'
        : String(record.location).trim();
    const location = resolveLocation(locationInput);

    let device = record.device === undefined || record.device === '' ? 'desktop' : record.device;
    if (typeof device === 'string') device = device.trim().toLowerCase();
    if (device !== 'desktop' && device !== 'mobile') {
        throw new Error(`Keyword ${row} device must be desktop or mobile.`);
    }

    return {
        keyword,
        domain: normalizeDomain(record.domain),
        location: location.name,
        device,
        gl: location.gl,
        host: location.host,
        hl: location.hl,
    };
}

function requireInteger(value, fallback, min, max, label) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    }
    return value;
}
