// =====================================================================
//  お知らせ取得プロキシ — Cloudflare Pages Functions
//  ---------------------------------------------------------------
//  GET /api/news                 → 一覧 (limit / offset / orders / fields)
//  GET /api/news?id=<contentId>  → 詳細
//
//  microCMS の API キーはこのワーカー内でのみ使用し、ブラウザには渡さない。
//
//  必要な環境変数 (Cloudflare Pages → Settings → Environment variables):
//    MICROCMS_API_KEY        … microCMS の APIキー (GET専用/下書き参照OFF推奨)
//  任意:
//    MICROCMS_SERVICE_DOMAIN … 既定 'happoh'
//    MICROCMS_ENDPOINT       … 既定 'news'
// =====================================================================

const ALLOWED_PARAMS = ['limit', 'offset', 'orders', 'fields', 'q', 'ids'];
const MAX_LIMIT = 100;
const MAX_VALUE_LEN = 200;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      ...extra,
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const key = env.MICROCMS_API_KEY;
  if (!key) return json({ ok: false, error: 'not_configured' }, 500);

  const service = env.MICROCMS_SERVICE_DOMAIN || 'happoh';
  const endpoint = env.MICROCMS_ENDPOINT || 'news';

  const src = new URL(request.url);
  const id = src.searchParams.get('id');

  // エンドポイントは固定。id はホワイトリスト文字のみ許可 (SSRF/パス操作の防止)
  let target = `https://${service}.microcms.io/api/v1/${endpoint}`;
  if (id !== null) {
    if (!ID_RE.test(id)) return json({ ok: false, error: 'invalid_id' }, 400);
    target += '/' + id;
  }

  const qs = new URLSearchParams();
  for (const k of ALLOWED_PARAMS) {
    const v = src.searchParams.get(k);
    if (v === null || v.length > MAX_VALUE_LEN) continue;
    if (k === 'limit') {
      const n = parseInt(v, 10);
      qs.set('limit', String(Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LIMIT) : 10));
    } else if (k === 'offset') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) qs.set('offset', String(n));
    } else {
      qs.set(k, v);
    }
  }
  const q = qs.toString();
  if (q) target += '?' + q;

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(target, {
      headers: { 'X-MICROCMS-API-KEY': key },
      signal: ctl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      // 上流のエラー内容(キー等)は返さない
      return json({ ok: false, error: 'upstream_' + res.status }, res.status === 404 ? 404 : 502);
    }
    const data = await res.json();
    return json(data, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (err) {
    return json({ ok: false, error: 'upstream_unreachable' }, 502);
  }
}

// GET 以外は 405
export async function onRequest(context) {
  if (context.request.method === 'GET') {
    return onRequestGet(context);
  }
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
