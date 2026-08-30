-- ═══════════════════════════════════════════════════════════════════
-- 修正 05：登入名單加上老師、助教、學長姊
--
-- 為什麼：看板不會只有本屆同學在用 ——
--   學程主任與助教要發公告，老師可能來看資源交流，
--   學長姊則是這個看板長成校友會的第一步。
--
-- 做法：members 加一個 kind 欄位。
--   student  本屆同學（預設）
--   teacher  老師
--   staff    助教／行政
--   alumni   學長姊（用 cohort 記第幾屆）
--
-- ⛔ 【不要】一次把 44 位老師全部建進去。
--    每一個還沒被認領的名字，都是一個可以被冒充的位置。
--    44 個沒人會用的老師帳號＝憑空多出 44 個風險點。
--    要用的人再加，最後一段有現成的新增語法。
--
-- 在 Supabase → SQL Editor 貼上整份 → Run（可重複執行）
-- ═══════════════════════════════════════════════════════════════════

alter table public.members
  add column if not exists kind text not null default 'student';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_kind_chk') then
    alter table public.members add constraint members_kind_chk
      check (kind in ('student','teacher','staff','alumni'));
  end if;
end $$;

comment on column public.members.kind is
  'student 本屆同學／teacher 老師／staff 助教行政／alumni 學長姊';

-- 屆別：老師與助教不屬於任何一屆，用 0 表示
insert into public.cohorts (id, name, year, is_current) values
  (0, '教職員', '不分屆', false)
on conflict (id) do nothing;

-- v_members 要吐出 kind，前端才分得出誰是誰
create or replace view public.v_members as
  select m.id, m.cohort, m.sort, m.name, m.grp, m.officer, m.status, m.kind,
         (m.claimed_at is not null) as claimed,
         (p.confirmed_at is not null) as confirmed
  from public.members m
  left join public.profiles p on p.member_id = m.id;

grant select on public.v_members to anon, authenticated;

-- ── 先加兩個一定會用到的 ───────────────────────────────────────────
-- ⚠️ id 從 900 起跳，跟同學的 1–50 分開，之後一眼看得出是誰。
--    grp 是 not null 且有 check，教職員一律填 'land'（不會顯示）。
insert into public.members (id, cohort, sort, name, grp, officer, status, kind) values
  (901, 0, 9001, '謝政穎', 'land', '學程主任', '', 'teacher'),
  (902, 0, 9002, '蔡玗庭', 'land', '助教',     '', 'staff')
on conflict (id) do update set
  name = excluded.name, officer = excluded.officer, kind = excluded.kind;

insert into public.profiles (member_id) values (901), (902)
on conflict (member_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- 之後要加人時，照這個格式（把註解拿掉再跑）
-- ═══════════════════════════════════════════════════════════════════
--
-- 老師（id 用 903、904…依序）：
--   insert into public.members (id, cohort, sort, name, grp, officer, status, kind)
--   values (903, 0, 9003, '蘇昭銘', 'land', '', '', 'teacher')
--   on conflict (id) do nothing;
--   insert into public.profiles (member_id) values (903) on conflict do nothing;
--
-- 學長姊（cohort 填第幾屆，id 用「屆數 * 1000 + 流水號」比較好認）：
--   先建那一屆：
--     insert into public.cohorts (id, name, year, is_current)
--     values (9, '第九屆', '114 學年度入學', false) on conflict (id) do nothing;
--   再加人：
--     insert into public.members (id, cohort, sort, name, grp, officer, status, kind)
--     values (9001, 9, 1, '王小明', 're', '', '', 'alumni')
--     on conflict (id) do nothing;
--     insert into public.profiles (member_id) values (9001) on conflict do nothing;
--
-- ⚠️ 學長姊加進來之後，「全學程校友」那個可見範圍就有意義了 ——
--    到時候把 app.js 裡 VIS.alumni 的 hidden 拿掉就會出現在選單。
