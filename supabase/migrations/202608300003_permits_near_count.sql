-- Companion to permits_near(): the total number of permits in the same radius /
-- time / filter window, without the 500-row cap. The API calls both so the
-- count bar can say "500 of ~1,240 — closest first" when the marker set is
-- truncated. Same bounding-box prefilter and haversine test as permits_near, no
-- ORDER BY / LIMIT.

create or replace function permits_near_count(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1609.34,
  p_since date default null,
  p_work_classes text[] default null,
  p_min_valuation numeric default null
)
returns integer
language sql
stable
as $$
  with bounds as (
    select
      p_radius_m / 111320.0 as lat_delta,
      p_radius_m / (111320.0 * greatest(cos(radians(p_lat)), 0.000001)) as lng_delta
  )
  select count(*)::integer
  from permits p, bounds b
  where p.latitude is not null
    and p.longitude is not null
    and p.latitude between p_lat - b.lat_delta and p_lat + b.lat_delta
    and p.longitude between p_lng - b.lng_delta and p_lng + b.lng_delta
    and (p_since is null or p.issue_date >= p_since)
    and (p_work_classes is null or p.work_class = any(p_work_classes))
    and (p_min_valuation is null or p.total_job_valuation >= p_min_valuation)
    and 2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(p.latitude)) *
      power(sin(radians(p.longitude - p_lng) / 2), 2)
    )) <= p_radius_m;
$$;
