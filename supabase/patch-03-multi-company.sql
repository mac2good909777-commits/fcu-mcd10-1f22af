-- ═══════════════════════════════════════════════════════════════════
-- 修正 03：一個人可以有三組「單位／職稱」
--
-- 為什麼：班上不少人身兼多家（自己開公司＋事務所＋掛顧問），
--         只給一組會逼他們選一個填，資訊反而失真。
--
-- ⚠️ 職稱的公開範圍【跟著同一組的單位走】，不另外設定。
--    六個下拉選單只會讓人不想填，而且「單位公開、職稱不公開」
--    這種組合實務上沒有意義。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists company2 text,
  add column if not exists title2   text,
  add column if not exists company3 text,
  add column if not exists title3   text;

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
  vis_key text;
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

  foreach k in array array['nickname',
                           'company','title','company2','title2','company3','title3',
                           'industry','tag','headline',
                           'intro','resource','wish','topics','edu_bg','web','line_url',
                           'q_why','q_thesis','q_team','phone','email']
  loop
    v := to_jsonb(p) ->> k;
    if v is null or v = '' then continue; end if;

    -- 職稱跟著同一組的單位走
    vis_key := case k
      when 'title'  then 'company'
      when 'title2' then 'company2'
      when 'title3' then 'company3'
      else k end;
    field_vis := coalesce(p.vis ->> vis_key, 'class');

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

  -- 只有本人看得到這兩個（可見範圍標籤、以及「還沒確認」提示）
  if viewer_rank = 9 then
    out_json := out_json
      || jsonb_build_object('vis', p.vis)
      || jsonb_build_object('confirmed', p.confirmed_at is not null);
  end if;
  return out_json;
end $fn$;
