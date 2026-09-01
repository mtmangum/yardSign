-- Filterable permit kinds.
--
-- The sidebar's Demolition / New / Remodel / Other chips become toggles. For the
-- filter to be honest the map has to re-sample with it applied (a demolition-only
-- view otherwise shows the ~4 demolitions that happened to land in the grid
-- sample), so the filter lives in SQL, not the client.
--
-- `permit_kind_of()` mirrors src/lib/permitKind.ts. It is IMMUTABLE and feeds a
-- STORED generated column, so `kind` is computed on every insert/upsert with no
-- importer change. NOTE: replacing this function later does NOT recompute `kind`
-- for existing rows - follow such a change with `UPDATE permits SET kind = kind`.

create or replace function permit_kind_of(p_work_class text, p_permit_class text)
returns text
language sql
immutable
as $$
  select case
    -- permit_class carries an explicit structural-demolition signal work_class
    -- cannot (it lumps teardowns with "Interior Demo Non-Structural").
    when position('demolition' in lower(coalesce(p_permit_class, ''))) > 0 then 'demolition'
    else (
      with w as (
        select btrim(regexp_replace(lower(coalesce(p_work_class, '')), '\s+', ' ', 'g')) as v
      )
      select case
        when (select v from w) = '' then 'other'
        when (select v from w) in ('new', 'shell', 'homebuilder loop') then 'new'
        when (select v from w) in ('demolition', 'demo') then 'demolition'
        when (select v from w) in (
          'remodel', 'repair', 'addition', 'addition and remodel',
          'remodel mobile home', 'interior demo non-structural'
        ) then 'remodel'
        when (select v from w) in (
          'change out', 'upgrade', 'irrigation', 'wall', 'auxiliary power',
          'auxiliary water', 'special inspections program', 'temporary loop',
          'fireline', 'freestanding', 'projecting', 'awning', 'roof', 'relocation',
          'modification', 'plumbing service line', 'plumbing utility connection',
          'grease interceptor (gi) replacement', 'cut over/tank abandonment'
        ) then 'other'
        -- unknown value: substring fallbacks, interior-demo exclusion first
        when position('interior demo' in (select v from w)) > 0
          or position('non-structural' in (select v from w)) > 0 then 'remodel'
        when position('demolition' in (select v from w)) > 0
          or position('demo' in (select v from w)) > 0 then 'demolition'
        when (select v from w) ~ 'remodel|renovation|addition|repair|alteration' then 'remodel'
        when position('shell' in (select v from w)) > 0
          or (select v from w) ~ '\mnew\M' then 'new'
        else 'other'
      end
    )
  end
$$;

alter table permits
  add column if not exists kind text
  generated always as (permit_kind_of(work_class, permit_class)) stored;

-- Recreate the three read functions with a p_kinds filter. Adding a parameter
-- changes the signature, so drop first.

drop function if exists permits_near(
  double precision, double precision, double precision, date, text[], numeric, integer
);
drop function if exists permits_near_map(
  double precision, double precision, double precision, date, text[], numeric, integer
);
drop function if exists permits_near_count(
  double precision, double precision, double precision, date, text[], numeric
);

create function permits_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1609.34,
  p_since date default null,
  p_work_classes text[] default null,
  p_min_valuation numeric default null,
  p_limit integer default 500,
  p_kinds text[] default null
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
    and (p_kinds is null or p.kind = any(p_kinds))
    and 2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(p.latitude)) *
      power(sin(radians(p.longitude - p_lng) / 2), 2)
    )) <= p_radius_m
  order by distance_m
  limit least(greatest(p_limit, 1), 2000);
$$;

create function permits_near_count(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1609.34,
  p_since date default null,
  p_work_classes text[] default null,
  p_min_valuation numeric default null,
  p_kinds text[] default null
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
    and (p_kinds is null or p.kind = any(p_kinds))
    and 2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(p.latitude)) *
      power(sin(radians(p.longitude - p_lng) / 2), 2)
    )) <= p_radius_m;
$$;

create function permits_near_map(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1609.34,
  p_since date default null,
  p_work_classes text[] default null,
  p_min_valuation numeric default null,
  p_limit integer default 1000,
  p_kinds text[] default null
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
      p.work_class, left(p.description, 300) as description, p.address, p.issue_date,
      p.applied_date, p.status_current, p.total_job_valuation, p.housing_units,
      p.latitude, p.longitude, p.source_url,
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
      and (p_kinds is null or p.kind = any(p_kinds))
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
