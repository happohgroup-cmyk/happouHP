// =====================================================================
//  お問い合わせ受信 — Google Apps Script Web アプリ
//  ---------------------------------------------------------------
//  Cloudflare Pages Functions (/api/contact) から JSON を受け取り、
//  このスクリプトが紐づくスプレッドシートに 1 行追記します。
//  さらに、
//    (1) 会社の受信アドレス(NOTIFY_EMAIL)へ通知メール
//    (2) お問い合わせ者(data.email)へ受付確認の自動返信メール
//  を送信します。
//
//  【設置手順】
//  1. Google スプレッドシートを新規作成 (名前例: 八宝HP お問い合わせ)
//  2. メニュー「拡張機能」→「Apps Script」を開く
//  3. 既存コードを全て消して、このファイルの内容を貼り付け → 保存
//  4. 右上「デプロイ」→「新しいデプロイ」
//     - 種類: ウェブアプリ
//     - 次のユーザーとして実行: 自分
//     - アクセスできるユーザー: 全員
//     →「デプロイ」→ 表示された URL (https://script.google.com/macros/s/…/exec) をコピー
//  5. その URL を Cloudflare Pages の環境変数 GAS_URL に設定
//  ※ コードを更新したら「デプロイを管理」→ 対象デプロイの鉛筆 →
//     バージョン「新バージョン」→ デプロイ で /exec URL を据え置き更新。
//
//  ★ NOTIFY_EMAIL には会社の受信アドレスを設定してください。
//     このリポジトリは公開のため、実アドレスはここに書かず、
//     デプロイ済みの Apps Script エディタ側にのみ設定します。
// =====================================================================

var SHEET_NAME   = 'お問い合わせ';
var NOTIFY_EMAIL = ''; // ← 公開repoでは空。デプロイ済みスクリプトに会社アドレスを設定済み。
var COMPANY_NAME = '株式会社八宝';
var COMPANY_ADDR = '〒630-8215 奈良県奈良市東向中町11 丸八ビル 2階';
var COMPANY_TEL  = '0742-24-1755';

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
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('yyyy/mm/dd  HH:mm'); // 新規行の受信日時を秒なし表示に統一

    // メール送信は失敗しても受信記録は成功として扱う
    try {
      sendMails_(data);
    } catch (mailErr) {
      // 記録は済んでいるため、メール失敗はログのみ
      console.error('mail error: ' + mailErr);
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

// 会社への通知 + お客様への自動返信
function sendMails_(data) {
  // (1) 会社への通知メール
  if (NOTIFY_EMAIL) {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      name: COMPANY_NAME + ' HP',
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

  // (2) お問い合わせ者への受付確認（自動返信）メール
  var to = (data.email || '').trim();
  if (to && to.indexOf('@') > 0) {
    MailApp.sendEmail({
      to: to,
      name: COMPANY_NAME,
      subject: '【' + COMPANY_NAME + '】お問い合わせありがとうございます',
      body: buildAckBody_(data),
    });
  }
}

// 自動返信メールの本文
function buildAckBody_(data) {
  var L = '━━━━━━━━━━━━━━━━━━━━';
  var body =
    'このたびは' + COMPANY_NAME + 'へお問い合わせいただき、誠にありがとうございます。\n' +
    '以下の内容でお問い合わせを受け付けいたしました。\n' +
    '担当者が内容を確認のうえ、改めてご連絡いたしますので、今しばらくお待ちください。\n\n' +
    L + '\n' +
    '　お問い合わせ内容\n' +
    L + '\n' +
    '■ 種別　　: ' + (data.kind || '') + '\n' +
    '■ お名前　: ' + (data.name || '') + '\n' +
    (data.company ? '■ 会社名　: ' + data.company + '\n' : '') +
    '■ メール　: ' + (data.email || '') + '\n' +
    (data.tel ? '■ 電話番号: ' + data.tel + '\n' : '') +
    (data.store ? '■ 対象店舗: ' + data.store + '\n' : '') +
    '■ 内容　　:\n' + (data.message || '') + '\n' +
    L + '\n\n' +
    '※ 本メールは送信専用アドレスから自動送信されています。\n' +
    '　ご返信いただいてもお答えできない場合がございます。\n' +
    '※ 数日たっても当社からご連絡がない場合は、お手数ですが下記までお電話ください。\n\n' +
    '──────────────────\n' +
    COMPANY_NAME + '\n' +
    COMPANY_ADDR + '\n' +
    'TEL: ' + COMPANY_TEL + '\n' +
    '──────────────────';
  return body;
}


// ===== 受信シートの見た目を整える一回実行用フォーマッタ =====
// ※ doPost / メール送信 / 列構成 / シート名 には一切触れません。見た目だけ。
//    エディタで formatSheet を選び「実行」すると、受信シートを整形します。
function formatSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME); // 'お問い合わせ'（変更しない）
  if (!sh) return;

  var LAST_COL = 10;               // A..J（列の順序・数は不変）
  var maxRows = sh.getMaxRows();
  var maxCols = sh.getMaxColumns();

  sh.getRange(1, 1, maxRows, LAST_COL).setFontSize(11);

  var header = sh.getRange(1, 1, 1, LAST_COL);
  header.setBackground('#2f6b3f')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
  sh.setRowHeight(1, 42);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);          // 受信日時を固定

  var widths = [160, 150, 130, 170, 210, 120, 180, 400, 170, 130];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);

  if (maxRows > 1) {
    var data = sh.getRange(2, 1, maxRows - 1, LAST_COL);
    data.setWrap(true).setVerticalAlignment('top');
    sh.getRange(2, 1, maxRows - 1, 1).setNumberFormat('yyyy/mm/dd  HH:mm');

    var bandings = sh.getBandings();
    for (var i = 0; i < bandings.length; i++) bandings[i].remove();
    sh.getRange(2, 1, maxRows - 1, LAST_COL)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }

  if (maxCols > LAST_COL) sh.hideColumns(LAST_COL + 1, maxCols - LAST_COL);
  SpreadsheetApp.flush();
}
