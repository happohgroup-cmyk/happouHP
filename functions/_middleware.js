// =====================================================================
//  Pages Functions 共通ミドルウェア — 全 /api/* レスポンスに
//  セキュリティヘッダーを付与する。
//  ---------------------------------------------------------------
//  静的アセットは _headers が担当するが、Cloudflare Pages では
//  _headers が Functions 応答には適用されない。そのため Function 側で
//  明示的に付与する（各 Function が個別に設定済みのヘッダーは尊重）。
//
//  API は JSON を返す（HTML 実行文脈ではない）ため CSP は最も制限的に。
// =====================================================================

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), midi=(), serial=(), bluetooth=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
