Vocabulary Explorer 2.2 — Cloudflare Worker 版

重點：
- 不使用 Python / Flask / localhost / 127.0.0.1。
- API 全部在 Cloudflare Worker 執行：/api/lookup、/api/longman、/api/etymology。
- 歷史與收藏改存手機/瀏覽器 localStorage，不需要 D1/KV，不產生額外資料庫費用。
- 修正 Worker / Safari 的 URL 建構：所有外部 fetch 都使用完整 https:// 絕對 URL。
- 保留原本 Responsive UI。

部署檔案：wrangler.jsonc、src/worker.js、public/。
