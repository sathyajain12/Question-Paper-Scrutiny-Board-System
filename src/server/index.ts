/**
 * Cloudflare Worker entry point.
 *
 * One Worker serves both the static SPA (via the ASSETS binding) and /api/*,
 * so the client is same-origin: no CORS, and the session cookie just works.
 */
import { Hono } from 'hono';
import type { Env } from './env';
import { errorHandler } from './middleware/error';
import { requireSession } from './middleware/auth';
import { usingFixtures } from './repositories';

import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import boardRoutes from './routes/boards';
import catalogRoutes from './routes/catalog';
import facultyRoutes from './routes/faculty';
import checkRoutes from './routes/checks';
import downloadRoutes from './routes/downloads';
import supportRoutes from './routes/support';
import emailPreviewRoutes from './routes/email-preview';
import demoAuthRoutes from './routes/demo-auth';

const app = new Hono<Env>();

app.onError(errorHandler);

/**
 * No API response is cacheable.
 *
 * Every one of them is scoped to whoever is signed in, so a stored copy is
 * either stale or someone else's. This bit us on the sign-in redirect: the
 * browser reused a cached response and showed a signed-out page at a URL
 * whose whole job was to set the session cookie.
 */
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, must-revalidate');
});

// Public — the OAuth dance itself cannot require a session.
app.route('/api/auth', authRoutes);

/**
 * Email preview, development only. Mounted ahead of `requireSession` because
 * it renders fixed sample data and touches nothing — and gated on the fixtures
 * data source so it cannot exist on a live deployment, where the templates
 * would leak the office's addresses to anyone who guessed the URL.
 */
app.use('/api/dev/*', async (c, next) => {
  if (!usingFixtures(c.env)) return c.json({ error: 'Not found' }, 404);
  await next();
});
app.route('/api/dev/emails', emailPreviewRoutes);

/**
 * Temporary demo sign-in — fixtures only, and key-gated on top of that.
 * See routes/demo-auth.ts; delete both once Google sign-in is configured.
 */
app.use('/api/auth/demo/*', async (c, next) => {
  if (!usingFixtures(c.env)) return c.json({ error: 'Not found' }, 404);
  await next();
});
app.route('/api/auth/demo', demoAuthRoutes);

// Everything else requires a valid session cookie.
app.use('/api/*', requireSession);

app.route('/api/me', meRoutes);
app.route('/api/boards', boardRoutes);
app.route('/api/catalog', catalogRoutes);
app.route('/api/faculty', facultyRoutes);
app.route('/api/checks', checkRoutes);
app.route('/api/downloads', downloadRoutes);
app.route('/api/support', supportRoutes);

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Anything not /api/* is the SPA or a static asset (logo.png, favicon, JS, CSS).
// `not_found_handling: single-page-application` in wrangler.jsonc handles
// client-side routes such as /admin by falling back to index.html.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

export { BoardLock } from './durable-objects/board-lock';
export { SupportChat } from './durable-objects/support-chat';
