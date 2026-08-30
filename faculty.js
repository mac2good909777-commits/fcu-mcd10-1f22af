/* ────────────────────────────────────────────────────────────────
   師資與系所聯絡方式
   來源：115 學年度新生手冊「參、師資介紹暨聯絡方式」「三、系所聯絡方式」

   ⛔ 分機與 Email 是【登入後才顯示】的。
      這是從新生手冊抄來的內部聯絡資訊，公開放在網頁上會被爬蟲收走，
      老師的信箱就會開始收垃圾信。學程辦公室是對外窗口，例外公開。
      遮蔽在 app.js 的 render_faculty 裡做。

   ⚠️ 找指導教授時真正在找的是「專長對不對得上我的題目」，
      所以專長欄要能搜尋 —— 這一頁的搜尋框搜的是專長，不是只有姓名。

   ⚠️ fcuId 是學程官網的老師編號（teachers-detail/?id=…&unit_id=CD16）。
      ⛔ 取完整名單的方法：師資頁預設分頁是 JS 載入的，直接抓 offset
         只會一直拿到第一頁的 12 位。要改用【職稱篩選 + limit=99】：
           /teachers/?offset=0&limit=99&job_title=Associate+Professor
         把每個職稱各抓一次才會完整（2026-08-30 這樣抓到 34 位）。
      ⚠️ 老師分散在不同系所網站，所以除了 fcuId 還要記 fcuUnit 與 fcuHost：
           mcd（本學程 CD16）、civil（土木 CE01）、he（水利 CE02）、lm（土管 CM03）
         沒寫 fcuHost 的預設是 mcd/CD16。
      沒有 fcuId 的（官網上查不到個人頁）就連到網站搜尋。
      ⛔ 不要用猜的編號組連結，點進去是別的老師比沒有連結更糟。

   ⚠️ 手冊上印的就照抄，包含看起來像筆誤的地方（例如 mctasi@），
      不要自作聰明改 —— 寄不出去是一回事，改錯地址是另一回事。
   ──────────────────────────────────────────────────────────────── */

const OFFICE = {
  title: "學程辦公室",
  when: "週二至週六",
  place: "丘逢甲紀念館 3 樓　紀 309 室",
  saturday: "週六人言大樓教室諮詢服務：人言大樓 1 樓　人言教育創新中心",
  staff: [
    { name:"謝政穎", title:"主任", ext:"3364", email:"jyshieh@o365.fcu.edu.tw" },
    { name:"蔡玗庭", title:"助教", ext:"3251", email:"ytingtsai@fcu.edu.tw" }
  ]
};

/* 專任教師。rank 用來分組排序，數字小的排前面。
   head:true 的排在最前面 —— 學程主任是同學第一個要找的人，
   不該按職稱順序埋在教授群裡。 */
const FACULTY_FULL = [
  { rank:1, title:"教授", name:"蘇昭銘", fcuId:"T06214", edu:"臺灣大學土木工程學研究所交通組博士",
    field:"運輸管理／先進公共運輸系統／運輸車隊管理／運輸地理資訊系統",
    ext:"4500、4659", email:"jmsu@o365.fcu.edu.tw" },
  { rank:1, title:"特聘教授", name:"周天穎", fcuId:"T80001", edu:"美國密西根州立大學資源發展博士",
    field:"空間資訊系統專論／資源開發實務／環境資訊系統專論／地理資訊系統概論",
    ext:"4550", email:"jimmychou@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"林良泰", fcuId:"T81223", edu:"臺灣大學土木工程研究所博士",
    field:"交通工程／交通控制／都市交通管理／車流理論",
    ext:"4658", email:"ltlin@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"陳建元", fcuId:"T94056", edu:"英國卡地夫大學城市與區域規劃博士",
    field:"區域及都市計畫／土地經濟／政府政策及管制／新制度經濟學／都市及區域經濟／資源環境經濟／政策及計畫評估",
    ext:"2300、4705", email:"cyuan@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"劉立偉", fcuId:"T89109", edu:"美國康乃爾大學城市及區域規劃博士",
    field:"都市計畫／都市設計／全球化與都市產業發展／社區營造／城鄉風貌／文化創意產業",
    ext:"3366", email:"lwliu@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"雷祖強", edu:"臺灣大學生物環境系統工程學系博士",
    field:"衛星遙測／地理資訊系統／空間統計分析",
    ext:"3357", email:"tclei@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"劉霈", fcuId:"T86017", edu:"美國俄亥俄州立大學土木所博士",
    field:"公路工程／人工智慧方法／數值方法／噪音與震動／鋪面工程",
    ext:"2500、4657", email:"pciliu@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"吳沛儒", edu:"交通大學交通運輸研究所博士",
    field:"物流管理／供應鏈管理／巨量資料分析",
    ext:"4668", email:"wupj@o365.fcu.edu.tw" },
  { rank:1, title:"教授", name:"謝政穎", fcuId:"T82053", edu:"美國南加州大學都市計畫所博士",
    field:"都市計畫／國土及區域規劃／成長管理與都市設計／土地使用及公共設施規劃／區域及都市資訊系統／都市更新／都市交通運輸規劃",
    ext:"3364", email:"jyshieh@o365.fcu.edu.tw", note:"學程主任", head:true },
  { rank:1, title:"教授", name:"莊永忠", edu:"臺灣師範大學地理學博士",
    field:"地理資訊科學", ext:"3371", email:"yungcchuang@o365.fcu.edu.tw" },

  { rank:2, title:"副教授", name:"楊賀雯", fcuId:"T97053", edu:"英國威爾斯卡地夫大學都市及區域規劃學院博士",
    field:"不動產市場分析／不動產經營與管理／多變量分析／地方產業發展",
    ext:"4707", email:"hwyang@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"劉曜華", fcuId:"T83115", edu:"美國佛羅里達大學都市計畫所博士",
    field:"都市成長管理／都市規劃史／發展理論／都市規劃／文化產業",
    ext:"3370", email:"yhliou@o365.fcu.edu.tw、yhliou.liou@gmail.com" },
  { rank:2, title:"副教授", name:"葉昭甫", fcuId:"T01089", edu:"東巴黎大學經濟／管理與區域研究學院博士",
    field:"運輸規劃／運輸經濟／運輸政策／市區道路工程設計／智慧型運輸系統",
    ext:"4681", email:"cfyeh@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"朱南玉", fcuId:"T93117", edu:"台北大學都市計畫研究所博士",
    field:"不動產估價／不動產投資／土地使用管制／都市與區域規劃／土地稅／計量分析",
    ext:"4716", email:"nychu@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"林威延", fcuId:"T99121", fcuUnit:"CE01", fcuHost:"civil", edu:"臺灣大學土木工程學系博士",
    field:"地理資訊系統 GIS／營建管理／工程資訊管理／行動運算技術／空間資訊整合應用技術／營建資訊模擬",
    ext:"3100、3117", email:"weiylin@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"林喻峰", fcuId:"T12039", fcuUnit:"CE01", fcuHost:"civil", edu:"國立中興大學土木工程學系博士",
    field:"非破壞檢測技術／鋼筋混凝土／結構力學實驗／電腦輔助工程",
    ext:"3111", email:"yufeng@fcu.edu.tw" },
  { rank:2, title:"副教授", name:"徐逸祥", fcuId:"T02194", edu:"臺灣大學地理環境資源研究所博士",
    field:"環境多媒體 3D 模擬規劃／遙測影像處理／GIS",
    ext:"3350、3355", email:"ysshiu@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"張建彥", fcuId:"T87044", edu:"臺灣大學土木工程學所博士",
    field:"智慧型運輸系統／交通工程／車輛防撞警示／節能駕駛／資料分析",
    ext:"4662", email:"cyenchang@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"郭仲偉", edu:"國立台灣大學土木工程學系博士",
    field:"運輸規劃與管理／運輸需求分析／航空運輸",
    ext:"4664", email:"d91521007@ntu.edu.tw" },
  { rank:2, title:"副教授", name:"林大傑", fcuId:"T91157", edu:"美國加州大學柏克萊分校土木及環境工程系博士",
    field:"運輸規劃與管理／智慧型運輸系統／全球運籌管理／電子商務／交通改善方案之研擬與評估",
    ext:"4670", email:"dajielin@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"葉美伶", fcuId:"T89036", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"地理資訊系統／遙感探測／土地管理／專案管理／智慧城市",
    ext:"4583", email:"mlyeh@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"方耀民", fcuId:"T91144", edu:"逢甲大學土木及水利工程研究所博士",
    field:"智慧城市／防災監測／橋梁工程／土木工程",
    ext:"4569", email:"ymfang@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"穆青雲", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"智慧運輸物流／全球衛星定位／空間資訊應用／大數據分析／智慧城市／都市規劃／專案管理",
    ext:"4569", email:"cymu@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"吳銘順", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"水利工程／生態水理／河川水理",
    ext:"3096", email:"mswu@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"郝振宇", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"智慧城市／資料標準／空間資訊／遙感探測／雲端服務",
    ext:"4560", email:"cyhao@o365.fcu.edu.tw" },
  { rank:2, title:"副教授", name:"陳柏蒼", fcuId:"T95283", edu:"成功大學水利及海洋工程學系博士",
    field:"水資源系統分析／澇（旱）災害預警／災害防救／水文分析／環境生態評估／氣候混亂分析／人工智慧模式應用／水文統計／機率分析／程式設計／工程測量",
    ext:"3220", email:"btchen@o365.fcu.edu.tw" },
  { rank:2, title:"研究副教授", name:"劉建榮", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"生態檢核／水環境改善、河川與區域排水風險評估",
    ext:"6456", email:"liucj@o365.fcu.edu.tw" },

  { rank:3, title:"助理教授", name:"張育端", fcuId:"T00027", edu:"國立彰化師範大學地理學系博士",
    field:"不動產開發／不動產經營／都市發展／住宅／都市地理",
    ext:"4732", email:"ytuanchang@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"李長曄", fcuId:"T11052", edu:"耶魯大學法學院博士",
    field:"憲法／行政法／行政救濟法",
    ext:"4725", email:"changylee@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"黃啟倡", fcuId:"T97102", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"交通控制／統計分析／交通安全／交通工程設計與規劃／智慧停車",
    ext:"4541", email:"chichuang@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"蔡明璋", fcuId:"T90167", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"地理資訊系統／空間分析／防災管理／資源開發管理／環境監測",
    ext:"4569", email:"mctasi@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"辜文元", fcuId:"T88116", edu:"中山醫學大學公共衛生學系博士",
    field:"資訊軟體系統設計／地理資訊系統／健保資料庫／癌症地圖",
    ext:"4569", email:"wyku@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"何智超", fcuId:"T99079", edu:"交通大學土木工程學系博士",
    field:"水資源規劃／人工智慧與機械學習／氣候變遷／水文水理分析／遙測與空間分析／專案管理",
    ext:"3067", email:"chihcho@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"林秉賢", fcuId:"T97151", fcuUnit:"CE02", fcuHost:"he", edu:"逢甲大學土木及水利工程研究所博士",
    field:"水利工程／水保工程／土石流理論／GIS 軟體",
    ext:"3223", email:"bslin@o365.fcu.edu.tw" },
  { rank:3, title:"助理教授", name:"鍾侑達", fcuId:"T97369", fcuUnit:"CE02", fcuHost:"he", edu:"逢甲大學土木及水利博士學位學程博士",
    field:"水文水資源分析／計算流體力學／水文水理學／人工智慧",
    ext:"3240", email:"ydjhong@o365.fcu.edu.tw" }
];

/* 兼任教師。手冊只列學歷與專長，沒有聯絡方式。 */
const FACULTY_PART = [
  { title:"榮譽教授", name:"楊龍士", edu:"日本大學理工學院工學博士",
    field:"不動產經營管理／遙感探測學專論／建築設計／顧問諮詢" },
  { title:"教授", name:"葉名山", edu:"美國密西根州立大學土木工程研究所博士",
    field:"運輸安全／肇事分析／路面設計／工程與管理" },
  { title:"副教授", name:"張梅英", fcuId:"T73018", fcuUnit:"CM03", fcuHost:"lm", edu:"政治大學地政研究所博士",
    field:"不動產估價／土地政策與法規／情緒管理／領導藝術／領導與激勵／住宅問題研究／土地稅／土地經濟學／不動產金融／服務學習" },
  { title:"副教授級（專技）", name:"王靚琇", fcuId:"T99191", edu:"英國卡地夫大學城市及區域規劃研究所",
    field:"土地政策與法規／土地管理與利用／不動產估價" },
  { title:"副教授級（專技）", name:"謝錦龍", fcuId:"T78147", fcuUnit:"CM03", fcuHost:"lm", edu:"中國文化大學實業計劃研究所碩士",
    field:"營建法規／住宅計畫／不動產經營管理專論" },
  { title:"助理教授級（專技）", name:"林宏澔", fcuId:"T04199", edu:"東吳大學企業管理學系碩士",
    field:"不動產管理與實務" },
  { title:"助理教授級（專技）", name:"楊祥銘", edu:"逢甲大學土地管理學系碩士",
    field:"不動產估價及投資可行性評估／動產、無形資產鑑定" },
  { title:"助理教授級（專技）", name:"徐金煌", edu:"師範大學地理學系理學碩士",
    field:"電子電路設計／自動控制／程式設計／地理資訊／攝影測量" },
  { title:"助理教授級（專技）", name:"管志偉", fcuId:"T98122", edu:"逢甲大學建設規劃與工程博士學位學程博士候選人",
    field:"AI 影像辨識／GIS／MIS 系統開發／系統分析與設計／大數據分析／資料庫管理" }
];
