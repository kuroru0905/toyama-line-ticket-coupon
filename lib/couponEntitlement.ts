import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// クーポン利用ルール
//  1. チケットで「入場済み」になった人だけが使える
//  2. 入場1回につき、そのライブに協賛したお店のクーポンを「各店1回ずつ」使える（はしごOK）
//  3. 期限は「ライブの3か月後の同じ日 23:59（日本時間）」まで＝協賛の「開催後3か月のフォロー」と同じ期間
//     （3か月後に同じ日がない月は月末。例：11/30 → 2/28）
//  4. 前のライブの権利も、期限までは使える（新しいライブに入場しても消えない）
//  5. 使えるのは、そのライブに協賛（支払い済み）した企業・お店のクーポン。
//     外山企画が直接載せたクーポンと、イベントごとの協賛がまだない月額契約のスポンサーは、どのライブの入場でも使える
//  6. 同じお店のクーポンを使える入場が複数あるときは、期限が先に来る入場の権利から使う
// ============================================================

export type EntitlementState =
  | 'none' //        チケットを持っていない
  | 'not_entered' // チケットはあるが、まだ入場していない
  | 'available' //   使える入場が1つ以上ある
  | 'expired'; //    入場はしたが、どれも期限切れ

// 入場1回分の権利
export type EntryRight = {
  ticketOrderId: string;
  eventId: string | null;
  eventTitle: string | null;
  enteredAt: string;
  deadline: string; // ISO
  used: Record<string, string>; // この入場で使ったクーポン → 使った時刻
};

export type Entitlement = {
  state: EntitlementState;
  rights: EntryRight[]; // 期限内の入場（期限が早い順）
  latestTitle: string | null; // いちばん新しい入場のライブ名
  lastDeadline: string | null; // 期限内の入場のうち、いちばん遅い期限
  allUsed: Record<string, string>; // 期限内・期限切れを問わず、使ったクーポン → 最後に使った時刻（表示用）
};

const JST_MS = 9 * 60 * 60 * 1000;
const FOLLOW_MONTHS = 3;

// ライブの3か月後の同じ日 23:59:59.999（日本時間）。その日がない月は月末（DBの machikippu_follow_end と同じ）
export function couponDeadline(eventStartsAtIso: string): Date {
  const jst = new Date(new Date(eventStartsAtIso).getTime() + JST_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + FOLLOW_MONTHS; // 0始まりの月
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(jst.getUTCDate(), lastDay);
  return new Date(Date.UTC(y, m, day + 1) - JST_MS - 1);
}

export async function getCouponEntitlement(supabase: SupabaseClient, lineUserId: string): Promise<Entitlement> {
  const empty: Entitlement = { state: 'none', rights: [], latestTitle: null, lastDeadline: null, allUsed: {} };

  // 入場済みのチケット（新しい順）
  const { data: entered, error } = await supabase
    .from('ticket_orders')
    .select('id, used_at, event_id, live_events(title, starts_at)')
    .eq('line_user_id', lineUserId)
    .eq('status', 'used')
    .not('used_at', 'is', null)
    .order('used_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  if (!entered || entered.length === 0) {
    // 入場はまだ。購入済みのチケットがあるか
    const { count, error: countError } = await supabase
      .from('ticket_orders')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', lineUserId)
      .eq('status', 'paid');
    if (countError) throw new Error(countError.message);
    return { ...empty, state: (count ?? 0) > 0 ? 'not_entered' : 'none' };
  }

  // 入場ごとに使ったクーポン
  const ids = entered.map((t) => t.id as string);
  const { data: uses, error: useError } = await supabase.from('coupon_uses').select('ticket_order_id, coupon_id, used_at').in('ticket_order_id', ids);
  if (useError) throw new Error(useError.message);
  const usedBy: Record<string, Record<string, string>> = {};
  const allUsed: Record<string, string> = {};
  for (const u of uses ?? []) {
    const t = u.ticket_order_id as string;
    const c = u.coupon_id as string;
    const at = u.used_at as string;
    (usedBy[t] ??= {})[c] = at;
    if (!allUsed[c] || allUsed[c] < at) allUsed[c] = at;
  }

  const now = Date.now();
  const rights: EntryRight[] = [];
  for (const t of entered) {
    const ev = (Array.isArray(t.live_events) ? t.live_events[0] : t.live_events) as { title?: string; starts_at?: string } | null;
    // 期限はライブの3か月後（開演日が取れなければ入場日で数える）
    const deadline = couponDeadline(ev?.starts_at ?? (t.used_at as string));
    if (deadline.getTime() < now) continue;
    rights.push({
      ticketOrderId: t.id as string,
      eventId: (t.event_id as string | null) ?? null,
      eventTitle: ev?.title ?? null,
      enteredAt: t.used_at as string,
      deadline: deadline.toISOString(),
      used: usedBy[t.id as string] ?? {},
    });
  }
  rights.sort((a, b) => a.deadline.localeCompare(b.deadline));

  const latest = entered[0];
  const latestEv = (Array.isArray(latest.live_events) ? latest.live_events[0] : latest.live_events) as { title?: string } | null;
  return {
    state: rights.length > 0 ? 'available' : 'expired',
    rights,
    latestTitle: latestEv?.title ?? null,
    lastDeadline: rights.length > 0 ? rights[rights.length - 1].deadline : null,
    allUsed,
  };
}

// そのライブで使えるクーポンのスポンサーか（ルール5）を返す関数。複数のライブをまとめて調べる
export async function couponSponsorRule(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<(sponsorId: string | null, eventId: string | null) => boolean> {
  const [{ data: active }, { data: withSponsorship }, { data: paid }] = await Promise.all([
    supabase.from('sponsors').select('id').eq('status', 'active'),
    supabase.from('event_sponsorships').select('sponsor_id'),
    eventIds.length > 0
      ? supabase.from('event_sponsorships').select('sponsor_id, event_id').in('event_id', eventIds).eq('status', 'paid')
      : Promise.resolve({ data: [] as { sponsor_id: string; event_id: string }[] }),
  ]);
  const activeSet = new Set((active ?? []).map((r) => r.id as string));
  const hasAny = new Set((withSponsorship ?? []).map((r) => r.sponsor_id as string));
  const pairs = new Set((paid ?? []).map((r) => `${r.event_id}:${r.sponsor_id}`));
  return (sponsorId, eventId) => {
    if (!sponsorId) return true; // 外山企画が直接載せたクーポン
    if (activeSet.has(sponsorId) && !hasAny.has(sponsorId)) return true; // イベントの協賛がない月額契約
    return eventId !== null && pairs.has(`${eventId}:${sponsorId}`);
  };
}

// クーポン1枚について、今使える入場（期限が先に来るものから）を選ぶ。なければ null
export function pickRight(
  e: Entitlement,
  coupon: { id: string; sponsor_id: string | null },
  allowed: (sponsorId: string | null, eventId: string | null) => boolean
): EntryRight | null {
  for (const r of e.rights) {
    if (!allowed(coupon.sponsor_id, r.eventId)) continue;
    if (r.used[coupon.id]) continue;
    return r;
  }
  return null;
}

// このクーポンを使える入場が（使用済みも含めて）期限内にあるか
export function hasRightFor(
  e: Entitlement,
  coupon: { id: string; sponsor_id: string | null },
  allowed: (sponsorId: string | null, eventId: string | null) => boolean
): boolean {
  return e.rights.some((r) => allowed(coupon.sponsor_id, r.eventId));
}

// 使えないときにユーザーへ見せる理由
export function entitlementMessage(e: Entitlement): string {
  switch (e.state) {
    case 'none':
      return 'クーポンはライブチケットをお持ちの方が、入場後に使えます';
    case 'not_entered':
      return 'ライブに入場すると、協賛店のクーポンが使えるようになります';
    case 'expired':
      return 'クーポンの利用期限（ライブの3か月後）が過ぎました。次のライブに入場すると、また使えます';
    default:
      return '';
  }
}
