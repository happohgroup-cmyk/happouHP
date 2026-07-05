// =====================================================================
//  お問い合わせ受付 API — Cloudflare Pages Functions
//  ---------------------------------------------------------------
//  POST /api/contact
//    フォーム(会社概要.html) → ここで検証 → GAS Web アプリへ転送
//    → Google スプレッドシートに保存
//
//  必要な環境変数 (Cloudflare Pages ダッシュボード → Settings →
//  Environment variables で設定):
//    GAS_URL … Google Apps Script Web アプリの URL
//              (https://script.google.com/macros/s/XXXX/exec)
// =====================================================================

const MAX_LEN = {
  kind: 50,
  name: 100,
  company: 150,
  email: 254,
  tel: 30,
  store: 60,
  message: 5000,
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- 同一オリジンチェック (簡易 CSRF/スパム対策) ---
  const origin = request.headers.get('Origin') || '';
  const host = new URL(request.url).host;
  if (origin && new URL(origin).host !== host) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // --- JSON パース ---
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  // --- ハニーポット (bot が埋める隠しフィールド) ---
  if (data.website) {
    // bot 判定: 成功したふりをして破棄
    return json({ ok: true });
  }

  // --- バリデーション ---
  const required = ['kind', 'name', 'email', 'message'];
  for (const key of required) {
    if (!data[key] || typeof data[key] !== 'string' || !data[key].trim()) {
      return json({ ok: false, error: 'missing_' + key }, 400);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }
  for (const [key, max] of Object.entries(MAX_LEN)) {
    if (data[key] && String(data[key]).length > max) {
      return json({ ok: false, error: 'too_long_' + key }, 400);
    }
  }

  // --- GAS へ転送 ---
  if (!env.GAS_URL) {
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  const payload = {
    kind: String(data.kind).trim(),
    name: String(data.name).trim(),
    company: String(data.company || '').trim(),
    email: String(data.email).trim(),
    tel: String(data.tel || '').trim(),
    store: String(data.store || '').trim(),
    message: String(data.message).trim(),
    ua: request.headers.get('User-Agent') || '',
    ip: request.headers.get('CF-Connecting-IP') || '',
    receivedAt: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow', // GAS は 302 → 結果ページの構成で返る
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return json({ ok: false, error: 'upstream_' + res.status }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: 'upstream_unreachable' }, 502);
  }
}

// POST 以外は 405
export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
