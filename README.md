# Better life｜GitHub Pages 獨立版

繁體中文的個人減重與生活紀錄工具。此版本不使用 ChatGPT 登入、不依賴 ChatGPT Plus／Pro，也不呼叫 OpenAI 服務。無需安裝套件或執行建置，將網站檔案放到 GitHub Pages 即可開啟。

## 第一次上線：用 GitHub 網頁操作

1. 登入自己的 [GitHub](https://github.com/)，建立新 repository，名稱建議 `better-life`。
2. 如果使用 GitHub Free，選 **Public**。公開的是程式與網站介面；不要上傳自己的紀錄備份、真實餐照或 API 金鑰。
3. 將收到的 ZIP 解壓縮。進入 `better-life-github` 資料夾。
4. 在 repository 使用 **Add file → Upload files**，上傳這個資料夾「裡面的檔案」，而非 ZIP 或整個外層資料夾。務必讓 `index.html` 直接出現在 repository 最上層。`tests`、`README.md` 等也可以一起上傳。
5. 按 **Commit changes**。第一次上傳後通常會使用 `main` 分支。
6. 開啟 repository 的 **Settings → Pages**。
7. 在 **Build and deployment → Source** 選 **Deploy from a branch**。
8. Branch 選 **main**，資料夾選 **/(root)**，按 **Save**。
9. 等 Pages 顯示發布完成，使用該頁提供的 **Visit site** 開啟正式網址。不要從 GitHub 的程式檔案預覽使用 App。

支援一般專案網址 `/better-life/`，也支援網站根目錄；不需要修改程式中的路徑。此包含 `.nojekyll`，但不必額外設定 GitHub Actions。

官方部署說明：
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 從舊版搬移資料（先做這一步）

1. 在原本有紀錄的手機與瀏覽器／主畫面 App 開啟舊版 Better life。
2. 點右上角 **備份與還原 → 下載完整 JSON 備份**，確認已存入 iPhone「檔案」。這份 JSON 包含已儲存的食物照片。
3. 開啟新版 GitHub Pages 正式網址。
4. 若要以 iPhone 主畫面 App 使用，先以 Safari 分享 → **加入主畫面**，再從這個新圖示開啟並匯入。不同入口可能使用不同儲存空間，請以最後實際使用的入口為準。
5. 新版右上角 **備份與還原 → 換手機／還原備份**，選擇剛才的 JSON。
6. 核對各類紀錄筆數及照片張數，勾選已備份，按 **確認取代並還原**。
7. 檢查體重、飲食照片、注射、帳本與生活紀錄。確認成功之前，保留舊版與原始 JSON。

新版不會自動讀取舊網址的紀錄。匯入會取代目前新版的資料，不會合併；請先備份新版已新增的紀錄。錯誤檔案不會更動現有資料。單次匯入上限仍為 250 MB。

## 初始體重與圖表

- 全新安裝預設：**2026/10/18、70.5 公斤**；可在個人設定修改。
- 圖表會將設定中的起始體重納入繪製，並與後續體重連線。這個起始點是設定資料，不會捏造一筆量測時間或脂肪／肌肉數值。
- 同日已有相同起始體重時不會畫重複起點；同日不同體重則保留。
- 體重頁預設顯示「全部」。選擇 1／3／6 個月時依期間篩選，因此起始日期若已在期間外就不顯示。
- 首頁資料很多時保留第一個點與最近 29 筆，最多顯示 30 點。
- 匯入舊版備份會保留備份內的開始日期與起始體重。若舊版設定不是 2026/10/18、70.5，請於匯入後到個人設定調整；不強制覆寫你的備份。

## 飲食 AI（選用）

手動記錄、食物照片保存、貼上 AI 回覆皆可在未設定金鑰時使用。

1. 使用自己的 Google 帳戶開啟 https://aistudio.google.com/apikey 。
2. 建立／選擇本工具專用金鑰。可用地區、模型與免費額度以 Google 帳戶顯示為準；不必為此訂閱 ChatGPT。
3. 回到 App：**個人設定 → AI 連線狀態**，貼入金鑰，按 **本次啟用 AI**。
4. 到飲食頁選文字或照片估算，確認同意送出後才連線 Google。結果先顯示可編輯的草稿，儲存後才成為紀錄。

金鑰只在目前頁面的記憶中，重新載入或關閉後需重填。可隨時在 AI 設定清除；不寫入 IndexedDB、JSON 備份、網址或程式原始碼。只傳這次的食物文字／照片，其他健康紀錄不傳送。此版不使用任何共用的後端金鑰。

純靜態個人工具採「使用者自行輸入金鑰」方式，金鑰在使用期間仍位於瀏覽器記憶中，不能當作伺服器端保密保管。如果日後要多人共用一把金鑰或長期免重填，應另建具存取控制的後端代理，不能把金鑰寫進 GitHub 或 GitHub Pages JavaScript。Google 官方建議正式應用使用後端保護金鑰：
https://ai.google.dev/gemini-api/docs/generate-content/api-key

目前使用 `gemini-3.8-flash`，模型 ID 集中在 `ai.js` 的 `DEFAULT_MODEL`。模型停用或帳戶不適用時會顯示錯誤並可改用手動／貼回覆，不會自動換模型或重試。沒有自動開通付費或購買額度的功能；如果你已在 Google 開啟計費，API 呼叫仍依該帳戶規則計費，程式無法保證強制免費。

Google 模型與請求格式：
https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
https://ai.google.dev/api/generate-content

## 保存、離線與通知

- 紀錄及壓縮餐照保存在使用中的瀏覽器 IndexedDB；沒有健康資料上傳 GitHub 或雲端同步。
- 資料庫與離線快取依網站資料夾區分，避免同一 GitHub 網域下不同專案互相影響。
- 第一次需連網完整載入。在 HTTPS 的 GitHub Pages 完成離線安裝後，可離線手動新增／查看紀錄及照片；AI 與 Google 日曆仍需連網。
- 清除網站資料、瀏覽器自動清理、移除 App、更換手機或網址，都可能讓舊紀錄無法取得。請定期將完整 JSON 存到 iPhone「檔案」。主畫面圖示不是備份。
- 網站更新不清除 IndexedDB。之後更新 `sw.js` 的 `VERSION`，讓離線資源更新。
- Google 日曆按鈕只開啟草稿。儲存事件、通知權限與鎖屏送達仍需在手機上確認；不會由 App 背景自動推播。
- 免登入表示同一個瀏覽器儲存空間沒有另一道帳號保護；他人在別的裝置開啟網址會取得自己的空白紀錄，不會看到你手機裡的資料。

## 更新程式

先匯出 JSON，再以新版本檔案覆蓋 repository。保持同一網址、資料夾名稱及瀏覽器使用入口；正式發布後重開或重新整理 App。不要刪除手機網站資料來更新。

## 檔案與驗證

網站必要檔案：`index.html`、`app.js`、`core.js`、`ai.js`、`style.css`、`sw.js`、`manifest.webmanifest`、`icon.png`。

`package.json` 與 `tests/` 用於維護者測試，網站發布本身不需要 Node.js 或 npm。執行自動測試：

```sh
npm test
```

驗證內容與尚未完成的實機項目見 `TESTING.md`。
