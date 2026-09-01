import { pgTable, uuid, varchar, timestamp, text, integer } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
})

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull().default('untitled note'),
  content: text('content'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  noteId: uuid('note_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  s3Key: text('s3_key').notNull().unique(),
  mimeType: varchar('mime_type', { length: 255 }).notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert

export type Attachment = typeof attachments.$inferSelect
export type NewAttachment = typeof attachments.$inferInsert
