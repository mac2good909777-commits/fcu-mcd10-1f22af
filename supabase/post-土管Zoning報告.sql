-- ═══════════════════════════════════════════════════════════════════
-- 公告：「土地使用計畫與管制：美國 Zoning 案例研討報告排程」
--
-- 發布人＝張現傑（member id 23，班代）。授課老師劉曜華（週五 人203）。
-- 作業內容是老師 10/24 公告的「03 美國 Zoning 案例研討」。
--
-- ⚠️ visibility = 'public'：題目、日期與試算表連結都不是個資，
--    而且要留給學弟妹參考（2026-10-31 班代指示：非個資盡量公開、留紀錄）。
--    ⛔ 各組名單【不寫進內文】—— 放在試算表裡由各組自己維護，
--       這裡寫死的話分組一改就跟試算表對不上。
--
-- ⚠️ link 放分組試算表，畫面上會出現「前往 ↗」按鈕。
--    試算表的分享權限要在 Google Drive 那邊開，這裡改不到。
--
-- ⚠️ 可重複執行：有就更新、沒有才新增。
--    ⛔ 靠【標題比對】判斷。要改標題的話，這裡改完還要另外
--       delete 掉舊標題那一則，否則會多出一則重複公告。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

with c(b) as (values (
$body$劉曜華老師「土地使用計畫與管制」（週五 人203）的作業「03 美國 Zoning 案例研討」：
全班分 5 組，每組再分 A／B 兩小組，報告美國最高法院的土地使用分區判例，從 11/6 起一週一組。

■ 報告排程

11/6（五）BOVE
11/13（五）SPUR
11/20（五）EUCLID
11/27（五）PENN CENTRAL
12/4（五）KELO

■ 分組與認領

各組組長、組員與報告題目請填在分組試算表（按下面的「前往」也可以）：
https://docs.google.com/spreadsheets/d/1X0oXvUjvN02s23u8JBkRMSMfPQpB70GbCxzfqa39xG4/edit

報告日期也已經放進看板「行事曆」那一頁。$body$
)),
upd as (
  update public.posts p
     set body = c.b, kind = 'notice', important = false, published = true,
         visibility = 'public',
         link = 'https://docs.google.com/spreadsheets/d/1X0oXvUjvN02s23u8JBkRMSMfPQpB70GbCxzfqa39xG4/edit'
    from c
   where p.title = '土地使用計畫與管制：美國 Zoning 案例研討報告排程'
  returning p.id
)
insert into public.posts
  (cohort, kind, title, body, important, published, org, author_id, visibility, link)
select 10, 'notice', '土地使用計畫與管制：美國 Zoning 案例研討報告排程',
       c.b, false, true, '學程', 23, 'public',
       'https://docs.google.com/spreadsheets/d/1X0oXvUjvN02s23u8JBkRMSMfPQpB70GbCxzfqa39xG4/edit'
  from c
 where not exists (select 1 from upd);
