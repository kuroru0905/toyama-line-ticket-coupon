import nodemailer from 'nodemailer';

// Gmail（アプリパスワード）でメールを送る。
// 環境変数 GMAIL_USER / GMAIL_APP_PASSWORD が未設定なら送らずに false を返す。
// 送信に失敗しても例外は投げない（審査の更新そのものは成功させるため）。
export async function sendMail(params: { to: string; subject: string; text: string }): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.warn('[mailer] GMAIL_USER / GMAIL_APP_PASSWORD が未設定のため送信をスキップしました');
    return false;
  }
  if (!params.to) {
    console.warn('[mailer] 宛先が空のため送信をスキップしました');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"外山企画 スポンサー事務局" <${user}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return true;
  } catch (err) {
    console.error('[mailer] 送信に失敗しました:', err);
    return false;
  }
}

export const SPONSOR_MYPAGE_URL =
  process.env.SPONSOR_MYPAGE_URL || 'https://toyama-sponsor-hub.vercel.app/mypage';
