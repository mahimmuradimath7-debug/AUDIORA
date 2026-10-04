-- ==============================================================================
-- Audiora — Supabase Cloud Database & Storage Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/maivkyqwjlibilmpgmrk/sql
-- ==============================================================================

-- 1. Create the episodes table
create table if not exists public.episodes (
  id text primary key,
  title text not null,
  show text not null,
  host text not null,
  description text not null,
  language text not null check (language in ('kn', 'hi', 'en')),
  category text not null,
  mood text not null,
  duration numeric not null,
  "audioUrl" text not null,
  artwork text not null,
  "publishedAt" timestamp with time zone default timezone('utc'::text, now()) not null,
  featured boolean default false,
  demo boolean default false
);

-- 2. Enable Row Level Security (RLS)
alter table public.episodes enable row level security;

-- 3. RLS Policies
-- Allow anyone to read episodes
create policy "Public read episodes"
  on public.episodes for select
  using (true);

-- Allow inserting episodes with anon/publishable key
create policy "Allow inserts with publishable key"
  on public.episodes for insert
  with check (true);

-- Allow updates with anon/publishable key
create policy "Allow updates with publishable key"
  on public.episodes for update
  using (true);

-- 4. Create an audio storage bucket for remote recordings (Optional)
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

create policy "Public Audio Storage Access"
  on storage.objects for select
  using (bucket_id = 'audio');

create policy "Allow Audio Uploads"
  on storage.objects for insert
  with check (bucket_id = 'audio');
