-- ═══════════════════════════════════════════════════════════════════
-- 修正 04：產業分類改成「可以自己填」
--
-- 為什麼要改：
--   原本是 13 選 1 的下拉。但這班橫跨的行業比我們列的多
--   （能源、離岸風電、無人機、窗簾、磁磚建材…），
--   選不到自己那一行的人只能勉強挑一個最接近的，
--   結果名冊的篩選反而失真 —— 分類是為了找人，不是為了整齊。
--
--   改成：欄位存【文字】，前端給一份建議清單但不限制輸入。
--   篩選改用「實際出現過的值」動態產生，所以自己填的也能被篩到。
--
-- 這支 SQL 把既有的代碼（re / broker / con …）換成中文字。
-- ⚠️ 只換還是代碼的那些，同學自己改過的文字不動。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

update public.profiles set industry = case industry
  when 're'     then '不動產開發'
  when 'broker' then '不動產仲介'
  when 'con'    then '營造工程'
  when 'arch'   then '建築師事務所'
  when 'eng'    then '工程顧問／技師'
  when 'int'    then '室內裝修'
  when 'apr'    then '不動產估價'
  when 'law'    then '地政士／法務'
  when 'gov'    then '公部門'
  when 'edu'    then '學術教育'
  when 'it'     then '資訊／電信'
  when 'mfg'    then '製造／建材'
  when 'enr'    then '能源產業'
  else industry
end
where industry in ('re','broker','con','arch','eng','int','apr','law',
                   'gov','edu','it','mfg','enr');
