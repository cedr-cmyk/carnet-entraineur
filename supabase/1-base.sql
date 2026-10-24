-- 1. Base du carnet (déjà exécuté à l'installation)
create table if not exists public.docs (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, col, id)
);
alter table public.docs enable row level security;
do $$ begin alter publication supabase_realtime add table public.docs; exception when duplicate_object then null; end $$;
insert into storage.buckets (id, name, public) values ('fichiers', 'fichiers', false) on conflict (id) do nothing;
