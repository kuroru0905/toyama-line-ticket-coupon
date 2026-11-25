// 公演の販売期間・入場受付期間のルール
//
// 販売：
//   before  … まだ販売前（先行販売開始前／一般販売開始前）
//   presale … スポンサー先行販売中（LINE連携した有効なスポンサーのみ購入可）
//   general … 一般販売中
//   ended   … 開演時刻を過ぎたので販売終了
//   ※ presale_start も general_sale_start も未設定なら、公開と同時に一般販売
//
// 入場：開演3時間前 〜 開演日の23:59（日本時間）

export type SaleState = 'before' | 'presale' | 'general' | 'ended';

export type SaleWindowEvent = {
  starts_at: string;
  presale_start?: string | null;
  general_sale_start?: string | null;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const ENTRY_OPENS_BEFORE_MS = 3 * 60 * 60 * 1000;

export function getSaleState(event: SaleWindowEvent, now: Date = new Date()): SaleState {
  const t = now.getTime();
  const startsAt = new Date(event.starts_at).getTime();
  if (t >= startsAt) return 'ended';

  const presale = event.presale_start ? new Date(event.presale_start).getTime() : null;
  const general = event.general_sale_start ? new Date(event.general_sale_start).getTime() : null;

  if (general !== null && t >= general) return 'general';
  if (presale !== null && t >= presale) return 'presale';
  if (presale === null && general === null) return 'general';
  return 'before';
}

// 販売開始（次に購入できるようになる時刻）
export function nextSaleOpensAt(event: SaleWindowEvent): string | null {
  return event.presale_start || event.general_sale_start || null;
}

// 開演日の23:59:59.999（日本時間）
function endOfStartDayJst(startsAt: Date): Date {
  const jst = new Date(startsAt.getTime() + JST_OFFSET_MS);
  const endJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 23, 59, 59, 999);
  return new Date(endJst - JST_OFFSET_MS);
}

export function getEntryWindow(startsAtIso: string): { opensAt: string; closesAt: string } {
  const startsAt = new Date(startsAtIso);
  return {
    opensAt: new Date(startsAt.getTime() - ENTRY_OPENS_BEFORE_MS).toISOString(),
    closesAt: endOfStartDayJst(startsAt).toISOString(),
  };
}

export type EntryState = 'not_yet' | 'open' | 'closed';

export function getEntryState(startsAtIso: string, now: Date = new Date()): EntryState {
  const { opensAt, closesAt } = getEntryWindow(startsAtIso);
  const t = now.getTime();
  if (t < new Date(opensAt).getTime()) return 'not_yet';
  if (t > new Date(closesAt).getTime()) return 'closed';
  return 'open';
}

export function formatJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
