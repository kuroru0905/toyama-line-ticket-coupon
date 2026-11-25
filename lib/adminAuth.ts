import { requireLineUser, type LineUser } from './lineAuth';
import { ForbiddenError, ValidationError } from './apiError';

// 環境変数 ADMIN_LINE_USER_IDS（カンマ区切りのLINEユーザーID）に含まれる人だけ管理者
export function isAdminUserId(userId: string): boolean {
  const list = (process.env.ADMIN_LINE_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(userId);
}

export async function requireAdmin(req: Request): Promise<LineUser> {
  const user = await requireLineUser(req);
  if (!isAdminUserId(user.userId)) {
    throw new ForbiddenError('管理者として登録されていないLINEアカウントです');
  }
  return user;
}

// ---- 入力チェック ----

type Json = Record<string, unknown>;

function str(body: Json, key: string, label: string, required: boolean): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ValidationError(`${label}を入力してください`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ValidationError(`${label}の形式が不正です`);
  const s = v.trim();
  if (required && !s) throw new ValidationError(`${label}を入力してください`);
  return s;
}

function bool(body: Json, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new ValidationError(`${key} の形式が不正です`);
  return v;
}

// partial=true のときは送られてきた項目だけチェック（編集用）
export function parseEventInput(body: Json, partial: boolean) {
  const out: Record<string, unknown> = {};

  const title = str(body, 'title', '公演名', !partial);
  if (title !== undefined) out.title = title;

  const venue = str(body, 'venue', '会場', !partial);
  if (venue !== undefined) out.venue = venue;

  const description = str(body, 'description', '説明', false);
  if (description !== undefined || body.description === '') out.description = description ?? '';

  const startsAt = str(body, 'starts_at', '開演日時', !partial);
  if (startsAt !== undefined) {
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) throw new ValidationError('開演日時の形式が不正です');
    out.starts_at = d.toISOString();
  }

  if (body.price_jpy !== undefined || !partial) {
    const price = Number(body.price_jpy);
    if (!Number.isInteger(price) || price < 50) {
      throw new ValidationError('価格は50円以上の整数で入力してください（Stripeの最低金額）');
    }
    out.price_jpy = price;
  }

  if (body.capacity !== undefined) {
    if (body.capacity === null || body.capacity === '') {
      out.capacity = null;
    } else {
      const cap = Number(body.capacity);
      if (!Number.isInteger(cap) || cap <= 0) {
        throw new ValidationError('定員は1以上の整数で入力してください（無制限なら空欄）');
      }
      out.capacity = cap;
    }
  }

  const published = bool(body, 'is_published');
  if (published !== undefined) out.is_published = published;

  return out;
}

export function parseCouponInput(body: Json, partial: boolean) {
  const out: Record<string, unknown> = {};

  const shop = str(body, 'shop_name', '店舗名', !partial);
  if (shop !== undefined) out.shop_name = shop;

  const title = str(body, 'benefit_title', '特典タイトル', !partial);
  if (title !== undefined) out.benefit_title = title;

  const detail = str(body, 'benefit_detail', '特典の詳細', !partial);
  if (detail !== undefined) out.benefit_detail = detail;

  const published = bool(body, 'is_published');
  if (published !== undefined) out.is_published = published;

  return out;
}
