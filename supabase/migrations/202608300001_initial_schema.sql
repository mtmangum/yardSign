-- Yard Sign: Austin development activity near an address.
-- v1 covers issued construction permits only. Site plan and zoning cases get
-- their own tables later; keep permit-specific columns out of shared concepts.

create table if not exists permits (
  id uuid primary key default gen_random_uuid(),
  city_code text not null default 'AUS',

  -- Source identity. permit_number is unique per city in the Austin feed.
  permit_number text not null,
  project_id text,
  master_permit_number text,
  tcad_id text,

  -- Classification
  permit_type text,
  permit_type_desc text,
  permit_class text,
  permit_class_mapped text,
  work_class text,
  description text,

  -- Location. The Austin feed ships no coordinates, so lat/long start null
  -- and are filled by the Census geocoder pass.
  address text,
  zip_code text,
  council_district integer,
  latitude double precision,
  longitude double precision,
  geocode_status text not null default 'pending'
    check (geocode_status in ('pending', 'matched', 'no_match', 'failed')),
  geocode_attempted_at timestamptz,

  -- Dates
  applied_date date,
  issue_date date,
  status_current text,
  status_date date,

  -- Scale signals, used for filtering and for ranking what is worth an alert.
  total_job_valuation numeric,
  total_new_add_sqft numeric,
  housing_units integer,
  number_of_floors integer,

  source_url text,
  source_payload jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),

  constraint permits_city_permit_number_key unique (city_code, permit_number)
);

create index if not exists permits_issue_date_idx on permits (issue_date desc);
create index if not exists permits_lat_lng_idx on permits (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists permits_geocode_status_idx on permits (geocode_status)
  where geocode_status = 'pending';
create index if not exists permits_work_class_idx on permits (work_class);
create index if not exists permits_council_district_idx on permits (council_district);

create table if not exists data_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null,
  retrieved_at timestamptz not null default now(),
  row_count integer,
  status text not null default 'success',
  message text
);

-- Cursor-paginated geocode queue. route_number gives the background function a
-- stable `after` cursor, matching the ScoreScout geocoding pattern.
create or replace view permits_needing_geocode as
select
  row_number() over (order by issue_date desc nulls last, permit_number) as route_number,
  id,
  permit_number,
  address,
  zip_code
from permits
where geocode_status = 'pending'
  and address is not null
  and address <> '';

-- Radius search. Haversine in SQL keeps this dependency-free (no PostGIS) and
-- is fast enough at Austin's row counts because the bounding box prefilter
-- uses permits_lat_lng_idx before any trig runs.
create or replace function permits_near(
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
    p.id, p.permit_number, p.permit_type_desc, p.permit_class_mapped, p.work_class,
    p.description, p.address, p.issue_date, p.applied_date, p.status_current,
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

-- Reads go through the Netlify functions using the service key, so no anon
-- policies are defined. RLS on with zero policies denies anon by default.
alter table permits enable row level security;
alter table data_sources enable row level security;
