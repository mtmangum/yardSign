-- Add permit_class to permits_near()'s output.
--
-- permit_class is the city's structural classification and carries an explicit
-- demolition signal - "R- 645 Demolition One Family Homes", "C- 649 Demolition
-- All Other Bldgs Com", etc. - that the free-text work_class does not: work_class
-- lumps "Demolition" together with "Interior Demo Non-Structural" (the gut phase
-- of a remodel, not a teardown). Exposing permit_class lets permitKind() key the
-- demolition bucket on "a building is coming down" rather than a substring match.
--
-- Changing a function's RETURNS TABLE shape requires a drop first.

drop function if exists permits_near(
  double precision, double precision, double precision, date, text[], numeric, integer
);

create function permits_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1609.34,
  p_since date default null,
  p_work_classes text[] default null,
  p_min_valuation numeric default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  permit_number text,
  permit_type_desc text,
  permit_class text,
  permit_class_mapped text,
  work_class text,
  description text,
  address text,
  issue_date date,
  applied_date date,
  status_current text,
  total_job_valuation numeric,
  housing_units integer,
  latitude double precision,
  longitude double precision,
  source_url text,
  distance_m double precision
)
language sql
stable
as $$
  with bounds as (
    select
      p_radius_m / 111320.0 as lat_delta,
      p_radius_m / (111320.0 * greatest(cos(radians(p_lat)), 0.000001)) as lng_delta
  )
  select
    p.id, p.permit_number, p.permit_type_desc, p.permit_class, p.permit_class_mapped,
    p.work_class, p.description, p.address, p.issue_date, p.applied_date, p.status_current,
    p.total_job_valuation, p.housing_units, p.latitude, p.longitude, p.source_url,
    2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(p.latitude)) *
      power(sin(radians(p.longitude - p_lng) / 2), 2)
    )) as distance_m
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
    )) <= p_radius_m
  order by distance_m
  limit least(greatest(p_limit, 1), 2000);
$$;
