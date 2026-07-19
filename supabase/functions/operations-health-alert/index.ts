import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const ADMIN_EMAIL = Deno.env.get('ADMIN_NOTIFY_EMAIL') || '';
const FROM = Deno.env.get('SCHEDULE_EMAIL_FROM') || 'KhoPhim <onboarding@resend.dev>';
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store' } });
Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') || '';
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error:'Unauthorized' },401);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error:'Missing Supabase configuration' },500);
  const supabase = createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
  const { data:snapshot } = await supabase.from('operations_health_snapshots').select('*').order('checked_at',{ascending:false}).limit(1).maybeSingle();
  if (!snapshot || snapshot.status==='healthy') return json({ ok:true, sent:false, reason:'healthy' });
  const fingerprint = `${snapshot.status}:${snapshot.failed_cron_jobs}:${snapshot.stale_cron_jobs}:${snapshot.sync_failures_6h}:${snapshot.player_errors_1h}:${snapshot.unreachable_streams_1h}`;
  const since = new Date(Date.now()-60*60*1000).toISOString();
  const { data:existing } = await supabase.from('operations_alert_notifications').select('id').eq('fingerprint',fingerprint).gte('created_at',since).limit(1).maybeSingle();
  if (existing) return json({ ok:true,sent:false,reason:'deduplicated' });
  const { data:notice,error:insertError } = await supabase.from('operations_alert_notifications').insert({snapshot_id:snapshot.id,severity:snapshot.status,fingerprint,status:'pending'}).select('id').single();
  if (insertError) return json({ error:insertError.message },500);
  if (!RESEND_KEY || !ADMIN_EMAIL) { await supabase.from('operations_alert_notifications').update({status:'failed',error_message:'Missing email configuration'}).eq('id',notice.id); return json({error:'Missing email configuration'},503); }
  const subject = `[KhoPhim ${String(snapshot.status).toUpperCase()}] Sức khỏe hệ thống ${snapshot.score}/100`;
  const text = `Thời điểm: ${snapshot.checked_at}\nCron lỗi: ${snapshot.failed_cron_jobs}\nCron stale: ${snapshot.stale_cron_jobs}\nSync lỗi 6h: ${snapshot.sync_failures_6h}\nPlayer lỗi 1h: ${snapshot.player_errors_1h}\nStream không truy cập 1h: ${snapshot.unreachable_streams_1h}\nSEO đạt/không đạt: ${snapshot.seo_eligible}/${snapshot.seo_ineligible}\n\nMở trang quản trị KhoPhim để kiểm tra chi tiết.`;
  const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:FROM,to:[ADMIN_EMAIL],subject,text})});
  const payload = await response.json().catch(()=>({})) as {id?:string;message?:string};
  await supabase.from('operations_alert_notifications').update(response.ok?{status:'sent',provider_message_id:payload.id||null,sent_at:new Date().toISOString()}:{status:'failed',error_message:payload.message||`HTTP ${response.status}`}).eq('id',notice.id);
  return json({ok:response.ok,sent:response.ok,status:response.status},response.ok?200:502);
});
