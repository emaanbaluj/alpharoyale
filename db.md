# Database Guide (Supabase + Next.js)

This project uses **Supabase** for the database and the **Supabase CLI** for local development, migrations, and deployment.

This document explains:
- How to start the local Supabase database
- How to create and apply migrations locally
- How to deploy migrations to the production database

---

## Prerequisites

Make sure you have the following installed:

- **Docker** (required for local Supabase)
- **Node.js** (for the Next.js app)

If you are using Linux make sure to NOT use docker desktop and only docker engine.

### Install Supabase CLI
Make sure you are in the root of the next.js project.
You should see folders such as "app" and "supabase" in your current directory.
I will refer to this directory as "app root".
```bash
npm install
```

Verify installation:
```bash
npx supabase --version
```

---

## Project Structure (Relevant Parts)

```text
ALPHAROYALE
├── alpha-royale
│   ├── app/
│   ├── supabase/
│   │   ├── migrations/        # SQL migration files
│   │   └── config.toml        # Supabase local config
│   ├── db.md
│   └── ...
└── ...
```

---

## Starting the Local Database

From the app root:

```bash
npx supabase start
```

This will:
- Start a local Postgres database
- Start Supabase services (Auth, Storage, API)
- Apply all existing migrations automatically

Supabase Studio (local dashboard):
```
http://localhost:54323
```

Stop everything:
```bash
npx supabase stop
```

---

## Creating a New Migration

Always create migrations using the CLI:

```bash
npx supabase migration new <migration_name>
```

Example:
```bash
npx supabase migration new create_price_data_table
```

This creates a new file in:
```text
supabase/migrations/YYYYMMDDHHMMSS_create_price_data_table.sql
```

Add your SQL changes inside this file.

---

## Applying Migrations Locally

### Automatic
Migrations are applied automatically when running:
```bash
npx supabase start
```

### Manual Reset (if needed)
```bash
npx supabase db reset
```

⚠️ This will delete and recreate the local database.

---

## Checking Migration Status

```bash
npx supabase migration list
```

---

## Deploying Migrations to Production

### 1. Login & Link Project (One-time)

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

You can find the project ref in the Supabase dashboard URL.

---

### 2. Push Migrations

```bash
npx supabase db push
```

This applies all new migrations to the production database.

---

## Important Rules

- Never edit a migration after it’s deployed
- Always create a new migration for changes
- Avoid destructive changes unless intentional

---

## Common Commands

```bash
npx supabase start
npx supabase stop
npx supabase migration new NAME
npx supabase db reset
npx supabase migration list
npx supabase db push
```

---

If something breaks, ask before manually changing the database.
