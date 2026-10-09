import { Actor } from 'apify';
import { log } from 'crawlee';

import { normalizeInput } from './input.js';
import { runRankCheck } from './run.js';

await Actor.main(async () => {
    const input = normalizeInput(await Actor.getInput());
    log.info(`Checking ${input.keywords.length} keyword${input.keywords.length === 1 ? '' : 's'}`);
    await runRankCheck(input);
});
