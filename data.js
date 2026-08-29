/* ────────────────────────────────────────────────────────────────
   逢甲大學建設碩士在職學位學程　第十屆同學看板 — 【公開】名冊
   來源：資料/115學年度_逢甲都計所在職專班_新生名冊.xlsx（2026-08-29）

   ⛔ 這支檔案是公開的。裡面只放「未登入也能看」的欄位：
        姓名、組別、幹部職務、休學與否
      公司與職稱在 private.js —— 那支是登入後才該看到的內容。

   ⚠️ GitHub Pages 是靜態站，沒有權限這回事：
      現階段 private.js 只要被載入，翻開發者工具就看得到。
      UI 的遮蔽是把「該有的樣子」先做出來，
      真正生效是接上 Supabase、由後端驗身分才吐那一天（見 README）。

   名冊裡有、但刻意不放進網站的：學號、性別、備註「請假」。
      學號是個人識別碼；「請假」指的是新生說明會請假，不是身分，
      放上來只會被誤讀成「這個人狀態不對」。

   ⚠️ 休學的同學保留在名冊裡（其中一位仍有參加），用 status 標記，
      不要直接刪掉 —— 名冊少了人，同學第一個反應是「系統壞了」。
   ──────────────────────────────────────────────────────────────── */

/* ── 屆別（校友會架構的預留）──────────────────────────────────────
   現在只有第十屆，但資料模型從一開始就用「屆別」當一層，不要寫死。

   為什麼現在就要做：
     這個看板遲早會變成整個學程的校友會 —— 學長姊找學弟妹、跨屆媒合，
     那才是這套東西真正值錢的地方。等到第十一屆進來才改，
     每一個 member、每一則公告、每一個可見範圍都要重新長出 cohort 欄位，
     那時候已經有真實資料，改動成本是現在的十倍。

   加一屆要做的事（就這三件）：
     1. COHORTS 加一筆
     2. 新同學的 member 補 cohort 欄位
     3. 名冊的屆別篩選會自己長出來（只有一屆時自動隱藏）

   跨屆可見範圍 "alumni" 已經在 app.js 的 VIS 定義好了，
   現在只有一屆所以效果等同 "class"，多一屆就自動生效。       */
const COHORTS = {
  10: { name:"第十屆", year:"115 學年度入學", current:true }
  // 11: { name:"第十一屆", year:"116 學年度入學" },
};
const CURRENT_COHORT = 10;

// 三個專業組（名冊分頁 = 組別，與學程官網一致）
const GROUPS = {
  re:   { name:"不動產經營管理",         short:"不動產",   color:"#601986" },
  land: { name:"國土城鄉規劃與運輸管理", short:"國土運輸", color:"#05B5ED" },
  smart:{ name:"智慧城市與營建防災",     short:"智慧防災", color:"#93C529" }
};

// 幹部（2026-08-29 選出）。班務七職 + 三位組代。
const OFFICER_ORDER = ["班代","副班代","學務","總務","財務","公關","活動",
                       "不動產組代","國土運輸組代","智慧防災組代"];

/* status: ""＝在學　"leave"＝休學　"leave_active"＝休學但仍參與班上活動 */
const MOCK_MEMBERS = [
  { id:1, sort:101, group:"re", name:"江麗雯", officer:"", status:"" },
  { id:2, sort:102, group:"re", name:"張耀今", officer:"", status:"" },
  { id:3, sort:103, group:"re", name:"廖婕茹", officer:"", status:"" },
  { id:4, sort:104, group:"re", name:"林家德", officer:"", status:"" },
  { id:5, sort:105, group:"re", name:"施潔伶", officer:"", status:"" },
  { id:6, sort:106, group:"re", name:"李志銓", officer:"", status:"" },
  { id:7, sort:107, group:"re", name:"陳夙貞", officer:"不動產組代", status:"" },
  { id:8, sort:108, group:"re", name:"陳鈺芬", officer:"", status:"" },
  { id:9, sort:109, group:"re", name:"楊秉樺", officer:"", status:"" },
  { id:10, sort:110, group:"re", name:"吳弈均", officer:"", status:"" },
  { id:11, sort:111, group:"re", name:"許朝勝", officer:"", status:"" },
  { id:12, sort:112, group:"re", name:"陳志偉", officer:"", status:"" },
  { id:13, sort:113, group:"re", name:"王佑丞", officer:"學務", status:"" },
  { id:14, sort:114, group:"re", name:"陳柏翰", officer:"", status:"" },
  { id:15, sort:115, group:"re", name:"林家榛", officer:"公關", status:"" },
  { id:16, sort:116, group:"re", name:"蔡欣嶧", officer:"", status:"" },
  { id:17, sort:117, group:"re", name:"林咨辰", officer:"", status:"" },
  { id:18, sort:201, group:"land", name:"莊尚儒", officer:"", status:"" },
  { id:19, sort:202, group:"land", name:"陳建元", officer:"", status:"" },
  { id:20, sort:203, group:"land", name:"王麗秋", officer:"副班代", status:"" },
  { id:21, sort:204, group:"land", name:"石聰敏", officer:"", status:"" },
  { id:22, sort:205, group:"land", name:"林青瑜", officer:"總務", status:"" },
  { id:23, sort:206, group:"land", name:"張現傑", officer:"班代", status:"" },
  { id:24, sort:207, group:"land", name:"劉育修", officer:"", status:"" },
  { id:25, sort:208, group:"land", name:"陳衫穎", officer:"活動", status:"" },
  { id:26, sort:209, group:"land", name:"李品妍", officer:"", status:"" },
  { id:27, sort:210, group:"land", name:"陳志勇", officer:"", status:"" },
  { id:28, sort:211, group:"land", name:"周彥萱", officer:"", status:"" },
  { id:29, sort:212, group:"land", name:"賴豐升", officer:"", status:"" },
  { id:30, sort:213, group:"land", name:"蔡輝煌", officer:"", status:"" },
  { id:31, sort:214, group:"land", name:"陳其君", officer:"", status:"" },
  { id:32, sort:215, group:"land", name:"林秉賢", officer:"", status:"" },
  { id:33, sort:216, group:"land", name:"李牧襄", officer:"", status:"" },
  { id:34, sort:217, group:"land", name:"張新華", officer:"國土運輸組代", status:"" },
  { id:35, sort:218, group:"land", name:"鄭予嘉", officer:"", status:"" },
  { id:36, sort:219, group:"land", name:"陳紀安", officer:"", status:"" },
  { id:37, sort:220, group:"land", name:"吳偉如", officer:"", status:"" },
  { id:38, sort:221, group:"land", name:"江勻穎", officer:"", status:"leave" },
  { id:39, sort:222, group:"land", name:"歐庭愷", officer:"", status:"leave" },
  { id:40, sort:223, group:"land", name:"張景程", officer:"", status:"leave" },
  { id:41, sort:224, group:"land", name:"謝庭振", officer:"", status:"leave_active" },
  { id:42, sort:301, group:"smart", name:"呂宣", officer:"", status:"" },
  { id:43, sort:302, group:"smart", name:"吳佳玲", officer:"財務", status:"" },
  { id:44, sort:303, group:"smart", name:"黃程豐", officer:"智慧防災組代", status:"" },
  { id:45, sort:304, group:"smart", name:"梁逸輝", officer:"", status:"" },
  { id:46, sort:305, group:"smart", name:"郭家興", officer:"", status:"" },
  { id:47, sort:306, group:"smart", name:"劉又菁", officer:"", status:"" },
  { id:48, sort:307, group:"smart", name:"詹凱程", officer:"", status:"" },
  { id:49, sort:308, group:"smart", name:"林振其", officer:"", status:"" },
  { id:50, sort:309, group:"smart", name:"洪明通", officer:"", status:"leave" }
];

/* ── 公告、活動、資源交流、相簿 ──────────────────────────────────
   目前【全部是空的】，這是刻意的。

   ⛔ 不要為了「版面看起來充實」放假的公告和活動。
      這個看板 50 位真的同學會看，假的期初聚餐、假的班費說明
      會有人真的照著做；等到真公告發出來，又要花力氣解釋哪一則是假的。
      空的畫面會說明這一區要拿來做什麼 —— 那比假資料誠實，也一樣好懂。

   幹部把真內容填進來時，照下面的欄位格式加：

     公告  { id, kind:"notice", title, body, important?, author_id, created_at }
     問卷  { id, kind:"survey", title, body, deadline, link, required?, done_count, author_id, created_at }
     活動  { id, kind:"event",  title, body, event_at, time_text, place, org:"班級"|"學程",
             capacity, reserved_seats, signup_open, waitlist_open, fee, author_id, created_at }

   ⚠️ event_at 要帶時區（…+08:00），不要只寫日期。
   ⚠️ author_id 是名冊裡的 id，不是名字。                              */
const MOCK_POSTS = [];

const MOCK_NEEDS = [];

const MOCK_ALBUMS = [];

const CLASS_INFO = {
  school:  "逢甲大學",
  program: "建設碩士在職學位學程",
  program_en: "Professional Master's Program of Construction and Development",
  cohort:  "第十屆",
  year:    "115 學年度入學",
  site:    "https://mcd.fcu.edu.tw/",
  count:   MOCK_MEMBERS.length,
  active:  MOCK_MEMBERS.filter(m => m.status !== "leave").length
};
