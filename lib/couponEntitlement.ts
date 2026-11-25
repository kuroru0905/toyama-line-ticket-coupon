import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// クーポン利用ルール（はしご酒できるように）
//  1. チケットで「入場済み」になった人だけが使える
//  2. 入場1回につき、掲載中のお店のクーポンを「各店1回ずつ」使える
//     （何軒でも回れる。同じお店のクーポンは今回の入場では1回だけ）
//  3. 期限は「ライブ当日の翌日 23:59（日本時間）」まで
//  4. 別のイベントで入場すると、また全部のお店で1回ずつ使える
//  5. 前のライブの権利は持ち越さない（いちばん新しい入場の権利だけが有効）
// ============================================================

export type EntitlementState =
  | 'none' //        チケットを持っていない
  | 'not_entered' // チケットはあるが、まだ入場していない
  | 'available' //   使える（各店1回ずつ）
  | 'expired'; //    期限切れ

export type Entitlement = {
  state: EntitlementState;
  ticketOrderId: string | null; // 権利の元になっている入場（チケット）
  eventTitle: string | null;
  enteredAt: string | null;
  deadline: string | null; // ISO
  used: Record<string, string>; // 今回の入場で使ったクーポン → 使った時刻
};

const JST_MS = 9 * 60 * 60 * 1000;

// ライブ当日の翌日 23:59:59.999（日本時間）
export function couponDeadline(eventStartsAtIso: string): Date {
  const jst = new Date(new Date(eventStartsAtIso).getTime() + JST_MS);
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
    used: {},
  };

  // いちばん新しい入場
  const { data: entered, error } = await supabase
    .from('ticket_orders')
    .select('id, used_at, live_events(title, starts_at)')
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

  const ev = (Array.isArray(entered.live_events) ? entered.live_events[0] : entered.live_events) as
    | { title?: string; starts_at?: string }
    | null;
  // 期限はライブ当日の翌日いっぱい（開演日が取れなければ入場日で数える）
  const deadline = couponDeadline(ev?.starts_at ?? (entered.used_at as string));

  // この入場で使ったクーポン
  const { data: uses, error: useError } = await supabase
    .from('coupon_uses')
    .select('coupon_id, used_at')
    .eq('ticket_order_id', entered.id);
  if (useError) throw new Error(useError.message);
  const used: Record<string, string> = {};
  for (const u of uses ?? []) used[u.coupon_id as string] = u.used_at as string;

  const base: Entitlement = {
    ...empty,
    ticketOrderId: entered.id,
    eventTitle: ev?.title ?? null,
    enteredAt: entered.used_at as string,
    deadline: deadline.toISOString(),
    used,
  };

  if (Date.now() > deadline.getTime()) return { ...base, state: 'expired' };
  return { ...base, state: 'available' };
}

// 使えないときにユーザーへ見せる理由
export function entitlementMessage(e: Entitlement): string {
  switch (e.state) {
    case 'none':
      return 'クーポンはライブチケットをお持ちの方が、入場後に使えます';
    case 'not_entered':
      return 'ライブに入場すると、お店のクーポンが使えるようになります';
    case 'expired':
      return 'クーポンの利用期限（ライブの翌日23:59）が過ぎました。次のライブに入場すると、また使えます';
    default:
      return '';
  }
}
