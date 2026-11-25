import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// クーポン利用ルール
//  1. チケットで「入場済み」になった人だけが使える
//  2. 入場1回につき、好きなお店のクーポンを1枚だけ使える
//     （1枚使うと、他のお店のクーポンも次のイベントまで使えない）
//  3. 別のイベントで入場すると、また1枚使えるようになる（同じお店でもOK）
//  4. 期限は「入場した日の翌日 23:59（日本時間）」まで
//  5. 使わなかった権利は持ち越さない（いちばん新しい入場の権利だけが有効）
// ============================================================

export type EntitlementState =
  | 'none' //        チケットを持っていない
  | 'not_entered' // チケットはあるが、まだ入場していない
  | 'available' //   1枚使える
  | 'used' //        今回の入場の権利はもう使った
  | 'expired'; //    期限切れ

export type Entitlement = {
  state: EntitlementState;
  ticketOrderId: string | null; // 権利の元になっている入場（チケット）
  eventTitle: string | null;
  enteredAt: string | null;
  deadline: string | null; // ISO
  usedCouponId: string | null; // 今回の権利で使ったクーポン
  usedAt: string | null;
};

const JST_MS = 9 * 60 * 60 * 1000;

// 入場した日の翌日 23:59:59.999（日本時間）
export function couponDeadline(enteredAtIso: string): Date {
  const jst = new Date(new Date(enteredAtIso).getTime() + JST_MS);
  const nextNextMidnightJstAsUtc = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 2);
  return new Date(nextNextMidnightJstAsUtc - JST_MS - 1);
}

export async function getCouponEntitlement(supabase: SupabaseClient, lineUserId: string): Promise<Entitlement> {
  const empty: Entitlement = {
    state: 'none',
    ticketOrderId: null,
    eventTitle: null,
    enteredAt: null,
    deadline: null,
    usedCouponId: null,
    usedAt: null,
  };

  // いちばん新しい入場
  const { data: entered, error } = await supabase
    .from('ticket_orders')
    .select('id, used_at, live_events(title)')
    .eq('line_user_id', lineUserId)
    .eq('status', 'used')
    .not('used_at', 'is', null)
    .order('used_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!entered) {
    // 入場はまだ。購入済みのチケットがあるか
    const { count, error: countError } = await supabase
      .from('ticket_orders')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', lineUserId)
      .eq('status', 'paid');
    if (countError) throw new Error(countError.message);
    return { ...empty, state: (count ?? 0) > 0 ? 'not_entered' : 'none' };
  }

  const ev = Array.isArray(entered.live_events) ? entered.live_events[0] : entered.live_events;
  const deadline = couponDeadline(entered.used_at as string);
  const base: Entitlement = {
    ...empty,
    ticketOrderId: entered.id,
    eventTitle: (ev as { title?: string } | null)?.title ?? null,
    enteredAt: entered.used_at as string,
    deadline: deadline.toISOString(),
  };

  // この入場の権利をもう使ったか
  const { data: use, error: useError } = await supabase
    .from('coupon_uses')
    .select('coupon_id, used_at')
    .eq('ticket_order_id', entered.id)
    .maybeSingle();
  if (useError) throw new Error(useError.message);

  if (use) return { ...base, state: 'used', usedCouponId: use.coupon_id, usedAt: use.used_at };
  if (Date.now() > deadline.getTime()) return { ...base, state: 'expired' };
  return { ...base, state: 'available' };
}

// 使えないときにユーザーへ見せる理由
export function entitlementMessage(e: Entitlement): string {
  switch (e.state) {
    case 'none':
      return 'クーポンはライブチケットをお持ちの方が、入場後に使えます';
    case 'not_entered':
      return 'ライブに入場すると、クーポンを1枚使えます';
    case 'used':
      return '今回の入場分のクーポンは使用済みです。次のイベントに入場すると、また1枚使えます';
    case 'expired':
      return 'クーポンの利用期限が過ぎました。次のイベントに入場すると、また1枚使えます';
    default:
      return '';
  }
}
