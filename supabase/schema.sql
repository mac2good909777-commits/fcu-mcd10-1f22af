-- ═══════════════════════════════════════════════════════════════════
-- 逢甲大學建設碩士在職學位學程　第十屆同學看板 — 資料庫結構
-- 在 Supabase → SQL Editor 整份貼上執行（可重複執行）
--
-- 架構重點：只有一支 Edge Function（auth）。
--   LINE 登入 → auth 換發 Supabase 格式的 JWT →
--   之後所有讀寫直接走 PostgREST，權限由 RLS 保證。
--   這跟「前端遮蔽」是兩回事：看不到的欄位是資料庫沒吐出來，
--   翻開發者工具也沒有。
--
-- ⛔ 每一張表都要開 RLS。少開一張，那張表就是對全世界開放的。
-- ═══════════════════════════════════════════════════════════════════

-- ── 誰在看：從 JWT 取出身分 ────────────────────────────────────────
-- auth 那支 Edge Function 會把 member_id / cohort / officer 塞進 JWT。
-- ⚠️ 一律用這三個函式判斷身分，不要在政策裡自己解 JWT ——
--    寫錯一次就是一個權限漏洞，集中在這裡才好稽核。
create or replace function public.me_id() returns bigint
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'member_id', '')::bigint
$fn$;

create or replace function public.me_cohort() returns int
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'cohort', '')::int
$fn$;

create or replace function public.me_is_officer() returns boolean
language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'officer', ''), '') <> ''
$fn$;

-- ── 屆別 ───────────────────────────────────────────────────────────
create table if not exists public.cohorts (
  id         int primary key,             -- 10 = 第十屆
  name       text not null,
  year       text not null,
  is_current boolean not null default false
);

-- ── 名冊（公開欄位）────────────────────────────────────────────────
-- ⛔ 這張表只放「未登入也能看」的東西。
--    公司、職稱、學歷、聯絡方式一律在 profiles，不要圖方便塞進來。
create table if not exists public.members (
  id      bigint primary key,
  cohort  int  not null references public.cohorts(id),
  sort    int  not null,                  -- 名冊順序（百位＝組別）
  name    text not null,
  grp     text not null check (grp in ('re','land','smart')),
  officer text not null default '',       -- '' = 一般同學
  status  text not null default ''        -- '' | leave | leave_active
    check (status in ('','leave','leave_active')),
  line_user_id text unique,               -- ⛔ 絕不對外，見下方 v_members
  claimed_at   timestamptz,               -- 認領時間（null = 還沒人綁定）
  created_at   timestamptz not null default now()
);
create index if not exists members_cohort_idx on public.members(cohort, sort);

-- ── 個人資料（每欄位可見範圍）──────────────────────────────────────
-- vis 是 {欄位: 'public'|'alumni'|'class'|'private'}，沒設定就是 class。
create table if not exists public.profiles (
  member_id bigint primary key references public.members(id) on delete cascade,
  nickname text, company text, title text, industry text, tag text,
  headline text, intro text, resource text, wish text, topics text,
  edu_bg   text, web text, line_url text,
  q_why    text, q_thesis text, q_team text,
  phone    text, email text,              -- ⛔ 這兩欄永遠不會 public
  vis      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── 公告 / 問卷 / 活動 ─────────────────────────────────────────────
create table if not exists public.posts (
  id        bigserial primary key,
  cohort    int not null references public.cohorts(id),
  kind      text not null check (kind in ('notice','survey','event')),
  title     text not null,
  body      text not null default '',
  important boolean not null default false,
  published boolean not null default true,     -- false = 幹部草稿
  event_at  timestamptz, time_text text, place text,
  speaker   text, speaker_title text,
  org       text default '班級',
  fee       text,
  capacity  int, reserved_seats int not null default 0,
  signup_open   boolean not null default false,
  waitlist_open boolean not null default false,
  deadline  date, link text,
  required  boolean not null default false,
  done_count int not null default 0,
  author_id bigint references public.members(id),
  created_at timestamptz not null default now()
);
create index if not exists posts_cohort_idx on public.posts(cohort, kind, created_at desc);

-- ── 報名 ───────────────────────────────────────────────────────────
create table if not exists public.signups (
  id        bigserial primary key,
  post_id   bigint not null references public.posts(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  status    text not null default 'ok' check (status in ('ok','wait')),
  note      text,                          -- 飲食禁忌等
  created_at timestamptz not null default now(),
  unique (post_id, member_id)
);

-- ── 報到 ───────────────────────────────────────────────────────────
create table if not exists public.checkins (
  id        bigserial primary key,
  post_id   bigint not null references public.posts(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  lat double precision, lng double precision,  -- ⛔ 只有本人與幹部看得到
  created_at timestamptz not null default now(),
  unique (post_id, member_id)
);

-- 每場活動的報到碼。⛔ 碼本身不對外，只有幹部讀得到。
create table if not exists public.checkin_codes (
  post_id bigint primary key references public.posts(id) on delete cascade,
  code    text not null,
  open    boolean not null default false
);

-- ── 資源交流 ───────────────────────────────────────────────────────
create table if not exists public.needs (
  id        bigserial primary key,
  cohort    int not null references public.cohorts(id),
  author_id bigint not null references public.members(id) on delete cascade,
  title     text not null,
  body      text not null default '',
  done      boolean not null default false,
  helpers   bigint[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ── 相簿 ───────────────────────────────────────────────────────────
create table if not exists public.albums (
  id       bigserial primary key,
  cohort   int not null references public.cohorts(id),
  title    text not null,
  taken_on date,
  cover    text,
  created_at timestamptz not null default now()
);
create table if not exists public.photos (
  id       bigserial primary key,
  album_id bigint not null references public.albums(id) on delete cascade,
  path     text not null,                  -- Storage 內的路徑
  sort     int not null default 0,
  uploader bigint references public.members(id)
);

-- ═══════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════
alter table public.cohorts       enable row level security;
alter table public.members       enable row level security;
alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.signups       enable row level security;
alter table public.checkins      enable row level security;
alter table public.checkin_codes enable row level security;
alter table public.needs         enable row level security;
alter table public.albums        enable row level security;
alter table public.photos        enable row level security;

drop policy if exists cohorts_read on public.cohorts;
create policy cohorts_read on public.cohorts for select using (true);

-- ⛔ members 這張表【不開 select】—— 裡面有 line_user_id。
--    對外只開 v_members 這個 view，它不含該欄位。
--    用「整張表不給查」比逐欄授權保險：以後有人加新欄位也不會不小心外洩。
drop policy if exists members_self_update on public.members;
create policy members_self_update on public.members
  for update using (id = public.me_id()) with check (id = public.me_id());

-- profiles：本人可讀寫自己那一列。看別人一律走 visible_profiles()。
drop policy if exists profiles_self_all on public.profiles;
create policy profiles_self_all on public.profiles
  for all using (member_id = public.me_id()) with check (member_id = public.me_id());

-- 公告活動：已發布的公開可讀；未發布只有幹部看得到
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
  using (published or public.me_is_officer());
drop policy if exists posts_officer_write on public.posts;
create policy posts_officer_write on public.posts for all
  using (public.me_is_officer()) with check (public.me_is_officer());

-- 報名：本人可讀寫自己的；幹部可讀全部。
-- ⛔ 一般同學【讀不到別人報名了沒】—— 人數走 v_post_seats，那只吐數字。
drop policy if exists signups_self on public.signups;
create policy signups_self on public.signups for all
  using (member_id = public.me_id()) with check (member_id = public.me_id());
drop policy if exists signups_officer_read on public.signups;
create policy signups_officer_read on public.signups for select
  using (public.me_is_officer());

-- 報到：本人可讀自己的、幹部可讀寫全部。定位只有這兩種人看得到。
drop policy if exists checkins_self on public.checkins;
create policy checkins_self on public.checkins for select
  using (member_id = public.me_id() or public.me_is_officer());
drop policy if exists checkins_officer_write on public.checkins;
create policy checkins_officer_write on public.checkins for all
  using (public.me_is_officer()) with check (public.me_is_officer());

-- 報到碼：只有幹部。⛔ 讓一般人看到碼，就等於可以代人簽到。
drop policy if exists codes_officer on public.checkin_codes;
create policy codes_officer on public.checkin_codes for all
  using (public.me_is_officer()) with check (public.me_is_officer());

-- 資源交流：公開可讀；本人可改自己的；幹部可刪
drop policy if exists needs_read on public.needs;
create policy needs_read on public.needs for select using (true);
drop policy if exists needs_self on public.needs;
create policy needs_self on public.needs for all
  using (author_id = public.me_id() or public.me_is_officer())
  with check (author_id = public.me_id() or public.me_is_officer());

-- 相簿：公開可讀；幹部可建相簿；登入的同學可傳照片
drop policy if exists albums_read on public.albums;
create policy albums_read on public.albums for select using (true);
drop policy if exists albums_officer on public.albums;
create policy albums_officer on public.albums for all
  using (public.me_is_officer()) with check (public.me_is_officer());
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select using (true);
drop policy if exists photos_write on public.photos;
create policy photos_write on public.photos for all
  using (public.me_id() is not null) with check (public.me_id() is not null);

-- ═══════════════════════════════════════════════════════════════════
-- View / RPC
-- ═══════════════════════════════════════════════════════════════════

-- 公開名冊：⛔ 不含 line_user_id
create or replace view public.v_members as
  select id, cohort, sort, name, grp, officer, status,
         (claimed_at is not null) as claimed
  from public.members;

-- 席次：只吐【數字】，不吐是誰。未登入也能看。
create or replace view public.v_post_seats as
  select p.id as post_id, p.capacity, p.reserved_seats,
         count(s.id) filter (where s.status = 'ok')   as taken,
         count(s.id) filter (where s.status = 'wait') as waiting
  from public.posts p
  left join public.signups s on s.post_id = p.id
  where p.published
  group by p.id, p.capacity, p.reserved_seats;

-- ── 個人資料的可見範圍 ─────────────────────────────────────────────
-- ⛔ 這是整套系統最關鍵的一段。
--    RLS 只能控「整列」，控不了「哪一欄給誰看」，
--    所以用 SECURITY DEFINER 的函式在資料庫裡把看不到的欄位直接拿掉。
--    前端拿到的就已經是遮好的資料 —— 不是前端自己決定要不要顯示。
create or replace function public.mask_profile(p public.profiles, m public.members)
returns jsonb language plpgsql stable as $fn$
declare
  viewer_rank int;
  out_json jsonb := '{}'::jsonb;
  k text;
  v text;
  field_vis text;
  need_rank int;
begin
  -- 看的人的等級：本人 9 > 同屆 2 > 跨屆校友 1 > 未登入 0
  viewer_rank := case
    when public.me_id() = m.id then 9
    when public.me_id() is null then 0
    when public.me_cohort() is distinct from m.cohort then 1
    else 2 end;

  foreach k in array array['nickname','company','title','industry','tag','headline',
                           'intro','resource','wish','topics','edu_bg','web','line_url',
                           'q_why','q_thesis','q_team','phone','email']
  loop
    v := to_jsonb(p) ->> k;
    if v is null or v = '' then continue; end if;

    field_vis := coalesce(p.vis ->> k, 'class');

    -- ⛔ 電話與 Email 不接受 public/alumni：只給同屆同學與本人。
    --    就算本人手滑設成公開，這裡也要擋下來。
    if k in ('phone','email') and field_vis in ('public','alumni') then
      field_vis := 'class';
    end if;

    need_rank := case field_vis
      when 'public' then 0
      when 'alumni' then 1
      when 'class'  then 2
      else 9 end;                       -- private：只有本人

    if viewer_rank >= need_rank then
      out_json := out_json || jsonb_build_object(k, v);
    end if;
  end loop;

  -- 只有本人看得到自己的可見範圍設定（畫面上的小標籤要用）
  if viewer_rank = 9 then
    out_json := out_json || jsonb_build_object('vis', p.vis);
  end if;
  return out_json;
end $fn$;

create or replace function public.visible_profiles()
returns table (member_id bigint, data jsonb)
language sql stable security definer set search_path = public as $fn$
  select m.id, public.mask_profile(p, m)
  from public.members m
  join public.profiles p on p.member_id = m.id
$fn$;

-- ── 報名：名額與候補在資料庫判斷 ───────────────────────────────────
-- ⛔ 不能讓前端決定「還有沒有位子」——
--    兩個人同時按報名，前端各自看到「還剩 1 位」，就會超賣。
create or replace function public.join_event(p_post_id bigint, p_note text default null)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  me bigint := public.me_id();
  cap int; res int; taken int; st text;
begin
  if me is null then raise exception '請先登入'; end if;

  select capacity, reserved_seats into cap, res
  from public.posts
  where id = p_post_id and published and signup_open
  for update;
  if not found then raise exception '這場活動沒有開放報名'; end if;

  select count(*) into taken
  from public.signups where post_id = p_post_id and status = 'ok';

  if cap is null or taken < cap - res then st := 'ok'; else st := 'wait'; end if;

  insert into public.signups (post_id, member_id, status, note)
  values (p_post_id, me, st, p_note)
  on conflict (post_id, member_id) do update set note = excluded.note
  returning status into st;
  return st;
end $fn$;

-- 取消報名，並把候補第一位遞補上來
create or replace function public.leave_event(p_post_id bigint)
returns void language plpgsql security definer set search_path = public as $fn$
declare me bigint := public.me_id(); promote bigint;
begin
  if me is null then raise exception '請先登入'; end if;
  delete from public.signups where post_id = p_post_id and member_id = me;

  select id into promote from public.signups
  where post_id = p_post_id and status = 'wait'
  order by created_at limit 1;
  if promote is not null then
    update public.signups set status = 'ok' where id = promote;
  end if;
end $fn$;

-- 現場報到：比對報到碼。⛔ 碼不出資料庫，前端只送使用者輸入的字串。
create or replace function public.do_checkin(p_post_id bigint, p_code text,
                                             p_lat double precision default null,
                                             p_lng double precision default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare me bigint := public.me_id(); ok boolean;
begin
  if me is null then raise exception '請先登入'; end if;
  select (open and upper(btrim(code)) = upper(btrim(p_code))) into ok
  from public.checkin_codes where post_id = p_post_id;
  if not coalesce(ok, false) then
    raise exception '報到碼不對，或這場還沒開放報到';
  end if;

  insert into public.checkins (post_id, member_id, lat, lng)
  values (p_post_id, me, p_lat, p_lng)
  on conflict (post_id, member_id) do nothing;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════
-- 權限：實體表一律不給 anon，只開 view 與 rpc
-- ═══════════════════════════════════════════════════════════════════
grant usage on schema public to anon, authenticated;
grant select on public.cohorts, public.posts, public.needs, public.albums, public.photos
  to anon, authenticated;
grant select on public.v_members, public.v_post_seats to anon, authenticated;
grant all    on public.profiles, public.signups, public.checkins to authenticated;
grant all    on public.posts, public.needs, public.albums, public.photos, public.checkin_codes
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.visible_profiles() to anon, authenticated;
grant execute on function public.join_event(bigint, text) to authenticated;
grant execute on function public.leave_event(bigint) to authenticated;
grant execute on function public.do_checkin(bigint, text, double precision, double precision)
  to authenticated;
