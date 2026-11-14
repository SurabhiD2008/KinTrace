import { z } from 'zod';

// Every schema imports zod from here, so this setting is in place before any schema runs.
// By default zod probes once whether `new Function` is allowed, to speed up object
// parsing. The site's Content-Security-Policy forbids eval, so the probe is blocked:
// harmless, but browsers report it as a policy violation (Firefox as a console error).
// Jitless mode skips the probe and the eval-based fast path; parsing results are the same.
z.config({ jitless: true });

export { z };
