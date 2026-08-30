-- ═══════════════════════════════════════════════════════════════════
-- 修正 08：聯絡方式 —— 手機、Email、LINE ID
--
-- ⚠️ phone 與 email 這兩個欄位【本來就有】，mask_profile 也早就把它們
--    強制限制在「只有同屆同學與本人看得到」（就算本人手滑設成公開也會被擋）。
--    問題是前端從來沒有把它們放出來給人填，Edge Function 的白名單也沒放行 ——
--    做了一半，等於沒做。這支補齊 line_id，前端與函式那半在程式碼裡補。
--
-- 為什麼要這三個：
--    line_url 是「加好友連結」，適合貼在網頁上讓人直接點；
--    但很多人根本不知道自己的連結在哪抓，只講得出 LINE ID。
--    手機則是真的要聯絡（活動當天找不到人）時唯一有用的東西。
--
-- ⛔ 這三個一律不接受 public / alumni ——
--    公開在網頁上的手機號碼會被爬蟲收走，然後就是詐騙電話。
--    使用者選什麼都一樣，最寬只到 class（同屆同學）。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists line_id text;

comment on column public.profiles.line_id is 'LINE ID；與 phone、email 同樣強制最寬只到 class';

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
  if p.confirmed_at is null and viewer_rank < 9 then
    return '{}'::jsonb;
  end if;

  foreach k in array array['nickname',
                           'company','title','company2','title2','company3','title3',
                           'industry','tag','headline',
                           'intro','resource','wish','topics','edu_bg','web','line_url',
                           'q_why','q_thesis','q_team',
                           'phone','email','line_id']
  loop
    v := to_jsonb(p) ->> k;
    if v is null or v = '' then continue; end if;

    vis_key := case k
      when 'title'  then 'company'
      when 'title2' then 'company2'
      when 'title3' then 'company3'
      else k end;
    field_vis := coalesce(p.vis ->> vis_key, 'class');

    -- ⛔ 聯絡方式不接受 public/alumni：只給同屆同學與本人。
    --    就算本人手滑設成公開，這裡也要擋下來 ——
    --    公開的手機號碼會被爬蟲收走，收得到的只有詐騙電話。
    if k in ('phone','email','line_id') and field_vis in ('public','alumni') then
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

  return out_json;
end $fn$;
