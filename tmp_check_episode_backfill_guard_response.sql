select
  id,
  status_code,
  timed_out,
  error_msg,
  left(content, 4000) as content_sample,
  created
from net._http_response
where created > now() - interval '10 minutes'
order by id desc
limit 10;
