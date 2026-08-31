-- ═══════════════════════════════════════════════════════════════════
-- 公告：「第九屆碩專班幹部名單」
--
-- 發布人＝張現傑（member id 23，班代）。
--
-- ⚠️ visibility 給 'class'（只有登入的同學看得到）。
--    這是他屆同學的姓名與職務，沒有必要放到公開網頁上被搜尋引擎收走。
--    真的要公開，登入後在畫面上按「編輯這則」改就好，不用改這支 SQL。
--
-- ⚠️ 這支寫成「有就更新、沒有才新增」，可以重複執行。
--    ⛔ 不要寫成單純的 insert + where not exists ——
--       第一次跑完之後再改文字就永遠更新不到，
--       檔案跟線上內容會不知不覺地分岔。（2026-09-01 就發生過。）
--
-- ⚠️ 第九屆有「資訊」這個職務，第十屆沒有 —— 照原文列出，不對應到別的職務。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run
-- ═══════════════════════════════════════════════════════════════════

with c(b) as (values (
$body$第九屆學長姊的班級幹部如下，跨屆聯繫或請益時可以找對應的人。

班代　　　　　　林育生
副班代　　　　　黃凱宏、陳姵錡、趙麗偉
學務　　　　　　蘇佑進、林郁玲
財務　　　　　　呂孟玲
總務　　　　　　鄒秀芳、張家卉
公關　　　　　　李雅儒
活動　　　　　　王薇鈞、沈諭宣
資訊　　　　　　簡嘉瑾、楊慈淋
國土規劃組代　　蘇又鑫
運輸管理組代　　鍾佳蕙
不動產經營組代　陳軍廷
不動產管理組代　戴佑城$body$
)),
upd as (
  update public.posts p
     set body = c.b, published = true, visibility = 'class'
    from c
   where p.title = '第九屆碩專班幹部名單'
  returning p.id
)
insert into public.posts
  (cohort, kind, title, body, important, published, org, author_id, visibility)
select 10, 'notice', '第九屆碩專班幹部名單',
       c.b, false, true, '班級', 23, 'class'
  from c
 where not exists (select 1 from upd);
