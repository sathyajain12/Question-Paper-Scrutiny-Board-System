/**
 * Cascading dropdown data for the admin file checker.
 * All three are served from the KV catalogue cache (15-min TTL).
 */
import { Hono } from 'hono';
import type { Env } from '../env';

const catalog = new Hono<Env>();

catalog.get('/degrees', (c) => {
  void c;
  throw new Error('not implemented'); // Phase 2
});

catalog.get('/departments', (c) => {
  void c; // ?degree=
  throw new Error('not implemented');
});

catalog.get('/programmes', (c) => {
  void c; // ?degree=&department=
  throw new Error('not implemented');
});

export default catalog;
