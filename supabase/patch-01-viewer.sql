-- ═══════════════════════════════════════════════════════════════════
-- 修正 01：可見範圍改由呼叫端指定「誰在看」
--
-- 為什麼要改：
--   原本 mask_profile() 從 request.jwt.claims 取得身分，前提是
--   PostgREST 認得我們發的 token。但這個專案的 JWT 簽章金鑰是
--   ECC(P-256)，我們手上只有 legacy 的 HS256 共用密鑰，PostgREST
--   解不開 → 每個查詢都 401（PGRST301 No suitable key）。
--
--   所以改成：需要身分的操作一律走 auth 這支 Edge Function，
--   由它驗完 token 之後，用 service key 呼叫這裡並【明確傳入 viewer】。
--
-- ⛔ 正因為 viewer 是參數，這支函式【只能給 service_role 執行】。
--    對 anon/authenticated 開放的話，任何人都能自稱是任何人，
--    整套可見範圍就形同虛設。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

-- 舊版簽章不同，要先移除
drop function if exists public.visible_profiles();
drop function if exists public.mask_profile(public.profiles, public.members);

create or replace function public.mask_profile(
  p public.profiles,
  m public.members,
  viewer_id bigint,
  viewer_cohort int
) returns jsonb language plpgsql stable as $fn$
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
    when viewer_id = m.id then 9
    when viewer_id is null then 0
    when viewer_cohort is distinct from m.cohort then 1
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

create or replace function public.visible_profiles(
  p_viewer bigint default null,
  p_cohort int default null
) returns table (member_id bigint, data jsonb)
language sql stable security definer set search_path = public as $fn$
  select m.id, public.mask_profile(p, m, p_viewer, p_cohort)
  from public.members m
  join public.profiles p on p.member_id = m.id
$fn$;

-- ⛔ 只給 service_role。viewer 是參數，開放給前端等於可以冒充任何人。
revoke all on function public.visible_profiles(bigint, int) from public, anon, authenticated;
grant execute on function public.visible_profiles(bigint, int) to service_role;

-- 診斷函式已經沒用了（PostgREST 根本收不到我們的身分），清掉
drop function if exists public.whoami_db();

-- ── 報名：改成由呼叫端指定是誰 ─────────────────────────────────────
-- 同樣的理由：身分由 Edge Function 驗，這裡只收 member id。
-- ⛔ 一樣只給 service_role。
drop function if exists public.join_event(bigint, text);
drop function if exists public.leave_event(bigint);

create or replace function public.join_event_as(p_member bigint, p_post_id bigint, p_note text default null)
returns text language plpgsql security definer set search_path = public as $fn$
declare cap int; res int; taken int; st text;
begin
  select capacity, reserved_seats into cap, res
  from public.posts
  where id = p_post_id and published and signup_open
  for update;
  if not found then raise exception '這場活動沒有開放報名'; end if;

  select count(*) into taken
  from public.signups where post_id = p_post_id and status = 'ok';

  -- ⛔ 名額判斷一定要在資料庫做：兩個人同時按報名，
  --    前端各自看到「還剩 1 位」，就會超賣。
  if cap is null or taken < cap - res then st := 'ok'; else st := 'wait'; end if;

  insert into public.signups (post_id, member_id, status, note)
  values (p_post_id, p_member, st, p_note)
  on conflict (post_id, member_id) do update set note = excluded.note
  returning status into st;
  return st;
end $fn$;

create or replace function public.leave_event_as(p_member bigint, p_post_id bigint)
returns void language plpgsql security definer set search_path = public as $fn$
declare promote bigint;
begin
  delete from public.signups where post_id = p_post_id and member_id = p_member;
  -- 有人取消就把候補第一位遞補上來
  select id into promote from public.signups
  where post_id = p_post_id and status = 'wait'
  order by created_at limit 1;
  if promote is not null then
    update public.signups set status = 'ok' where id = promote;
  end if;
end $fn$;

revoke all on function public.join_event_as(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.leave_event_as(bigint, bigint) from public, anon, authenticated;
grant execute on function public.join_event_as(bigint, bigint, text) to service_role;
grant execute on function public.leave_event_as(bigint, bigint) to service_role;
