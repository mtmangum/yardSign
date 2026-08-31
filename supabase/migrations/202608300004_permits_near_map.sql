-- A geographically distributed companion to permits_near(). The nearest-first
-- function is right for the sidebar, but a hard row cap makes a dense center
-- consume every map marker and leaves a misleading empty ring near the search
-- perimeter. Divide the bounds into a 16x16 grid and take a few recent permits
-- from every occupied cell before applying the cap.

create function permits_near_map(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1609.34,
  p_since date default null,
  p_work_classes text[] default null,
  p_min_valuation numeric default null,
  p_limit integer default 1000
)
returns table (
  id uuid, permit_number text, permit_type_desc text, permit_class text,
  permit_class_mapped text, work_class text, description text, address text,
  issue_date date, applied_date date, status_current text,
  total_job_valuation numeric, housing_units integer, latitude double precision,
  longitude double precision, source_url text, distance_m double precision
)
language sql
stable
as $$
  with bounds as (
    select
      p_radius_m / 111320.0 as lat_delta,
      p_radius_m / (111320.0 * greatest(cos(radians(p_lat)), 0.000001)) as lng_delta
  ), candidates as (
    select
      p.id, p.permit_number, p.permit_type_desc, p.permit_class, p.permit_class_mapped,
      p.work_class, p.description, p.address, p.issue_date, p.applied_date, p.status_current,
      p.total_job_valuation, p.housing_units, p.latitude, p.longitude, p.source_url,
      2 * 6371000 * asin(sqrt(
        power(sin(radians(p.latitude - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(p.latitude)) *
        power(sin(radians(p.longitude - p_lng) / 2), 2)
      )) as distance_m,
      floor((p.latitude - (p_lat - b.lat_delta)) / ((2 * b.lat_delta) / 16)) as grid_y,
      floor((p.longitude - (p_lng - b.lng_delta)) / ((2 * b.lng_delta) / 16)) as grid_x
    from permits p, bounds b
    where p.latitude is not null
      and p.longitude is not null
      and p.latitude between p_lat - b.lat_delta and p_lat + b.lat_delta
      and p.longitude between p_lng - b.lng_delta and p_lng + b.lng_delta
      and (p_since is null or p.issue_date >= p_since)
      and (p_work_classes is null or p.work_class = any(p_work_classes))
      and (p_min_valuation is null or p.total_job_valuation >= p_min_valuation)
  ), inside_radius as (
    select * from candidates c where c.distance_m <= p_radius_m
  ), ranked as (
    select inside_radius.*,
      row_number() over (
        partition by grid_x, grid_y
        order by inside_radius.issue_date desc nulls last, inside_radius.id
      ) as cell_rank
    from inside_radius
  )
  select
    r.id, r.permit_number, r.permit_type_desc, r.permit_class, r.permit_class_mapped,
    r.work_class, r.description, r.address, r.issue_date, r.applied_date, r.status_current,
    r.total_job_valuation, r.housing_units, r.latitude, r.longitude, r.source_url,
    r.distance_m
  from ranked r
  where r.cell_rank <= greatest(1, ceil(least(greatest(p_limit, 1), 1000) / 256.0))
  order by r.distance_m
  limit least(greatest(p_limit, 1), 1000);
$$;
