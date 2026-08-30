-- ═══════════════════════════════════════════════════════════════════
-- 修正 09：聯絡方式開放「公開」
--
-- patch-08 把 phone / email / line_id 強制限制在 class（同屆同學）。
-- 現在改成尊重本人的設定 —— 想公開就公開。
--
-- ⚠️ 這支必須跟前端一起上：前端選單放行、資料庫沒放行，
--    等於使用者選了公開卻沒有效果，而且完全沒有錯誤訊息。
--
-- ⚠️ 必須先跑過 patch-08（line_id 欄位由那支建立）。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

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

    -- ⚠️ 2026-08-30 應要求解除聯絡方式的上限：本人選什麼就是什麼，
    --    包含「公開」。原本這裡會把 phone/email/line_id 從 public 強制降成 class。
    --    ⛔ 不要「只改前端選單、不改這裡」——
    --       那會變成選了公開、畫面顯示已儲存，實際上沒有生效，
    --       使用者以為設定有效的沉默失敗，比兩種設定本身都糟。
    --    風險（公開的手機號碼會被爬蟲收走）已在填寫畫面上明說，由本人自己決定。

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
