-- ═══════════════════════════════════════════════════════════════════
-- 活動：「金門移地教學」11/11（三）–11/14（六）
--
-- 發布人＝張現傑（member id 23，班代）。
-- 「不動產產業發展與住宅政策分析」課程（陳建元、王靚琇老師）的移地教學。
--
-- ⛔ 內文只放摘要，不寫行程細節（2026-10-31 班代指示「細節不用」）。
-- ⚠️ 逐日行程、住宿、報名現況都在金門看板（另一個 repo
--    fcu-mcd10-kinmen），這裡只放摘要＋連結，不要兩邊各維護一份行程。
--    ⛔ 不放個資：身分證、電話、生日、繳費金額一律不寫。
--
-- ⛔ signup_open = false：報名已經結束（總人數 20 人），
--    看板上開報名鈕只會讓人以為還能報。
--
-- ⚠️ important = true：11/5 保險表單截止前置頂。
--    11/14 回來之後可以改成 false（登入後按「編輯這則」就能改），
--    ⛔ 不要刪 —— 要留紀錄給學弟妹看（2026-10-31 班代指示）。
--
-- ⚠️ visibility = 'public'：非個資盡量公開、留紀錄（2026-10-31 班代指示）。
--
-- ⚠️ 保險表單連結還沒拿到，內文先寫「見班級 LINE 群組」。
--    拿到之後把網址補進內文那一行，重跑這支即可。
--
-- ⚠️ 可重複執行：有就更新、沒有才新增。
--    ⛔ 靠【標題比對】判斷。要改標題的話，這裡改完還要另外
--       delete 掉舊標題那一則，否則會多出一則重複的活動。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

with c(b) as (values (
$body$「不動產產業發展與住宅政策分析」課程金門移地教學，11/11（三）–11/14（六）四天三夜，共 20 人參加。

🔺 保險表單請在 11/5（四）中午前填寫（連結見班級 LINE 群組）。

行程與住宿請看金門看板（按下面的「前往」）：
https://mac2good909777-commits.github.io/fcu-mcd10-kinmen/$body$
)),
upd as (
  update public.posts p
     set body = c.b, kind = 'event', published = true, important = true,
         visibility = 'public',
         event_at = timestamptz '2026-11-11 13:20+08',
         time_text = '11/11（三）– 11/14（六）',
         place = '金門',
         speaker = '陳建元、王靚琇',
         speaker_title = '帶隊老師',
         org = '學程',
         deadline = date '2026-11-05',
         signup_open = false,
         link = 'https://mac2good909777-commits.github.io/fcu-mcd10-kinmen/'
    from c
   where p.title = '金門移地教學'
  returning p.id
)
insert into public.posts
  (cohort, kind, title, body, important, published, visibility,
   event_at, time_text, place, speaker, speaker_title, org, deadline, signup_open, link, author_id)
select 10, 'event', '金門移地教學', c.b, true, true, 'public',
       timestamptz '2026-11-11 13:20+08',
       '11/11（三）– 11/14（六）',
       '金門', '陳建元、王靚琇', '帶隊老師', '學程', date '2026-11-05', false,
       'https://mac2good909777-commits.github.io/fcu-mcd10-kinmen/', 23
  from c
 where not exists (select 1 from upd);
