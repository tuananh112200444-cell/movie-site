select
  id,
  status_code,
  timed_out,
  error_msg,
  left(content, 6000) as content_sample,
  created
from net._http_response
where created > now() - interval '15 minutes'
  and content like '%"calls"%'
order by id desc
limit 5;
