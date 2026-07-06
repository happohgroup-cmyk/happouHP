// =====================================================================
//  お問い合わせ受信 — Google Apps Script Web アプリ
//  ---------------------------------------------------------------
//  Cloudflare Pages Functions (/api/contact) から JSON を受け取り、
//  このスクリプトが紐づくスプレッドシートに 1 行追記します。
//
//  【設置手順】
//  1. Google スプレッドシートを新規作成 (名前例: 八宝 お問い合わせ)
//  2. メニュー「拡張機能」→「Apps Script」を開く
//  3. 既存コードを全て消して、このファイルの内容を貼り付け → 保存
//  4. 右上「デプロイ」→「新しいデプロイ」
//     - 種類: ウェブアプリ
//     - 次のユーザーとして実行: 自分
//     - アクセスできるユーザー: 全員
//     →「デプロイ」→ 表示された URL (https://script.google.com/macros/s/…/exec) をコピー
//  5. その URL を Cloudflare Pages の環境変数 GAS_URL に設定
//
//  ※ NOTIFY_EMAIL にメールアドレスを入れると、受信のたびに通知メールが届きます。
//     不要なら空文字 '' のままにしてください。
// =====================================================================

var SHEET_NAME = 'お問い合わせ';
// 受信のたびに通知したいメールアドレスを設定 (空なら通知なし)。
// ※ このリポジトリは公開のため、実アドレスはここに書かず、
//    デプロイ済みの Apps Script エディタ側にのみ設定してください (本番は会社アドレスを設定済み)。
var NOTIFY_EMAIL = '';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        '受信日時', 'お問い合わせ種別', 'お名前', '会社名・団体名',
        'メールアドレス', '電話番号', '対象店舗', 'お問い合わせ内容',
        'UserAgent', 'IP',
      ]);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      data.kind || '',
      data.name || '',
      data.company || '',
      data.email || '',
      data.tel || '',
      data.store || '',
      data.message || '',
      data.ua || '',
      data.ip || '',
    ]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: '【八宝HP】お問い合わせ: ' + (data.kind || '種別未設定') + ' — ' + (data.name || ''),
        body:
          'ホームページからお問い合わせが届きました。\n\n' +
          '■ 種別: ' + (data.kind || '') + '\n' +
          '■ お名前: ' + (data.name || '') + '\n' +
          '■ 会社名: ' + (data.company || '') + '\n' +
          '■ メール: ' + (data.email || '') + '\n' +
          '■ 電話: ' + (data.tel || '') + '\n' +
          '■ 対象店舗: ' + (data.store || '') + '\n\n' +
          '■ 内容:\n' + (data.message || '') + '\n\n' +
          '---\nスプレッドシートにも保存済みです。',
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
