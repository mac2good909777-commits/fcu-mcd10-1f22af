-- ═══════════════════════════════════════════════════════════════════
-- 修正 07：公告／活動／需求／相簿可以選「公開」還是「登入才看得到」
--
-- ⚠️ 先講一個原本就存在、跟畫面說的不一樣的問題：
--    needs_read 的規則是 using (true) —— 也就是【資源交流一直是全公開的】，
--    不登入、甚至不是這班的人，用 anon key 直接打 API 就讀得到全部。
--    但表單上寫「只有登入的同學看得到」。這次一起修掉。
--
-- 為什麼不能只改 RLS 就好：
--    前端讀資料一律用 anon key —— 本專案的 JWT 簽章金鑰是 ECC，
--    PostgREST 解不開我們自己簽的 token（見 patch-01），
--    所以【登入者的讀取在資料庫眼中也是 anon】。
--    只把 RLS 收緊，結果會變成連登入的同學也看不到班內內容。
--    因此：anon 走 PostgREST 只拿得到 public 的，
--          登入者改走 auth 這支 Edge Function 的 feed 動作（service key 讀全部）。
--
-- 預設一律是 class（登入才看得到）。
-- ⛔ 不要把預設設成 public —— 預設值就是大多數人最後的實際設定，
--    設錯的代價是把班內的事情推到全網際網路上。要公開請本人明確去點。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

alter table public.posts  add column if not exists visibility text not null default 'class';
alter table public.needs  add column if not exists visibility text not null default 'class';
alter table public.albums add column if not exists visibility text not null default 'class';

do $$
declare t text;
begin
  foreach t in array array['posts','needs','albums'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_visibility_chk') then
      execute format('alter table public.%I add constraint %I check (visibility in (%L, %L))',
                     t, t || '_visibility_chk', 'public', 'class');
    end if;
  end loop;
end $$;

comment on column public.posts.visibility  is 'public 任何人看得到／class 登入才看得到';
comment on column public.needs.visibility  is 'public 任何人看得到／class 登入才看得到';
comment on column public.albums.visibility is 'public 任何人看得到／class 登入才看得到';

-- ── 讀取規則：走 PostgREST 的一律當成沒登入 ─────────────────────────
-- ⚠️ me_is_officer() 在這裡永遠是 false（沒有可驗證的 JWT），
--    留著只會讓人以為幹部有特權，實際上沒有 —— 拿掉，讓規則說實話。
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
  using (published and visibility = 'public');

drop policy if exists needs_read on public.needs;
create policy needs_read on public.needs for select
  using (visibility = 'public');

drop policy if exists albums_read on public.albums;
create policy albums_read on public.albums for select
  using (visibility = 'public');

-- 照片跟著它所屬的相簿走
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select
  using (exists (select 1 from public.albums a
                 where a.id = photos.album_id and a.visibility = 'public'));

-- ── 寫入函式要收 visibility ─────────────────────────────────────────
create or replace function public.save_need_as(
  p_member bigint, p_id bigint, p_title text, p_body text,
  p_visibility text default 'class'
) returns bigint language plpgsql security definer set search_path = public as $fn$
declare new_id bigint; owner bigint; vis text;
begin
  vis := case when p_visibility = 'public' then 'public' else 'class' end;
  if p_id is null then
    insert into public.needs (cohort, author_id, title, body, visibility)
    select cohort, p_member, p_title, p_body, vis from public.members where id = p_member
    returning id into new_id;
    return new_id;
  end if;
  select author_id into owner from public.needs where id = p_id;
  if owner is distinct from p_member then raise exception '只能修改自己提出的需求'; end if;
  update public.needs set title = p_title, body = p_body, visibility = vis where id = p_id;
  return p_id;
end $fn$;

-- p_data 裡多吃一個 visibility；沒給就維持原值（新建則是 class）
create or replace function public.save_post_as(p_member bigint, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public as $fn$
declare is_off boolean; pid bigint; ch int; vis text;
begin
  select officer <> '' into is_off from public.members where id = p_member;
  if not coalesce(is_off, false) then raise exception '只有幹部可以發布'; end if;
  select cohort into ch from public.members where id = p_member;
  if ch = 0 then ch := 10; end if;
  vis := case when p_data->>'visibility' = 'public' then 'public' else 'class' end;

  pid := nullif(p_data->>'id','')::bigint;
  if pid is null then
    insert into public.posts (cohort, kind, title, body, important, published,
      event_at, time_text, place, speaker, speaker_title, org, fee,
      capacity, reserved_seats, signup_open, waitlist_open,
      deadline, link, required, author_id, visibility)
    values (ch,
      coalesce(p_data->>'kind','notice'), coalesce(p_data->>'title','（未命名）'),
      coalesce(p_data->>'body',''), coalesce((p_data->>'important')::boolean,false),
      coalesce((p_data->>'published')::boolean,true),
      nullif(p_data->>'event_at','')::timestamptz, nullif(p_data->>'time_text',''),
      nullif(p_data->>'place',''), nullif(p_data->>'speaker',''),
      nullif(p_data->>'speaker_title',''), coalesce(nullif(p_data->>'org',''),'班級'),
      nullif(p_data->>'fee',''),
      nullif(p_data->>'capacity','')::int, coalesce((p_data->>'reserved_seats')::int,0),
      coalesce((p_data->>'signup_open')::boolean,false),
      coalesce((p_data->>'waitlist_open')::boolean,false),
      nullif(p_data->>'deadline','')::date, nullif(p_data->>'link',''),
      coalesce((p_data->>'required')::boolean,false), p_member, vis)
    returning id into pid;
    return pid;
  end if;

  update public.posts set
    kind = coalesce(p_data->>'kind', kind),
    title = coalesce(p_data->>'title', title),
    body = coalesce(p_data->>'body', body),
    important = coalesce((p_data->>'important')::boolean, important),
    published = coalesce((p_data->>'published')::boolean, published),
    visibility = vis,
    event_at = nullif(p_data->>'event_at','')::timestamptz,
    time_text = nullif(p_data->>'time_text',''),
    place = nullif(p_data->>'place',''),
    speaker = nullif(p_data->>'speaker',''),
    speaker_title = nullif(p_data->>'speaker_title',''),
    org = coalesce(nullif(p_data->>'org',''), org),
    fee = nullif(p_data->>'fee',''),
    capacity = nullif(p_data->>'capacity','')::int,
    reserved_seats = coalesce((p_data->>'reserved_seats')::int, reserved_seats),
    signup_open = coalesce((p_data->>'signup_open')::boolean, signup_open),
    waitlist_open = coalesce((p_data->>'waitlist_open')::boolean, waitlist_open),
    deadline = nullif(p_data->>'deadline','')::date,
    link = nullif(p_data->>'link',''),
    required = coalesce((p_data->>'required')::boolean, required),
    done_count = coalesce((p_data->>'done_count')::int, done_count)
  where id = pid;
  return pid;
end $fn$;

create or replace function public.save_album_as(p_member bigint, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public as $fn$
declare is_off boolean; aid bigint; ch int; vis text;
begin
  select officer <> '' into is_off from public.members where id = p_member;
  if not coalesce(is_off, false) then raise exception '只有幹部可以建立相簿'; end if;
  select cohort into ch from public.members where id = p_member;
  if ch = 0 then ch := 10; end if;
  vis := case when p_data->>'visibility' = 'public' then 'public' else 'class' end;

  aid := nullif(p_data->>'id','')::bigint;
  if aid is null then
    insert into public.albums (cohort, title, taken_on, cover, link, note, visibility)
    values (ch, coalesce(p_data->>'title','（未命名）'),
            nullif(p_data->>'taken_on','')::date, nullif(p_data->>'cover',''),
            nullif(p_data->>'link',''), nullif(p_data->>'note',''), vis)
    returning id into aid;
    return aid;
  end if;
  update public.albums set
    title = coalesce(p_data->>'title', title),
    taken_on = nullif(p_data->>'taken_on','')::date,
    cover = nullif(p_data->>'cover',''),
    link = nullif(p_data->>'link',''),
    note = nullif(p_data->>'note',''),
    visibility = vis
  where id = aid;
  return aid;
end $fn$;

-- 舊的四參數版本要丟掉，不然 PostgREST 會因為兩個同名函式而不知道要呼叫哪個
drop function if exists public.save_need_as(bigint, bigint, text, text);

do $$
declare f text;
begin
  foreach f in array array[
    'save_need_as(bigint,bigint,text,text,text)',
    'save_post_as(bigint,jsonb)',
    'save_album_as(bigint,jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
