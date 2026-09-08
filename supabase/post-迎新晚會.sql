-- ═══════════════════════════════════════════════════════════════════
-- 活動：「迎新晚會」10/3（六）18:30
--
-- 發布人＝張現傑（member id 23，班代）。主辦是第九屆碩二同學。
--
-- ⛔ signup_open = false（不開放看板上的線上報名）。
--    報名走 Google 表單，因為那邊才收得到照片上傳。
--    看板如果也開報名鈕，同學會按了以為報名完成，
--    結果第九屆手上的名單裡沒有他 —— 兩套報名管道是災難。
--    改成把表單網址放進 link，畫面上會出現「相關連結」。
--
-- ⚠️ visibility = 'public'：邀請函頁面本來就公開，
--    而且一半的同學還沒登入過，設班內限定等於一半的人看不到。
--
-- ⚠️ event_at 明確寫 +08，不要靠資料庫的預設時區去猜。
--
-- ⚠️ 可重複執行：有就更新、沒有才新增。
--    ⛔ 靠【標題比對】判斷，之後在看板上改了標題，這裡也要跟著改。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

with c(b) as (values (
$body$第九屆碩二同學敬邀師長暨第十屆新生同學參加迎新晚會。

日期｜2026 年 10 月 3 日（星期六）18:30
地點｜星享道酒店 9 樓・久享廳
地址｜台中市西屯區福星北路 18 號

報名截止 9/30，請從下面的「相關連結」進 Google 表單填寫。
表單裡會問出席與否、葷素，還有請碩一同學上傳一張個人生活照，
晚會當天會用到。

上傳照片需要登入 Google 帳號。沒有帳號或不方便登入的同學，
照片直接傳 LINE 給班代。$body$
)),
upd as (
  update public.posts p
     set body = c.b, kind = 'event', published = true, important = true,
         visibility = 'public',
         event_at = timestamptz '2026-10-03 18:30+08',
         place = '星享道酒店 9 樓・久享廳（台中市西屯區福星北路 18 號）',
         speaker = '第九屆碩二同學',
         org = '學程',
         deadline = date '2026-09-30',
         signup_open = false,
         link = 'https://docs.google.com/forms/d/e/1FAIpQLScCVIRJCKSLUBfGgqW2LnwmW4ZQcEZXYC_pg7MOXFUyq-aRGw/viewform'
    from c
   where p.title = '迎新晚會'
  returning p.id
)
insert into public.posts
  (cohort, kind, title, body, important, published, visibility,
   event_at, place, speaker, org, deadline, signup_open, link, author_id)
select 10, 'event', '迎新晚會', c.b, true, true, 'public',
       timestamptz '2026-10-03 18:30+08',
       '星享道酒店 9 樓・久享廳（台中市西屯區福星北路 18 號）',
       '第九屆碩二同學', '學程', date '2026-09-30', false,
       'https://docs.google.com/forms/d/e/1FAIpQLScCVIRJCKSLUBfGgqW2LnwmW4ZQcEZXYC_pg7MOXFUyq-aRGw/viewform',
       23
  from c
 where not exists (select 1 from upd);
