-- ═══════════════════════════════════════════════════════════════════
-- 診斷：資料庫「看到」的登入身分是什麼
--
-- 症狀：前端顯示已登入，但寫入 profiles 影響 0 列
--       → 代表 RLS 的 me_id() 回傳 null，資料庫不認得這個人。
--
-- 這支函式把 PostgREST 實際收到的 JWT claims 原封不動吐出來，
-- 一次看清楚是「claims 根本沒進來」還是「進來了但欄位名不對」。
--
-- ⛔ 只回自己這一次請求的 claims，看不到別人的東西。
--    排錯完可以留著（無害），也可以 drop 掉。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.whoami_db()
returns jsonb language sql stable as $fn$
  select jsonb_build_object(
    -- PostgREST 塞進來的原始 claims。null = 這個請求根本沒帶身分進來。
    'raw_claims',   current_setting('request.jwt.claims', true),
    -- 目前這個查詢是用哪個資料庫角色在跑（anon / authenticated）
    'db_role',      current_user,
    -- 我們自己那三個判斷身分的函式各自算出什麼
    'me_id',        public.me_id(),
    'me_cohort',    public.me_cohort(),
    'me_is_officer',public.me_is_officer()
  )
$fn$;

grant execute on function public.whoami_db() to anon, authenticated;
