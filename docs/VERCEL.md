# Deploying Audiora to Vercel

Audiora is fully pre-configured for seamless zero-config deployment to **Vercel** with full support for:
- All static assets and pages (HTML, CSS, modern JS modules, SVG artwork)
- Multilingual audio streaming with byte-range requests (`Range: bytes=...`)
- REST APIs (`/api/episodes`, `/api/config`, `/api/health`, `/api/supabase/status`)
- Supabase Cloud synchronization

---

## Quick Deploy (via Vercel Dashboard)

1. **Push to GitHub**:
   Your repository is already hosted at:
   `https://github.com/mahimmuradimath7-debug/AUDIORA`

2. **Import into Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select and import **`mahimmuradimath7-debug/AUDIORA`**.
   - Leave Framework Preset as **Other** (detected automatically from `vercel.json`).

3. **Configure Environment Variables**:
   Under the **Environment Variables** section in the Vercel project configuration, add:

   | Name | Value | Description |
   | --- | --- | --- |
   | `AUDIORA_ADMIN_TOKEN` | *your-token-24+-chars* | Required for publishing in Creator Studio |
   | `SUPABASE_URL` | `https://maivkyqwjlibilmpgmrk.supabase.co` | Supabase project URL |
   | `SUPABASE_ANON_KEY` | `sb_publishable_S1rY-nXIDVcN7T39y8L8AQ_R6JbtjbZ` | Supabase publishable key |

4. **Deploy**:
   - Click **Deploy**.
   - Your site will be live instantly with a free `*.vercel.app` domain (e.g. `https://audiora.vercel.app`)!

---

## Deploy via Vercel CLI (Optional)

If you have the Vercel CLI installed:

```bash
# Login to Vercel
npx vercel login

# Deploy to preview
npx vercel

# Deploy to production
npx vercel --prod
```

---

## How It Works Under the Hood

- **`vercel.json`**: Configures Serverless Function routing and bundles `frontend/`, `media/`, `backend/`, and `data/` assets.
- **`api/index.js`**: Universal serverless entrypoint that mounts Audiora's request handler.
- **Serverless & Cloud Storage**: Vercel Serverless Functions enforce a 4.5 MB body limit. Creator Studio uploads recordings over 4.5 MB directly to Supabase Storage (`audio` bucket), streaming them with global CDN speed and byte-range seekability.
- **Ephemeral Storage**: When running in a Vercel serverless environment (`process.env.VERCEL`), local temporary storage automatically mounts to `/tmp`, while published episodes sync permanently to your configured Supabase Cloud database.

---

### Creator Studio on Vercel Checklist

If uploading from Creator Studio on Vercel is showing an error, ensure:
1. **`AUDIORA_ADMIN_TOKEN` is set** in Vercel Project Settings &rarr; Environment Variables.
2. **`SUPABASE_URL` and `SUPABASE_ANON_KEY` are set** in Vercel Environment Variables.
3. **Supabase Schema is initialized**: Run the script in [`docs/supabase-schema.sql`](./supabase-schema.sql) in your [Supabase SQL Editor](https://supabase.com/dashboard/project/maivkyqwjlibilmpgmrk/sql) to create the `episodes` table and public `audio` storage bucket.
