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

import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import boardRoutes from './routes/boards';
import catalogRoutes from './routes/catalog';
import facultyRoutes from './routes/faculty';
import checkRoutes from './routes/checks';
import downloadRoutes from './routes/downloads';
import supportRoutes from './routes/support';

const app = new Hono<Env>();

app.onError(errorHandler);

// Public — the OAuth dance itself cannot require a session.
app.route('/api/auth', authRoutes);

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
