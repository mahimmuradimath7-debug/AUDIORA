# Supabase Integration for Audiora

Audiora connects seamlessly with **Supabase** for cloud database synchronization and storage.

## Credentials

The following settings are configured in `.env`:

```env
SUPABASE_URL=https://maivkyqwjlibilmpgmrk.supabase.co
SUPABASE_ANON_KEY=sb_publishable_S1rY-nXIDVcN7T39y8L8AQ_R6JbtjbZ
```

## Features

1. **Dual Storage Architecture**:
   - Local JSON snapshot in `data/catalog.json` ensures offline resilience and zero dependency requirements.
   - Cloud sync to Supabase `public.episodes` table mirrors every published episode to the cloud.
2. **Dynamic Configuration**:
   - The `/api/config` and `/api/supabase/status` endpoints dynamically report connection status and project metadata to the frontend.
3. **Content-Security-Policy (CSP)**:
   - Security headers allow direct client-side requests and media streaming to/from `https://*.supabase.co`.
4. **Cloud Badge**:
   - Creator Studio displays a real-time status indicator when connected to Supabase.

## Database Setup

To enable the `episodes` table in your Supabase project:

1. Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/maivkyqwjlibilmpgmrk/sql).
2. Paste and run the SQL script from [`docs/supabase-schema.sql`](./supabase-schema.sql).
3. The table `public.episodes` will immediately begin receiving synced episodes upon publication!
