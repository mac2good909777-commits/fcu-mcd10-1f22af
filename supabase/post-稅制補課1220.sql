-- ═══════════════════════════════════════════════════════════════════
-- 活動：「不動產稅制分析專論 12/20 補課」12/20（日）09:00–12:00
--
-- 發布人＝張現傑（member id 23，班代）。授課老師張梅英。
--
-- ⚠️ 用 kind = 'event' 而不是公告：活動頁會照日期排，
--    首頁「下一場活動」也會在時間到時自動帶出來。
-- ⛔ signup_open = false：這是補課，不需要報名，修課同學都要到。
--
-- ⚠️ visibility = 'public'：沒有任何個資，而且要留給學弟妹看
--    這門課當年怎麼上（2026-10-31 班代指示：非個資盡量公開、留紀錄）。
--
-- ⚠️ 教室還沒借到（請助教借可以飲食的舊教室）。借到之後改 place
--    與內文那一行，重跑這支即可。
--
-- ⚠️ 可重複執行：有就更新、沒有才新增。
--    ⛔ 靠【標題比對】判斷。要改標題的話，這裡改完還要另外
--       delete 掉舊標題那一則，否則會多出一則重複的活動。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

with c(b) as (values (
$body$修「不動產稅制分析專論」的同學請預留時間。

日期｜2026 年 12 月 20 日（星期日）09:00–12:00
內容｜上課＋分組討論
教室｜已請助教協助借可以飲食的教室，確認後另行公告

🍡 張梅英老師會準備五行湯圓請大家吃！

無法出席請先私訊班代。$body$
)),
upd as (
  update public.posts p
     set body = c.b, kind = 'event', published = true, important = false,
         visibility = 'public',
         event_at = timestamptz '2026-12-20 09:00+08',
         time_text = '09:00–12:00',
         place = '逢甲大學（教室確認後另行公告）',
         speaker = '張梅英',
         speaker_title = '授課老師',
         org = '學程',
         signup_open = false
    from c
   where p.title = '不動產稅制分析專論 12/20 補課'
  returning p.id
)
insert into public.posts
  (cohort, kind, title, body, important, published, visibility,
   event_at, time_text, place, speaker, speaker_title, org, signup_open, author_id)
select 10, 'event', '不動產稅制分析專論 12/20 補課', c.b, false, true, 'public',
       timestamptz '2026-12-20 09:00+08', '09:00–12:00',
       '逢甲大學（教室確認後另行公告）',
       '張梅英', '授課老師', '學程', false, 23
  from c
 where not exists (select 1 from upd);
