Vocabulary Explorer 2.3 — Cloudflare Worker 版

重點：
- 不使用 Python / Flask / localhost / 127.0.0.1。
- API 全部在 Cloudflare Worker 執行：/api/lookup、/api/longman、/api/etymology。
- 歷史與收藏改存手機/瀏覽器 localStorage，不需要 D1/KV，不產生額外資料庫費用。
- 修正 Worker / Safari 的 URL 建構：所有外部 fetch 都使用完整 https:// 絕對 URL。
- 保留原本 Responsive UI。

部署檔案：wrangler.jsonc、src/worker.js、public/。


2.3 發音修正：
- 將 Windows 2.1 的 Cambridge 發音掃描規則完整移植到 Worker。
- 支援 source/audio src、data-src-mp3、data-src-ogg、audioUrl、uk_pron/us_pron 等格式。
- 新增 /api/audio 同源音訊代理，只允許 Cambridge /media/english/ 音訊。
- iPhone Safari 優先播放 Cambridge 真人音檔；抓不到音檔時才使用瀏覽器 TTS。

Worker 名稱已對齊目前正式網址：english-dictionary-multi-platform.astral3733.workers.dev
