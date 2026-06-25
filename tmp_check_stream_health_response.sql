select
  id,
  status_code,
  timed_out,
  error_msg,
  left(content, 5000) as content_sample,
  created
from net._http_response
where created > now() - interval '10 minutes'
  and (
    content like '%stream-health%'
    or content like '%"checked"%'
    or content like '%health_status%'
    or content like '%PGRST%'
    or status_code >= 400
  )
order by id desc
limit 10;
