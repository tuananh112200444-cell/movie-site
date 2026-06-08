# Schedule Email Alerts

Gửi email cho admin khi phim có countdown sắp chiếu, mặc định khoảng 30 phút trước giờ phát hành.

## Supabase secrets cần đặt

```bash
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set ADMIN_NOTIFY_EMAIL="your-gmail@gmail.com"
supabase secrets set SCHEDULE_EMAIL_FROM="KhoPhim <notify@your-domain.com>"
supabase secrets set CRON_SECRET="mot-chuoi-bi-mat-dai"
supabase secrets set SITE_URL="https://khophim.org"
```

Tuỳ chọn:

```bash
supabase secrets set SCHEDULE_ALERT_LEAD_MINUTES="30"
supabase secrets set SCHEDULE_ALERT_WINDOW_MINUTES="5"
```

Với cấu hình mặc định, cron chạy mỗi 5 phút và gửi nếu giờ chiếu còn khoảng 25-35 phút.

## Deploy function

```bash
supabase functions deploy schedule-email-alerts
```

## Cron SQL mẫu

Chạy trong Supabase SQL Editor sau khi thay:

- `PROJECT_REF`
- `YOUR_ANON_OR_PUBLISHABLE_KEY`
- `YOUR_CRON_SECRET`

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'schedule-email-alerts-every-5-minutes',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://PROJECT_REF.supabase.co/functions/v1/schedule-email-alerts?secret=YOUR_CRON_SECRET',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_OR_PUBLISHABLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

## Test thủ công

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/schedule-email-alerts?secret=YOUR_CRON_SECRET" \
  -H "Authorization: Bearer YOUR_ANON_OR_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```
