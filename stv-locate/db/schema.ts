// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const assets = sqliteTable('assets', { id: text('id').primaryKey(), owner: text('owner').notNull(), data: text('data').notNull(), updated: text('updated').notNull() });
export const rateLimits = sqliteTable('rate_limits', { id: text('id').primaryKey(), time: integer('time').notNull() });
export const locations = sqliteTable('locations', { id:text('id').primaryKey(), owner:text('owner').notNull(), data:text('data').notNull(), updated:text('updated').notNull() });
