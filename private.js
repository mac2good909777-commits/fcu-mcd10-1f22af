/* ────────────────────────────────────────────────────────────────
   逢甲大學建設碩士在職學位學程　第十屆同學看板 — 【登入後才該看到】的同學資料
   公司、職稱、產業別、學歷。已由名冊預設帶入，同學可自行修改。

   ⛔ 接上 Supabase 之後【刪掉這支檔案】，改成登入後跟後端要：
        const p = await fn("profiles");   // Edge Function 驗完 token 才吐
      在那之前，這支檔案只要被瀏覽器載入，翻開發者工具就看得到 ——
      前端的遮蔽擋得住「隨手看一眼」，擋不住「想看的人」。
      所以現在網址請當作非公開（noindex + 亂碼路徑），
      要真的擋住，就是把這支刪掉那一天。

   ⚠️ 電話與 Email 一律不要加進這支檔案。那兩個欄位從一開始就只能走後端。
   ──────────────────────────────────────────────────────────────── */

// 產業別：由「服務單位＋職稱」歸類，不是名冊原有欄位。
// 分這麼細是有原因的 —— 這班最值錢的就是跨行業的連結，
// 全部塞成「不動產」就等於沒有分類。
const INDUSTRIES = {
  re:"不動產開發", broker:"不動產仲介", con:"營造工程", arch:"建築師事務所",
  eng:"工程顧問／技師", int:"室內裝修", apr:"不動產估價", law:"地政士／法務",
  gov:"公部門", edu:"學術教育", it:"資訊／電信", mfg:"製造／建材", enr:"能源產業"
};

const PRIVATE_PROFILE = {
  1:{ industry:"gov", company:"臺中市和平區公所", title:"課員", edu_bg:"國立政治大學地政學系" },
  2:{ industry:"re", company:"澄都建設有限公司", title:"負責人", edu_bg:"嘉南藥理大學應用空間資訊系" },
  3:{ industry:"re", company:"國雄建設", title:"成控", edu_bg:"朝陽科技大學應用英語系" },
  4:{ industry:"gov", company:"空軍司令部防空砲兵指揮部", title:"後勤助理士", edu_bg:"空軍航空技術學院機械工程科" },
  5:{ industry:"gov", company:"南投縣埔里地政事務所", title:"課員", edu_bg:"逢甲大學土地管理學系" },
  6:{ industry:"law", company:"李志銓地政士事務所", title:"地政士", edu_bg:"高雄市普門高級中學" },
  7:{ industry:"re", company:"太子建設開發股份有限公司", title:"股長", edu_bg:"僑光商業專科學校會計統計科" },
  8:{ industry:"broker", company:"永義房屋　育賢樹孝店", title:"業務", edu_bg:"國立勤益科技大學流通管理系" },
  9:{ industry:"mfg", company:"三洋磁磚台中分公司　聯洋建材", title:"業務專員", edu_bg:"中臺科技大學國際企業系" },
  10:{ industry:"int", company:"澄橙花佐宅室內裝修資訊整合有限公司", title:"負責人", edu_bg:"國立中山大學醫務管理研究所" },
  11:{ industry:"int", company:"展藝室內裝修資訊整合有限公司", title:"負責人", edu_bg:"建國科技大學土木工程科" },
  12:{ industry:"re", company:"由鉅建設股份有限公司", title:"專員／代書", edu_bg:"國立臺中科技大學財務金融系" },
  13:{ industry:"apr", company:"卓越不動產估價師聯合事務所", title:"不動產估價師", edu_bg:"國立成功大學都市計劃學系" },
  14:{ industry:"re", company:"陸府建設", title:"市場延展特助", edu_bg:"僑光科技大學餐飲管理系" },
  15:{ industry:"law", company:"鄭代書事務所", title:"登記助理員", edu_bg:"嶺東科技大學企業管理系" },
  16:{ industry:"mfg", company:"環球水泥股份有限公司", title:"廠長", edu_bg:"國立中山大學公共事務管理研究所" },
  17:{ industry:"re", company:"汯益開發有限公司", title:"業務員", edu_bg:"僑光科技大學財務金融系" },
  18:{ industry:"re", company:"英奇建設有限公司", title:"總經理", edu_bg:"McGill University, Bachelor of Commerce" },
  19:{ industry:"con", company:"港洲營造股份有限公司", title:"專案經理", edu_bg:"中原大學土木工程學系" },
  20:{ industry:"re", company:"永騰錩不動產開發有限公司", title:"負責人", edu_bg:"逢甲大學經營管理碩士在職學位學程" },
  21:{ industry:"law", company:"石聰敏地政士事務所", title:"地政士", edu_bg:"南榮科技大學電機工程科" },
  22:{ industry:"arch", company:"九典聯合建築師事務所", title:"職業安全衛生工程師", edu_bg:"弘光醫事護理專科學校工業安全衛生科" },
  // 張現傑（班代）—— 已自行補完整份資料，可當作其他同學填寫時的範例。
  // ⚠️ 公司職稱以本人現況為準：名冊上填的是「瑞禾不動產經紀股份有限公司／
  //    工業地產部業務總監」，那是入學當時的資料，這裡不覆蓋掉紀錄，只是顯示新的。
  23:{ industry:"broker",
    company:"睦聚地產開發有限公司", title:"負責人",
    nickname:"Mac",
    edu_bg:"長庚大學資訊管理學系研究所",
    tag:"工業地產",
    headline:"工業地產的『地圖』——中台灣哪塊地能蓋、能不能買，問我最快",
    intro:"工業地產經紀人，深耕中台灣產業園區與廠房、工業地買賣，主要服務台中產業園區、精密機械園區、大里工業區、彰濱與南崗一帶。\n\n買方端：協助製造業主依製程需求、電力、廢水、使用分區與擴廠年限，篩出真正可用的基地，並以實價登錄與現場查證判斷價格合不合理。\n\n賣方端：協助資產持有者盤點土地價值、規劃出場時機與銷售策略，把物件送到對的產業買方面前。\n\n也承接土地開發評估與資產配置諮詢。",
    resource:"・中台灣工業地／廠房／廠辦的第一手待售與待租標的\n・特定園區、路段的實價登錄行情判讀（不是丟表格給你，是告訴你這筆能不能拿來比）\n・土地可行性初判：使用分區、建蔽容積、能不能蓋你要的廠房\n・產權與交易風險排查（謄本、地籍、他項權利、法拍與共有問題）\n・配合的建築師、代書、估價師、環境檢測、營造窗口\n・製造業主／地主／開發商的人脈引介",
    wish:"有擴廠、遷廠、購地需求的製造業主；手上有閒置土地或老廠房想處分的地主；找標的的開發商與投資方。\n\n這班本身就是最好的資源：公部門的都計與地政、地政士、估價師、結構與工程技師、營造與建築師 —— 我手上的案子幾乎每一件都會用到你們其中一種，很願意互相導流。",
    topics:"工業地產、產業園區、實價登錄行情、土地開發評估、廠房買賣、資產配置",
    web:"https://mac2good909777-commits.github.io/about/",
    line_url:"https://line.me/ti/p/WqW34GMG5R",
    q_why:"做工業地產十幾年，判斷都是從市場長出來的。想把國土計畫、都市計畫、運輸規劃這幾套「上游的邏輯」補起來 —— 知道一塊地為什麼會變成現在這樣，才有辦法判斷它接下來會變成什麼。",
    q_thesis:"想做中台灣產業園區的地價形成機制，用實價登錄的實際成交去驗證：重大交通建設、分區變更、龍頭企業進駐，這三件事各自把地價推動了多少、時間落差多久。",
    q_team:"想找做交通運輸規劃、以及公部門都計背景的同學。我有市場端的成交資料與案例，你們有制度端與規劃端的視角，湊在一起才是完整的一份報告。" },
  24:{ industry:"gov", company:"臺中市政府捷運工程局", title:"科員", edu_bg:"國立成功大學測量及空間資訊學系" },
  25:{ industry:"broker", company:"三贏不動產", title:"負責人", edu_bg:"臺中技術學院應用日語科" },
  26:{ industry:"broker", company:"台灣房屋　七期特許加盟店", title:"高專", edu_bg:"銘傳大學應用英語學系" },
  27:{ industry:"broker", company:"台中不動產有限公司", title:"負責人", edu_bg:"高中畢業" },
  28:{ industry:"edu", company:"逢甲大學智慧運輸與物流創新中心", title:"專案助理", edu_bg:"逢甲大學運輸與物流學系" },
  29:{ industry:"it", company:"康和資訊系統股份有限公司", title:"業務部資深處長", edu_bg:"修平技術學院資訊管理系" },
  30:{ industry:"re", company:"大盛鑫開發實業有限公司", title:"總經理", edu_bg:"中國文化大學建築及都市設計學系" },
  31:{ industry:"gov", company:"彰化縣彰化地政事務所", title:"測量員", edu_bg:"輔仁大學英國語文學系" },
  32:{ industry:"gov", company:"內政部國土測繪中心", title:"技士", edu_bg:"國立成功大學測量及空間資訊學系" },
  33:{ industry:"eng", company:"黎明工程顧問股份有限公司", title:"景觀工程師", edu_bg:"東海大學景觀學系" },
  34:{ industry:"re", company:"揚陞建設開發有限公司", title:"董事長", edu_bg:"嶺東商業專科學校銀行保險科" },
  35:{ industry:"gov", company:"臺中市政府捷運工程局", title:"股長", edu_bg:"高考測量製圖職系及格（110 年）" },
  36:{ industry:"law", company:"陳朝琴地政士事務所", title:"地政士", edu_bg:"僑光科技大學資訊科技系碩士班" },
  37:{ industry:"enr", company:"先鋒能源集團", title:"經理", edu_bg:"嘉南藥理大學化粧品應用與管理系" },
  38:{ industry:"broker", company:"中信房屋", title:"經理", edu_bg:"臺中市立臺中家事商業高級中等學校" },
  39:{ industry:"law", company:"台灣車輛股份有限公司", title:"法務專業管理師", edu_bg:"國立中興大學法律學系" },
  40:{ industry:"eng", company:"杜風工程服務股份有限公司", title:"監造主任", edu_bg:"臺北市立士林高級商業職業學校" },
  41:{ industry:"enr", company:"Vestas Taiwan", title:"離岸風電技師", edu_bg:"文藻外語大學英國語文學系" },
  42:{ industry:"con", company:"良品營造有限公司", title:"工程師", edu_bg:"逢甲大學商學進修學士學位學程" },
  43:{ industry:"edu", company:"光德國中", title:"教師", edu_bg:"逢甲大學統計學系" },
  44:{ industry:"arch", company:"黃乃弘建築師事務所", title:"副理", edu_bg:"高苑技術學院建築科" },
  45:{ industry:"int", company:"迪化街窗簾有限公司", title:"總經理", edu_bg:"臺北市私立滬江高級中學" },
  46:{ industry:"it", company:"碳基科技股份有限公司", title:"無人機整合工程師", edu_bg:"修平科技大學資訊網路技術系" },
  47:{ industry:"eng", company:"台灣世曦工程顧問股份有限公司", title:"監造工程師兼安衛工程師", edu_bg:"建國科技大學機械工程系" },
  48:{ industry:"it", company:"遠傳電信股份有限公司", title:"專案經理", edu_bg:"建國科技大學電腦與通訊工程系" },
  49:{ industry:"con", company:"竣富營造股份有限公司", title:"工地主任", edu_bg:"中國文化大學資訊管理學系" },
  50:{ industry:"con", company:"圓林工程行", title:"工程管理人員", edu_bg:"建國科技大學自動化工程系" }
};
