-- ═══════════════════════════════════════════════════════════════════
-- 修正 06：讓「資源交流」「活動」「相簿」真的能寫
--
-- 這三塊之前只有畫面沒有寫入功能，按發布只會跳提示。
--
-- ⚠️ 寫入一律走 auth 這支 Edge Function（由它驗身分後用 service key 執行），
--    不是讓前端直接打 PostgREST —— 這個專案的 JWT 簽章金鑰是 ECC，
--    PostgREST 解不開我們發的 token（見 patch-01 的說明）。
--    所以這裡的函式跟 join_event_as 一樣，都是「呼叫端明確傳入是誰」，
--    ⛔ 也因此一律只授權給 service_role。
--
-- 相簿改成掛 Google 相簿連結，不自己存照片：
--   班上本來就會用 Google 相簿，再做一套上傳只是多一個要維護的東西，
--   而且 Supabase 免費方案 1GB，一次聚餐的原始照片就吃掉一大半。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

alter table public.albums
  add column if not exists link text,
  add column if not exists note text;

comment on column public.albums.link is 'Google 相簿的共用連結';

-- ── 資源交流：本人可以新增與修改自己的，幹部可以刪 ─────────────────
create or replace function public.save_need_as(
  p_member bigint, p_id bigint, p_title text, p_body text
) returns bigint language plpgsql security definer set search_path = public as $fn$
declare new_id bigint; owner bigint;
begin
  if p_id is null then
    insert into public.needs (cohort, author_id, title, body)
    select cohort, p_member, p_title, p_body from public.members where id = p_member
    returning id into new_id;
    return new_id;
  end if;
  -- ⛔ 改別人的一律擋掉，不能只靠前端不顯示編輯鈕
  select author_id into owner from public.needs where id = p_id;
  if owner is distinct from p_member then raise exception '只能修改自己提出的需求'; end if;
  update public.needs set title = p_title, body = p_body where id = p_id;
  return p_id;
end $fn$;

create or replace function public.close_need_as(
  p_member bigint, p_id bigint, p_done boolean, p_helpers bigint[] default '{}'
) returns void language plpgsql security definer set search_path = public as $fn$
declare owner bigint;
begin
  select author_id into owner from public.needs where id = p_id;
  if owner is distinct from p_member then raise exception '只有提出的人可以標記解決'; end if;
  update public.needs set done = p_done, helpers = p_helpers where id = p_id;
end $fn$;

create or replace function public.delete_need_as(p_member bigint, p_id bigint)
returns void language plpgsql security definer set search_path = public as $fn$
declare owner bigint; is_off boolean;
begin
  select author_id into owner from public.needs where id = p_id;
  select officer <> '' into is_off from public.members where id = p_member;
  if owner is distinct from p_member and not coalesce(is_off, false) then
    raise exception '只能刪自己提出的需求';
  end if;
  delete from public.needs where id = p_id;
end $fn$;

-- ── 公告 / 問卷 / 活動：只有幹部 ───────────────────────────────────
create or replace function public.save_post_as(p_member bigint, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public as $fn$
declare is_off boolean; pid bigint; ch int;
begin
  select officer <> '' into is_off from public.members where id = p_member;
  if not coalesce(is_off, false) then raise exception '只有幹部可以發布'; end if;
  select cohort into ch from public.members where id = p_member;
  if ch = 0 then ch := 10; end if;      -- 師長發布時掛在本屆

  pid := nullif(p_data->>'id','')::bigint;
  if pid is null then
    insert into public.posts (cohort, kind, title, body, important, published,
      event_at, time_text, place, speaker, speaker_title, org, fee,
      capacity, reserved_seats, signup_open, waitlist_open,
      deadline, link, required, author_id)
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
      coalesce((p_data->>'required')::boolean,false), p_member)
    returning id into pid;
    return pid;
  end if;

  update public.posts set
    kind = coalesce(p_data->>'kind', kind),
    title = coalesce(p_data->>'title', title),
    body = coalesce(p_data->>'body', body),
    important = coalesce((p_data->>'important')::boolean, important),
    published = coalesce((p_data->>'published')::boolean, published),
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

create or replace function public.delete_post_as(p_member bigint, p_id bigint)
returns void language plpgsql security definer set search_path = public as $fn$
declare is_off boolean;
begin
  select officer <> '' into is_off from public.members where id = p_member;
  if not coalesce(is_off, false) then raise exception '只有幹部可以刪除'; end if;
  delete from public.posts where id = p_id;
end $fn$;

-- ── 相簿：只有幹部；存的是 Google 相簿連結 ─────────────────────────
create or replace function public.save_album_as(p_member bigint, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public as $fn$
declare is_off boolean; aid bigint; ch int;
begin
  select officer <> '' into is_off from public.members where id = p_member;
  if not coalesce(is_off, false) then raise exception '只有幹部可以建立相簿'; end if;
  select cohort into ch from public.members where id = p_member;
  if ch = 0 then ch := 10; end if;

  aid := nullif(p_data->>'id','')::bigint;
  if aid is null then
    insert into public.albums (cohort, title, taken_on, cover, link, note)
    values (ch, coalesce(p_data->>'title','（未命名）'),
            nullif(p_data->>'taken_on','')::date, nullif(p_data->>'cover',''),
            nullif(p_data->>'link',''), nullif(p_data->>'note',''))
    returning id into aid;
    return aid;
  end if;
  update public.albums set
    title = coalesce(p_data->>'title', title),
    taken_on = nullif(p_data->>'taken_on','')::date,
    cover = nullif(p_data->>'cover',''),
    link = nullif(p_data->>'link',''),
    note = nullif(p_data->>'note','')
  where id = aid;
  return aid;
end $fn$;

create or replace function public.delete_album_as(p_member bigint, p_id bigint)
returns void language plpgsql security definer set search_path = public as $fn$
declare is_off boolean;
begin
  select officer <> '' into is_off from public.members where id = p_member;
  if not coalesce(is_off, false) then raise exception '只有幹部可以刪除'; end if;
  delete from public.albums where id = p_id;
end $fn$;

-- ⛔ 全部只給 service_role：這些函式都吃「呼叫端說我是誰」，
--    開放給前端等於任何人都能冒充幹部發公告。
do $$
declare f text;
begin
  foreach f in array array[
    'save_need_as(bigint,bigint,text,text)',
    'close_need_as(bigint,bigint,boolean,bigint[])',
    'delete_need_as(bigint,bigint)',
    'save_post_as(bigint,jsonb)',
    'delete_post_as(bigint,bigint)',
    'save_album_as(bigint,jsonb)',
    'delete_album_as(bigint,bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ── 組代表改用完整組名 ─────────────────────────────────────────────
-- ⚠️ 前端 OFFICER_DESC 與排序是用 officer 這個字串當 key 對應，
--    資料庫沒一起改，說明就會對不上而不顯示。
update public.members set officer = '不動產經營管理組代'       where officer = '不動產組代';
update public.members set officer = '國土城鄉規劃與運輸管理組代' where officer = '國土運輸組代';
update public.members set officer = '智慧城市與營建防災組代'     where officer = '智慧防災組代';
