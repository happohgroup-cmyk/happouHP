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
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'no-store',
    },
  });
}

function hostOf(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

// スプレッドシートの数式(CSV)インジェクション対策。
// 先頭が = + - @ タブ CR の値は、'（アポストロフィ）を前置して「文字列」として保存させる。
// Google Sheets は先頭の ' を表示しないため、元データは失われない。
function sanitizeCell(value) {
  const s = String(value == null ? '' : value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// Cloudflare Turnstile 検証（サーバー側）。
// トークンを Siteverify へ送り、成功 + hostname 一致のときだけ true。
// テストキー使用時は hostname が空/一致するので許可。失敗時は fail-closed。
async function verifyTurnstile(token, secret, remoteip, requestHost) {
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!token || typeof token !== 'string' || token.length > 4096) {
    return { ok: false, reason: 'missing_token' };
  }
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteip) form.set('remoteip', remoteip);

  let res;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: ctl.signal,
    });
    clearTimeout(timer);
  } catch {
    return { ok: false, reason: 'verify_unreachable' };
  }

  let out;
  try {
    out = await res.json();
  } catch {
    return { ok: false, reason: 'verify_badjson' };
  }
  if (!out.success) return { ok: false, reason: 'failed' };

  // hostname 検証: 本番 happoh.com / www / Preview(*.pages.dev) / 同一ホスト / テストキー(空)
  const hn = out.hostname;
  const hostOk =
    !hn ||
    hn === requestHost ||
    hn === 'happoh.com' ||
    hn === 'www.happoh.com' ||
    hn.endsWith('.pages.dev');
  if (!hostOk) return { ok: false, reason: 'hostname' };

  return { ok: true };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- 同一オリジンチェック (CSRF/スパム対策) ---
  // ブラウザの fetch() は同一オリジンの POST でも Origin を送る。
  // Origin が無い場合のみ Referer で代替判定し、どちらも無い/不一致なら拒否。
  // (以前は Origin 欠落時に素通りしていたため、curl 等から直接投稿できた)
  const host = new URL(request.url).host;
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const claimed = origin ? hostOf(origin) : referer ? hostOf(referer) : null;
  if (claimed !== host) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // --- Content-Type チェック ---
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return json({ ok: false, error: 'unsupported_media_type' }, 415);
  }

  // --- リクエストボディのサイズ制限 (25KB) ---
  const clen = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (Number.isFinite(clen) && clen > 25000) {
    return json({ ok: false, error: 'payload_too_large' }, 413);
  }

  // --- JSON パース ---
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  // --- ハニーポット (bot が埋める隠しフィールド) ---
  if (data.website) {
    // bot 判定: 成功したふりをして破棄
    return json({ ok: true });
  }

  // --- Turnstile 検証 (bot / スパム対策) ---
  // 本番は環境変数 TURNSTILE_SECRET_KEY に実シークレットを設定する。
  // 未設定時は Cloudflare 公式テストキー(常に成功)へフォールバックするため、
  // 本番では必ず実キーを設定すること（未設定だと検証が実質無効になる）。
  const turnstileSecret = env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';
  const tv = await verifyTurnstile(
    data.token,
    turnstileSecret,
    request.headers.get('CF-Connecting-IP'),
    host
  );
  if (!tv.ok) {
    return json({ ok: false, error: 'verification_failed' }, 403);
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

  // スプレッドシートへ渡す値は数式インジェクション対策で無害化してから送る。
  const payload = {
    kind: sanitizeCell(String(data.kind).trim()),
    name: sanitizeCell(String(data.name).trim()),
    company: sanitizeCell(String(data.company || '').trim()),
    email: sanitizeCell(String(data.email).trim()),
    tel: sanitizeCell(String(data.tel || '').trim()),
    store: sanitizeCell(String(data.store || '').trim()),
    message: sanitizeCell(String(data.message).trim()),
    ua: sanitizeCell(request.headers.get('User-Agent') || ''),
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
