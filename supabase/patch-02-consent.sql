-- ═══════════════════════════════════════════════════════════════════
-- 修正 02：本人確認過，資料才對外顯示
--
-- 為什麼要改：
--   名冊帶進來的公司、職稱、學歷，是同學【入學時填給學校】的，
--   不是他們同意公開在班級看板上的內容。在本人確認之前就顯示，
--   等於我們替他決定了露出程度。
--
--   改成：profiles.confirmed_at 有值（＝本人登入後按過儲存）
--         才對其他人吐資料。沒確認過的人，別人只看得到姓名。
--
-- ⚠️ 本人【永遠看得到自己的】，包含還沒確認的名冊帶入值 ——
--    不然他進去編輯時會看到一片空白，還以為資料掉了。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists confirmed_at timestamptz;

comment on column public.profiles.confirmed_at is
  '本人登入後按過儲存的時間。null = 還沒確認，資料不對其他人顯示。';

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

  -- ⛔ 本人還沒確認過，就不對其他人吐任何欄位。
  --    本人自己（rank 9）不受限制 —— 他要看得到才能檢查與修改。
  if p.confirmed_at is null and viewer_rank < 9 then
    return '{}'::jsonb;
  end if;

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

  -- 只有本人看得到這兩個（畫面上的可見範圍標籤、以及「還沒確認」提示）
  if viewer_rank = 9 then
    out_json := out_json
      || jsonb_build_object('vis', p.vis)
      || jsonb_build_object('confirmed', p.confirmed_at is not null);
  end if;
  return out_json;
end $fn$;

-- 名冊上要能標示「這個人還沒確認」，但那只是一個布林值，不吐內容
create or replace view public.v_members as
  select m.id, m.cohort, m.sort, m.name, m.grp, m.officer, m.status,
         (m.claimed_at is not null) as claimed,
         (p.confirmed_at is not null) as confirmed
  from public.members m
  left join public.profiles p on p.member_id = m.id;

grant select on public.v_members to anon, authenticated;
