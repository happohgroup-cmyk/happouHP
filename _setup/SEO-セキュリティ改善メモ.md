# SEO・セキュリティ改善（2026-07-11）— コード変更まとめ & 手作業メモ

このブランチ `seo-security` で実施した内容と、コードでは完結しない「管理画面・外部サービス側の作業」をまとめる。

## コードで実施した変更
- **Functionsセキュリティヘッダー**：`functions/_middleware.js` を新設。全 `/api/*` 応答に
  X-Content-Type-Options / X-Frame-Options(DENY) / Referrer-Policy / Permissions-Policy / HSTS /
  CSP(`default-src 'none'`) を付与（静的は従来どおり `_headers`）。
- **構造化データ**：トップに `WebSite`（＋既存 `Organization`）、下層10ページに `BreadcrumbList` を追加（JSON-LDのみ、画面表示は変更なし）。
- **sitemap.xml**：11の正規URL（拡張子なし）に整理。`lastmod` は git 最終更新日、`changefreq`/`priority` は削除。お知らせ詳細はハッシュURL構成のため未収録（現状維持）。
- **お問い合わせフォーム堅牢化**（`functions/api/contact.js`）：
  - Cloudflare Turnstile のサーバー側検証（Siteverify＋hostname確認、fail-closed）
  - スプレッドシート数式インジェクション無害化（先頭 `= + - @ タブ CR` を `'` 前置で文字列化）
  - リクエストボディ 25KB 上限
  - （既存）Origin/Referer・Content-Type・honeypot・長さ/メール検証・405/415
- **Turnstile ウィジェット**（`会社概要.html`）：フォームに設置＋送信JSでトークン送出＋失敗時 reset。
- **CSP**：`_headers` の script-src / frame-src に `https://challenges.cloudflare.com` を追加。

---

## ⚠️ 本番公開前に必須（Cloudflare管理画面）

### 1. Turnstile 実キーの発行と設定
現在フロントは**公式テストキー**（`1x00000000000000000000AA`＝常に成功）、バックエンドも未設定時はテストシークレットにフォールバックする。**このままだとスパム検証が実質無効**なので、本番では必ず実キーへ差し替える。
1. Cloudflare ダッシュボード → **Turnstile** → ウィジェット追加。ドメインに `happoh.com`（と必要なら `*.pages.dev`）を登録。ウィジェットモード=Managed 推奨。
2. 発行された **サイトキー（公開）** を `会社概要.html` の `data-sitekey="1x00000000000000000000AA"` と差し替え。
3. 発行された **シークレットキー（非公開）** を Pages → Settings → Environment variables に
   `TURNSTILE_SECRET_KEY` として **Production**（必要なら Preview も）に設定 → 再デプロイ。

### 2. 環境変数（Production / Preview の両方を確認）
- `GAS_URL`（設定済み）／`MICROCMS_API_KEY`（設定済み）／`TURNSTILE_SECRET_KEY`（**要追加**）。
- Preview環境にも変数が無いと、Preview で news/contact/Turnstile が本番同等に動かない点に注意。

### 3. SSL/TLS・HTTPS（確認）
- SSL/TLS 暗号化モード = **Full (Strict)** 推奨（Pages 接続なら通常これでOK）。
- **Always Use HTTPS = ON**、**Automatic HTTPS Rewrites = ON** を確認。
- HSTS はコード側(_headers/_middleware)で付与済み。**管理画面のHSTSは設定しない**（二重管理回避）。`includeSubDomains` は現状 `happoh.com`＋`www` のみHTTPS運用のため付与。`preload` は付けない。

### 4. WAF / Bot（無料プラン）
- **WAF**：Security → WAF で **Cloudflare Free Managed Ruleset** を有効化（無料枠で可）。
- **Bot Fight Mode**：誤検知（正常な自動アクセス・クローラー）リスクがあるため**即ONにしない**。有効化する場合は Security Events で誤検知を監視。microCMS Webhook等の自動アクセスがある場合は特に注意。
- **DNSSEC**：DNS → Settings で有効化推奨（なりすまし対策）。

### 5. （任意）レート制限
- 現状は Turnstile＋honeypot＋Origin確認で基本対策済み。追加するなら **管理画面の Rate Limiting Rules**（`/api/contact` に対しIP単位で短時間の回数制限）。コードのメモリ変数では実装しない。IPは長期保存しない。

---

## Google 側
- **Search Console**：ドメインプロパティ `happoh.com` を追加 → `https://happoh.com/sitemap.xml` を送信。
- **Googleビジネスプロフィール**：各店舗のNAP（店名・住所・電話）を公式サイト表記と統一（コードでは不可）。

## GAS（デプロイ済みスクリプト）
- 数式インジェクション無害化は **contact.js（Function）側で実施済み**のため、GAS側の変更は不要。
- リポジトリの `_setup/gas-contact.gs` は参照用。実運用は Apps Script のデプロイ済み版。

## 確認が必要な情報（構造化データ/ローカルSEO強化に必要・未提供）
- 各店舗：正式名称/住所（建物・階）/店舗電話/営業時間/定休日/最寄駅/GoogleマップURL/公式SNS/価格帯/予約方法。
- 会社公式SNS（Organization.sameAs 用）。
- → 提供いただければ、店舗の Restaurant/LocalBusiness 構造化データや `sameAs` を追加可能（現状は掲載情報が無いため未実装）。
