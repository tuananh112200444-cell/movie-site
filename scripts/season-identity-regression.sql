do $$
declare a movies%rowtype; b movies%rowtype; first_id uuid; second_id uuid; r record;
begin
 a.type:='series'; a.name:='Fixture (Phần 1)'; a.season_number:=1; a.season_scope:='unknown';a.tmdb_id:=2147000001;
 b:=a;b.name:='Fixture (Season 2)';b.season_number:=2;
 if private.movie_boundary_matches_json(a,to_jsonb(b)) then raise exception 'cross-season accepted';end if;
 b:=a;b.season_number:=null;b.name:='Fixture';
 if private.movie_boundary_matches_json(a,to_jsonb(b)) then raise exception 'unknown treated as season one';end if;
 b:=a;b.season_scope:='aggregate';b.name:='Fixture';b.season_number:=null;
 if private.movie_boundary_matches_json(a,to_jsonb(b)) then raise exception 'aggregate treated as season';end if;
 b:=a;b.name:='Fixture Phần 2';
 if private.movie_boundary_matches_json(a,to_jsonb(b)) then raise exception 'conflict accepted';end if;
 b:=a;
 if not private.movie_boundary_matches_json(a,to_jsonb(b)) then raise exception 'same season rejected';end if;
 if canonical_season_number('A S02',null)<>2 or canonical_season_number('A Part 3',null)<>3 then raise exception 'compact season parsing';end if;
 select * into r from resolve_canonical_movie('seasonreg','fixture-one','','2147000001','','Fixture Season 1','Fixture Phần 1',2018,'series',1,'season-reg-one','Test');first_id:=r.movie_id;
 select * into r from resolve_canonical_movie('seasonreg','fixture-two','','2147000001','','Fixture Season 2','Fixture Phần 2',2018,'series',2,'season-reg-two','Test');second_id:=r.movie_id;
 if first_id=second_id then raise exception 'resolver shared TMDB merged two seasons';end if;
 -- Deliberately corrupt the old provider link; resolution must not trust it.
 update provider_movie_identities set movie_id=first_id where provider='seasonreg' and provider_slug='fixture-two';
 select * into r from resolve_canonical_movie('seasonreg','fixture-two','','2147000001','','Fixture Season 2','Fixture Phần 2',2018,'series',2,'season-reg-two','Test');
 if r.movie_id<>second_id then raise exception 'poisoned provider binding won';end if;
 begin
  perform * from resolve_canonical_movie('seasonreg','fixture-conflict','','2147000001','','Fixture Season 2','Fixture Phần 1',2018,'series',1,'season-reg-conflict','Test');
  raise exception 'conflicting payload accepted';
 exception when raise_exception then
  if sqlerrm='conflicting payload accepted' then raise;end if;
 end;
 raise notice 'SQL season identity regression passed';
end;$$;
