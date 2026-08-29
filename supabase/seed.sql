-- 種子資料：50 位同學（來源 115 學年度新生名冊）
-- ⚠️ 可重複執行。已認領的 line_user_id 不會被蓋掉；
--    同學自己改過的欄位也不會被名冊原值覆寫（見最後的 coalesce）。

insert into public.cohorts (id, name, year, is_current) values
  (10, '第十屆', '115 學年度入學', true)
on conflict (id) do update set name = excluded.name, year = excluded.year;

insert into public.members (id, cohort, sort, name, grp, officer, status) values
  (1, 10, 101, '江麗雯', 're', '', ''),
  (2, 10, 102, '張耀今', 're', '', ''),
  (3, 10, 103, '廖婕茹', 're', '', ''),
  (4, 10, 104, '林家德', 're', '', ''),
  (5, 10, 105, '施潔伶', 're', '', ''),
  (6, 10, 106, '李志銓', 're', '', ''),
  (7, 10, 107, '陳夙貞', 're', '不動產組代', ''),
  (8, 10, 108, '陳鈺芬', 're', '', ''),
  (9, 10, 109, '楊秉樺', 're', '', ''),
  (10, 10, 110, '吳弈均', 're', '', ''),
  (11, 10, 111, '許朝勝', 're', '', ''),
  (12, 10, 112, '陳志偉', 're', '', ''),
  (13, 10, 113, '王佑丞', 're', '學務', ''),
  (14, 10, 114, '陳柏翰', 're', '', ''),
  (15, 10, 115, '林家榛', 're', '公關', ''),
  (16, 10, 116, '蔡欣嶧', 're', '', ''),
  (17, 10, 117, '林咨辰', 're', '', ''),
  (18, 10, 201, '莊尚儒', 'land', '', ''),
  (19, 10, 202, '陳建元', 'land', '', ''),
  (20, 10, 203, '王麗秋', 'land', '副班代', ''),
  (21, 10, 204, '石聰敏', 'land', '', ''),
  (22, 10, 205, '林青瑜', 'land', '總務', ''),
  (23, 10, 206, '張現傑', 'land', '班代', ''),
  (24, 10, 207, '劉育修', 'land', '', ''),
  (25, 10, 208, '陳衫穎', 'land', '活動', ''),
  (26, 10, 209, '李品妍', 'land', '', ''),
  (27, 10, 210, '陳志勇', 'land', '', ''),
  (28, 10, 211, '周彥萱', 'land', '', ''),
  (29, 10, 212, '賴豐升', 'land', '', ''),
  (30, 10, 213, '蔡輝煌', 'land', '', ''),
  (31, 10, 214, '陳其君', 'land', '', ''),
  (32, 10, 215, '林秉賢', 'land', '', ''),
  (33, 10, 216, '李牧襄', 'land', '', ''),
  (34, 10, 217, '張新華', 'land', '國土運輸組代', ''),
  (35, 10, 218, '鄭予嘉', 'land', '', ''),
  (36, 10, 219, '陳紀安', 'land', '', ''),
  (37, 10, 220, '吳偉如', 'land', '', ''),
  (38, 10, 221, '江勻穎', 'land', '', 'leave'),
  (39, 10, 222, '歐庭愷', 'land', '', 'leave'),
  (40, 10, 223, '張景程', 'land', '', 'leave'),
  (41, 10, 224, '謝庭振', 'land', '', 'leave_active'),
  (42, 10, 301, '呂宣', 'smart', '', ''),
  (43, 10, 302, '吳佳玲', 'smart', '財務', ''),
  (44, 10, 303, '黃程豐', 'smart', '智慧防災組代', ''),
  (45, 10, 304, '梁逸輝', 'smart', '', ''),
  (46, 10, 305, '郭家興', 'smart', '', ''),
  (47, 10, 306, '劉又菁', 'smart', '', ''),
  (48, 10, 307, '詹凱程', 'smart', '', ''),
  (49, 10, 308, '林振其', 'smart', '', ''),
  (50, 10, 309, '洪明通', 'smart', '', 'leave')
on conflict (id) do update set
  sort = excluded.sort, name = excluded.name, grp = excluded.grp,
  officer = excluded.officer, status = excluded.status;

insert into public.profiles (member_id, industry, company, title, edu_bg, nickname, tag, headline, intro, resource, wish, topics, web, line_url, q_why, q_thesis, q_team) values
  (1, 'gov', '臺中市和平區公所', '課員', '國立政治大學地政學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (2, 're', '澄都建設有限公司', '負責人', '嘉南藥理大學應用空間資訊系', null, null, null, null, null, null, null, null, null, null, null, null),
  (3, 're', '國雄建設', '成控', '朝陽科技大學應用英語系', null, null, null, null, null, null, null, null, null, null, null, null),
  (4, 'gov', '空軍司令部防空砲兵指揮部', '後勤助理士', '空軍航空技術學院機械工程科', null, null, null, null, null, null, null, null, null, null, null, null),
  (5, 'gov', '南投縣埔里地政事務所', '課員', '逢甲大學土地管理學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (6, 'law', '李志銓地政士事務所', '地政士', '高雄市普門高級中學', null, null, null, null, null, null, null, null, null, null, null, null),
  (7, 're', '太子建設開發股份有限公司', '股長', '僑光商業專科學校會計統計科', null, null, null, null, null, null, null, null, null, null, null, null),
  (8, 'broker', '永義房屋　育賢樹孝店', '業務', '國立勤益科技大學流通管理系', null, null, null, null, null, null, null, null, null, null, null, null),
  (9, 'mfg', '三洋磁磚台中分公司　聯洋建材', '業務專員', '中臺科技大學國際企業系', null, null, null, null, null, null, null, null, null, null, null, null),
  (10, 'int', '澄橙花佐宅室內裝修資訊整合有限公司', '負責人', '國立中山大學醫務管理研究所', null, null, null, null, null, null, null, null, null, null, null, null),
  (11, 'int', '展藝室內裝修資訊整合有限公司', '負責人', '建國科技大學土木工程科', null, null, null, null, null, null, null, null, null, null, null, null),
  (12, 're', '由鉅建設股份有限公司', '專員／代書', '國立臺中科技大學財務金融系', null, null, null, null, null, null, null, null, null, null, null, null),
  (13, 'apr', '卓越不動產估價師聯合事務所', '不動產估價師', '國立成功大學都市計劃學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (14, 're', '陸府建設', '市場延展特助', '僑光科技大學餐飲管理系', null, null, null, null, null, null, null, null, null, null, null, null),
  (15, 'law', '鄭代書事務所', '登記助理員', '嶺東科技大學企業管理系', null, null, null, null, null, null, null, null, null, null, null, null),
  (16, 'mfg', '環球水泥股份有限公司', '廠長', '國立中山大學公共事務管理研究所', null, null, null, null, null, null, null, null, null, null, null, null),
  (17, 're', '汯益開發有限公司', '業務員', '僑光科技大學財務金融系', null, null, null, null, null, null, null, null, null, null, null, null),
  (18, 're', '英奇建設有限公司', '總經理', 'McGill University, Bachelor of Commerce', null, null, null, null, null, null, null, null, null, null, null, null),
  (19, 'con', '港洲營造股份有限公司', '專案經理', '中原大學土木工程學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (20, 're', '永騰錩不動產開發有限公司', '負責人', '逢甲大學經營管理碩士在職學位學程', null, null, null, null, null, null, null, null, null, null, null, null),
  (21, 'law', '石聰敏地政士事務所', '地政士', '南榮科技大學電機工程科', null, null, null, null, null, null, null, null, null, null, null, null),
  (22, 'arch', '九典聯合建築師事務所', '職業安全衛生工程師', '弘光醫事護理專科學校工業安全衛生科', null, null, null, null, null, null, null, null, null, null, null, null),
  (23, 'broker', '睦聚地產開發有限公司', '負責人', '長庚大學資訊管理學系研究所', 'Mac', '工業地產', '工業地產的『地圖』——中台灣哪塊地能蓋、能不能買，問我最快', '工業地產經紀人，深耕中台灣產業園區與廠房、工業地買賣，主要服務台中產業園區、精密機械園區、大里工業區、彰濱與南崗一帶。

買方端：協助製造業主依製程需求、電力、廢水、使用分區與擴廠年限，篩出真正可用的基地，並以實價登錄與現場查證判斷價格合不合理。

賣方端：協助資產持有者盤點土地價值、規劃出場時機與銷售策略，把物件送到對的產業買方面前。

也承接土地開發評估與資產配置諮詢。', '・中台灣工業地／廠房／廠辦的第一手待售與待租標的
・特定園區、路段的實價登錄行情判讀（不是丟表格給你，是告訴你這筆能不能拿來比）
・土地可行性初判：使用分區、建蔽容積、能不能蓋你要的廠房
・產權與交易風險排查（謄本、地籍、他項權利、法拍與共有問題）
・配合的建築師、代書、估價師、環境檢測、營造窗口
・製造業主／地主／開發商的人脈引介', '有擴廠、遷廠、購地需求的製造業主；手上有閒置土地或老廠房想處分的地主；找標的的開發商與投資方。

這班本身就是最好的資源：公部門的都計與地政、地政士、估價師、結構與工程技師、營造與建築師 —— 我手上的案子幾乎每一件都會用到你們其中一種，很願意互相導流。', '工業地產、產業園區、實價登錄行情、土地開發評估、廠房買賣、資產配置', 'https://mac2good909777-commits.github.io/about/', 'https://line.me/ti/p/WqW34GMG5R', '做工業地產十幾年，判斷都是從市場長出來的。想把國土計畫、都市計畫、運輸規劃這幾套「上游的邏輯」補起來 —— 知道一塊地為什麼會變成現在這樣，才有辦法判斷它接下來會變成什麼。', '想做中台灣產業園區的地價形成機制，用實價登錄的實際成交去驗證：重大交通建設、分區變更、龍頭企業進駐，這三件事各自把地價推動了多少、時間落差多久。', '想找做交通運輸規劃、以及公部門都計背景的同學。我有市場端的成交資料與案例，你們有制度端與規劃端的視角，湊在一起才是完整的一份報告。'),
  (24, 'gov', '臺中市政府捷運工程局', '科員', '國立成功大學測量及空間資訊學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (25, 'broker', '三贏不動產', '負責人', '臺中技術學院應用日語科', null, null, null, null, null, null, null, null, null, null, null, null),
  (26, 'broker', '台灣房屋　七期特許加盟店', '高專', '銘傳大學應用英語學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (27, 'broker', '台中不動產有限公司', '負責人', '高中畢業', null, null, null, null, null, null, null, null, null, null, null, null),
  (28, 'edu', '逢甲大學智慧運輸與物流創新中心', '專案助理', '逢甲大學運輸與物流學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (29, 'it', '康和資訊系統股份有限公司', '業務部資深處長', '修平技術學院資訊管理系', null, null, null, null, null, null, null, null, null, null, null, null),
  (30, 're', '大盛鑫開發實業有限公司', '總經理', '中國文化大學建築及都市設計學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (31, 'gov', '彰化縣彰化地政事務所', '測量員', '輔仁大學英國語文學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (32, 'gov', '內政部國土測繪中心', '技士', '國立成功大學測量及空間資訊學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (33, 'eng', '黎明工程顧問股份有限公司', '景觀工程師', '東海大學景觀學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (34, 're', '揚陞建設開發有限公司', '董事長', '嶺東商業專科學校銀行保險科', null, null, null, null, null, null, null, null, null, null, null, null),
  (35, 'gov', '臺中市政府捷運工程局', '股長', '高考測量製圖職系及格（110 年）', null, null, null, null, null, null, null, null, null, null, null, null),
  (36, 'law', '陳朝琴地政士事務所', '地政士', '僑光科技大學資訊科技系碩士班', null, null, null, null, null, null, null, null, null, null, null, null),
  (37, 'enr', '先鋒能源集團', '經理', '嘉南藥理大學化粧品應用與管理系', null, null, null, null, null, null, null, null, null, null, null, null),
  (38, 'broker', '中信房屋', '經理', '臺中市立臺中家事商業高級中等學校', null, null, null, null, null, null, null, null, null, null, null, null),
  (39, 'law', '台灣車輛股份有限公司', '法務專業管理師', '國立中興大學法律學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (40, 'eng', '杜風工程服務股份有限公司', '監造主任', '臺北市立士林高級商業職業學校', null, null, null, null, null, null, null, null, null, null, null, null),
  (41, 'enr', 'Vestas Taiwan', '離岸風電技師', '文藻外語大學英國語文學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (42, 'con', '良品營造有限公司', '工程師', '逢甲大學商學進修學士學位學程', null, null, null, null, null, null, null, null, null, null, null, null),
  (43, 'edu', '光德國中', '教師', '逢甲大學統計學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (44, 'arch', '黃乃弘建築師事務所', '副理', '高苑技術學院建築科', null, null, null, null, null, null, null, null, null, null, null, null),
  (45, 'int', '迪化街窗簾有限公司', '總經理', '臺北市私立滬江高級中學', null, null, null, null, null, null, null, null, null, null, null, null),
  (46, 'it', '碳基科技股份有限公司', '無人機整合工程師', '修平科技大學資訊網路技術系', null, null, null, null, null, null, null, null, null, null, null, null),
  (47, 'eng', '台灣世曦工程顧問股份有限公司', '監造工程師兼安衛工程師', '建國科技大學機械工程系', null, null, null, null, null, null, null, null, null, null, null, null),
  (48, 'it', '遠傳電信股份有限公司', '專案經理', '建國科技大學電腦與通訊工程系', null, null, null, null, null, null, null, null, null, null, null, null),
  (49, 'con', '竣富營造股份有限公司', '工地主任', '中國文化大學資訊管理學系', null, null, null, null, null, null, null, null, null, null, null, null),
  (50, 'con', '圓林工程行', '工程管理人員', '建國科技大學自動化工程系', null, null, null, null, null, null, null, null, null, null, null, null)
on conflict (member_id) do update set
  industry = coalesce(nullif(public.profiles.industry, ''), excluded.industry),
  company = coalesce(nullif(public.profiles.company, ''), excluded.company),
  title = coalesce(nullif(public.profiles.title, ''), excluded.title),
  edu_bg = coalesce(nullif(public.profiles.edu_bg, ''), excluded.edu_bg),
  nickname = coalesce(nullif(public.profiles.nickname, ''), excluded.nickname),
  tag = coalesce(nullif(public.profiles.tag, ''), excluded.tag),
  headline = coalesce(nullif(public.profiles.headline, ''), excluded.headline),
  intro = coalesce(nullif(public.profiles.intro, ''), excluded.intro),
  resource = coalesce(nullif(public.profiles.resource, ''), excluded.resource),
  wish = coalesce(nullif(public.profiles.wish, ''), excluded.wish),
  topics = coalesce(nullif(public.profiles.topics, ''), excluded.topics),
  web = coalesce(nullif(public.profiles.web, ''), excluded.web),
  line_url = coalesce(nullif(public.profiles.line_url, ''), excluded.line_url),
  q_why = coalesce(nullif(public.profiles.q_why, ''), excluded.q_why),
  q_thesis = coalesce(nullif(public.profiles.q_thesis, ''), excluded.q_thesis),
  q_team = coalesce(nullif(public.profiles.q_team, ''), excluded.q_team)
;
