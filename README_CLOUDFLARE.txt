Vocabulary Explorer 2.7 — Cloudflare Worker 版

重點：
- 不使用 Python / Flask / localhost / 127.0.0.1。
- API 全部在 Cloudflare Worker 執行：/api/lookup、/api/longman、/api/etymology。
- 查詢歷史改存 sessionStorage：同一瀏覽器分頁/工作階段內保留，關閉後自動清空。
- 收藏維持 localStorage：關閉瀏覽器後仍保留。
- 首次載入 2.4 會自動移除 2.2/2.3 遺留的永久查詢歷史，不影響收藏。
- 不需要 D1/KV，不產生額外資料庫費用。
- 修正 Worker / Safari 的 URL 建構：所有外部 fetch 都使用完整 https:// 絕對 URL。
- 保留原本 Responsive UI。

部署檔案：wrangler.jsonc、src/worker.js、public/。


2.3 發音修正：
- 將 Windows 2.1 的 Cambridge 發音掃描規則完整移植到 Worker。
- 支援 source/audio src、data-src-mp3、data-src-ogg、audioUrl、uk_pron/us_pron 等格式。
- 新增 /api/audio 同源音訊代理；2.6 起同時支援 Cambridge 與 Longman 的 /media/english/ 音訊。
- iPhone Safari 優先播放 Cambridge 真人音檔；抓不到音檔時才使用瀏覽器 TTS。

Worker 名稱已對齊目前正式網址：english-dictionary-multi-platform.astral3733.workers.dev


2.4 歷史紀錄修正：
- sidebar 查詢歷史由 localStorage 改為 sessionStorage。
- 重新整理頁面仍可保留目前工作階段的查詢紀錄。
- 關閉分頁/瀏覽器工作階段後，查詢歷史自動清空。
- 收藏仍永久保留，除非使用者自行清除網站資料。


2.5 跨平台發音相容性修正：
- /api/audio 正式支援 HTTP Range，Safari/Chrome 可取得 206 Partial Content。
- 若 Cambridge 忽略 Range 並回 200，Worker 會自行切片並產生正確的 Content-Range/Content-Length。
- Cambridge 發音來源優先選 MP3，OGG 僅作備援。
- 前端維持單一 Audio 實例生命週期，避免 iOS Safari 播放物件被回收或競態。
- 播放順序：同源 Worker 音訊代理 → Cambridge 直接音訊 → 瀏覽器 TTS。
- 同一版本以桌面瀏覽器、Windows/macOS、iPhone/iPad Safari、Android Chrome 為相容目標。
- 不加入 D1、KV 或任何付費 Cloudflare 功能。


2.6 Longman 真人發音：
- Longman 英英頁加入 UK / US 真人發音解析。
- 支援 LDOCE headword speaker 的 brefile（British）與 amefile（American）data-src-mp3。
- 支援相對與完整的 /media/english/breProns/、/ameProns/ MP3 URL。
- /api/audio 同一套 Range/206 音訊代理同時允許 Cambridge 與 Longman。
- 切換 Cambridge/Longman 分頁時，上方 UK/US 發音按鈕會同步切換到該字典來源。
- 若目前來源沒有真人音檔，才使用瀏覽器 TTS。
- Etymonline 為字源來源，不改變目前字典發音來源。


2.7 iOS / PWA 圖示與搜尋列尺寸：
- 沿用既有 icon.ico，不重新設計圖示。
- 新增 apple-touch-icon.png（180×180），供 iPhone / iPad「加入主畫面」使用。
- 新增 PWA 192×192、512×512 圖示與 manifest.webmanifest。
- 新增 16×16、32×32 favicon PNG，並保留原 favicon.ico。
- 加入 iOS standalone / web app 相關 meta 設定；Android/Chrome 亦可讀取同一份 manifest。
- 「查詢」與「重新抓取」按鈕高度調整為 50px，與左側輸入列完全一致。
- 維持 Cloudflare Workers + Static Assets 架構，不加入 D1、KV 或其他付費功能。
