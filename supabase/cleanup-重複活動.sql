-- ═══════════════════════════════════════════════════════════════════
-- 清理：刪掉重複的迎新晚會活動（舊標題「迎新晚會」）
--
-- 怎麼發生的：
--   post-迎新晚會.sql 第一版的標題是「迎新晚會」，跑過一次建立了 id5。
--   後來依班代定稿把標題改成「第十屆迎新晚會」，但那支 SQL 是靠
--   【標題比對】決定更新還是新增 —— 標題對不上，於是又新增了 id6。
--
-- ⛔ 教訓：改動 upsert SQL 的標題時，必須同時附上刪除舊標題那則的語句，
--    否則每改一次標題就多一則。（2026-09-04 發生。）
--
-- 保留的是「第十屆迎新晚會」（截止 9/21、內文有三個連結、主辦標籤）。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

-- 先確認一下要刪的是哪一則（Run 之後看結果，確定只有一列再往下）
select id, kind, title, deadline, length(body) as 內文字數
  from public.posts
 where title = '迎新晚會';

-- 報名紀錄一併清掉，避免留下指向不存在活動的孤兒資料
delete from public.signups
 where post_id in (select id from public.posts where title = '迎新晚會');

delete from public.posts
 where title = '迎新晚會';

-- 刪完應該只剩「第十屆迎新晚會」一則活動
select id, title, deadline, signup_open
  from public.posts
 where kind = 'event'
 order by id;
