// LIFF の IDトークンをサーバー側で検証し、LINEユーザーIDを確定させる。
// クライアントから送られた userId をそのまま信用しないための仕組み。
// https://developers.line.biz/ja/reference/line-login/#verify-id-token

export type LineUser = {
  userId: string;
  displayName: string | null;
};

export class AuthError extends Error {}

export async function verifyLineIdToken(idToken: string): Promise<LineUser> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    throw new Error('環境変数 LINE_LOGIN_CHANNEL_ID が未設定です');
  }

  const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new AuthError('LINEログインの有効期限が切れています。画面を開き直してください');
  }

  const json = (await res.json()) as { sub?: string; name?: string };
  if (!json.sub) {
    throw new AuthError('LINEユーザーを確認できませんでした');
  }
  return { userId: json.sub, displayName: json.name ?? null };
}

// Authorization: Bearer <IDトークン> からユーザーを取り出す。無ければ null。
export async function getLineUserFromRequest(req: Request): Promise<LineUser | null> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifyLineIdToken(match[1]);
}

// ログイン必須のAPI用
export async function requireLineUser(req: Request): Promise<LineUser> {
  const user = await getLineUserFromRequest(req);
  if (!user) {
    throw new AuthError('LINEログインが必要です');
  }
  return user;
}
