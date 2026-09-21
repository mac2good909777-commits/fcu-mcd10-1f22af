-- ═══════════════════════════════════════════════════════════════════
-- 公告：「收繳班費通知」
--
-- 發布人＝張現傑（member id 23，班代）。
--
-- ⚠️ visibility 給 'class'（只有登入的同學看得到）——
--    銀行帳號是同學代收代付用的私人帳戶，不能公開在網頁上。
--
-- ⚠️ important = true：置頂在首頁，收繳期間讓大家一進站就看到。
--    10/5 收繳結束後可以改成 false（登入後按「編輯這則」就能改）。
--
-- ⚠️ link 放 SurveyCake 表單網址，畫面上會出現「前往填寫 ↗」按鈕；
--    deadline 設 10/5，跟「班費說明」那則的金額（5,500）要保持一致，
--    改一邊記得改另一邊。
--
-- ⚠️ 可重複執行：有就更新、沒有才新增。
--    ⛔ 靠【標題比對】判斷。要改標題的話，這裡改完還要另外
--       delete 掉舊標題那一則，否則會多出一則重複公告。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

with c(b) as (values (
$body$第十屆班費開始收繳，說明如下。

金額：每人 5,500 元
匯款銀行：合作金庫北屯分行（006）
匯款帳戶：2033765202631
戶　　名：陳夙貞
收繳期間：即日起至 10/5（日）

匯款後請填寫下面表單回饋，方便統計，並請務必確認資料無誤：
https://www.surveycake.com/s/Q4ab8

班費用途詳情請見「第十屆班費說明」公告。$body$
)),
upd as (
  update public.posts p
     set body = c.b, kind = 'notice', important = true, published = true,
         visibility = 'class', deadline = date '2026-10-05',
         link = 'https://www.surveycake.com/s/Q4ab8'
    from c
   where p.title = '收繳班費通知'
  returning p.id
)
insert into public.posts
  (cohort, kind, title, body, important, published, org, author_id,
   visibility, deadline, link)
select 10, 'notice', '收繳班費通知',
       c.b, true, true, '班級', 23,
       'class', date '2026-10-05', 'https://www.surveycake.com/s/Q4ab8'
  from c
 where not exists (select 1 from upd);
