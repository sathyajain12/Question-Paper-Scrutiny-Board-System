import { Hono } from 'hono';
import type { Env } from '../env';

const me = new Hono<Env>();

/** The client bootstraps role-gated routing from this. */
me.get('/', (c) => c.json(c.get('user')));

export default me;
