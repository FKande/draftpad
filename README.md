# Draftpad

A solo-built, Notion-style note-taking app with a focused plain-text editor, automatic saving, and file attachments.

## What it does

- Create, edit, rename, and delete notes with automatic saving.
- Access saved notes across devices; changes refresh when the window regains focus.
- Sign up and log in to your own notes.
- Upload, open, download, and delete file attachments.
- Switch between light and dark mode, with a remembered preference.

The notes editor needs a desktop window of at least 1025 × 550 pixels. The landing page and authentication pages work on mobile.

## Engineering

- **Session auth:** implemented directly with random session tokens, Postgres-backed sessions, HTTP-only cookies, bcrypt password hashing, and ownership-scoped queries.
- **Attachments:** the browser uploads directly to S3 using presigned URLs. The API checks ownership and verifies uploaded object metadata before recording it in Postgres. Upload and download URLs expire after five minutes.
- **Autosave:** 500 ms debounce, with pending edits flushed on window blur or editor unmount. Writes are queued per note to preserve order during navigation.
- **UI:** custom buttons, forms, dialogs, menus, and toasts built with React and CSS Modules, backed by shared typography and three-tier OKLCH tokens.
- **Testing:** Vitest/Supertest exercise auth and notes against Postgres; React/jsdom regression tests cover autosave races. GitHub Actions runs client/server lint and server tests, applying test migrations automatically.

## Stack

- **Frontend:** React, TypeScript, Vite, React Router, CSS Modules.
- **Backend:** Node.js, Express, TypeScript, Zod, PostgreSQL, Drizzle ORM and migrations.
- **Deployment:** Vercel frontend, Render API, Neon Postgres, Amazon S3 attachments.

## Running locally

Use Node.js 24, PostgreSQL, and an S3 bucket for attachments. From the repository root:

```sh
npm --prefix server ci
npm --prefix client ci
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Set `DATABASE_URL` and the `AWS_*` values in `server/.env` for your database and bucket. Allow browser `PUT` requests with the `Content-Type` header from `http://localhost:5173` in the bucket's CORS configuration. Keep the example local API/origin settings.

Apply migrations:

```sh
cd server
npx drizzle-kit migrate
cd ..
```

Start these in separate terminals, each from the repository root:

```sh
npm --prefix server run dev
```

```sh
npm --prefix client run dev
```

Open [localhost:5173](http://localhost:5173); the API runs on port 3000.

For API tests, copy `server/.env.test.example` to `server/.env.test` and set `DATABASE_URL` to a separate test database; tests delete data. Run `npm --prefix server test`. Run editor regressions with `npm --prefix client run test:autosave`.
