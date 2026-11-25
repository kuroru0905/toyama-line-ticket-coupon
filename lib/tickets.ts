import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckoutSession } from './stripe';

// Stripe のセッションが支払済みなら、対応する注文を paid に確定する。
// confirm API と webhook の両方から呼ばれる（どちらが先でも結果は同じ＝冪等）。
export async function markOrderPaidFromSession(
  supabase: SupabaseClient,
  session: CheckoutSession
): Promise<{ ok: boolean; orderId: string | null; reason?: string }> {
  const orderId = session.metadata?.order_id ?? null;
  if (!orderId) return { ok: false, orderId, reason: '注文IDがありません' };
  if (session.payment_status !== 'paid') {
    return { ok: false, orderId, reason: '支払いが完了していません' };
  }

  const { data, error } = await supabase
    .from('ticket_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('stripe_session_id', session.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    // 23505 = 一意制約違反（同じ公演を既に支払済み）
    if (error.code === '23505') {
      return { ok: false, orderId, reason: 'この公演のチケットはすでにお持ちです' };
    }
    throw new Error(error.message);
  }

  if (data) return { ok: true, orderId };

  // すでに paid / used に更新済みなら成功扱い
  const { data: existing } = await supabase
    .from('ticket_orders')
    .select('status')
    .eq('id', orderId)
    .maybeSingle();
  if (existing && (existing.status === 'paid' || existing.status === 'used')) {
    return { ok: true, orderId };
  }
  return { ok: false, orderId, reason: '注文が見つかりません' };
}
