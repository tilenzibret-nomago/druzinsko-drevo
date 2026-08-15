-- Družinsko drevo — osnovna shema
-- Aplicirano na Supabase projekt: kzwxmvhrxecfmtaskzxb

-- OSEBE
create table people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  maiden_name text,
  gender text check (gender in ('M','F','O')),
  birth_date date,
  birth_date_approx boolean default false,
  death_date date,
  is_deceased boolean default false,
  birth_place text,
  bio text,
  photo_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- PARTNERSTVA / ZAKONI (ločeno od starševstva)
create table partnerships (
  id uuid primary key default gen_random_uuid(),
  person1_id uuid references people(id) on delete cascade,
  person2_id uuid references people(id) on delete cascade,
  type text check (type in ('marriage','partnership','divorced')),
  start_date date,
  end_date date,
  notes text
);

-- STARŠI-OTROCI (podpira posvojitve, poltrbratje/sestre)
create table parent_child (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references people(id) on delete cascade,
  child_id uuid references people(id) on delete cascade,
  relation_type text check (relation_type in ('biological','adoptive','step')) default 'biological',
  unique(parent_id, child_id)
);

-- MEDIJI (fotke/dokumenti)
create table media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption text,
  taken_date date,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table media_people (
  media_id uuid references media(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  primary key (media_id, person_id)
);

-- RLS: dostop samo za prijavljene (povabljene) družinske člane
alter table people enable row level security;
alter table partnerships enable row level security;
alter table parent_child enable row level security;
alter table media enable row level security;
alter table media_people enable row level security;

create policy "authenticated can read people" on people for select using (auth.role() = 'authenticated');
create policy "authenticated can insert people" on people for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update people" on people for update using (auth.role() = 'authenticated');
create policy "authenticated can delete people" on people for delete using (auth.role() = 'authenticated');

create policy "authenticated can read partnerships" on partnerships for select using (auth.role() = 'authenticated');
create policy "authenticated can insert partnerships" on partnerships for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update partnerships" on partnerships for update using (auth.role() = 'authenticated');
create policy "authenticated can delete partnerships" on partnerships for delete using (auth.role() = 'authenticated');

create policy "authenticated can read parent_child" on parent_child for select using (auth.role() = 'authenticated');
create policy "authenticated can insert parent_child" on parent_child for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update parent_child" on parent_child for update using (auth.role() = 'authenticated');
create policy "authenticated can delete parent_child" on parent_child for delete using (auth.role() = 'authenticated');

create policy "authenticated can read media" on media for select using (auth.role() = 'authenticated');
create policy "authenticated can insert media" on media for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update media" on media for update using (auth.role() = 'authenticated');
create policy "authenticated can delete media" on media for delete using (auth.role() = 'authenticated');

create policy "authenticated can read media_people" on media_people for select using (auth.role() = 'authenticated');
create policy "authenticated can insert media_people" on media_people for insert with check (auth.role() = 'authenticated');
create policy "authenticated can delete media_people" on media_people for delete using (auth.role() = 'authenticated');
