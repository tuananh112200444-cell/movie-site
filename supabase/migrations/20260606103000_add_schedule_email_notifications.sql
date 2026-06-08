create table if not exists public.schedule_email_notifications (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  movie_slug text not null,
  movie_name text not null,
  target_episode_number integer not null,
  target_at timestamptz not null,
  recipient_email text not null,
  status text not null default 'pending',
  provider text,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint schedule_email_notifications_status_check
    check (status in ('pending', 'sent', 'failed', 'skipped'))
);

create unique index if not exists schedule_email_notifications_once_idx
  on public.schedule_email_notifications (
    movie_id,
    target_episode_number,
    target_at,
    lower(recipient_email)
  );

create index if not exists schedule_email_notifications_target_at_idx
  on public.schedule_email_notifications (target_at desc);

alter table public.schedule_email_notifications enable row level security;

drop policy if exists "Admins only read schedule email notifications" on public.schedule_email_notifications;
create policy "Admins only read schedule email notifications"
  on public.schedule_email_notifications
  for select
  using (false);
