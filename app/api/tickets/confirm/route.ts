import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../lib/lineAuth';
import { retrieveCheckoutSession } from '../../../../lib/stripe';
import { markOrderPaidFromSession } from '../../../../lib/tickets';
import { errorResponse } from '../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// 決済完了画面から戻ってきたときに呼ぶ。Stripeに支払い状況を問い合わせて確定する。
// （Webhookが未設定・遅延していても購入が確定するように）
export async function POST(req: Request) {
  try {
    const user = await requireLineUser(req);
    const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: 'セッションIDがありません' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const session = await retrieveCheckoutSession(body.sessionId);
    const orderId = session.metadata?.order_id;
    if (!orderId) {
      return NextResponse.json({ error: '注文情報がありません' }, { status: 400 });
    }

    // 本人の注文か確認
    const { data: order } = await supabase
      .from('ticket_orders')
      .select('id, line_user_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!order || order.line_user_id !== user.userId) {
      return NextResponse.json({ error: 'この注文は確認できません' }, { status: 403 });
    }

    const result = await markOrderPaidFromSession(supabase, session);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    return errorResponse(err);
  }
}
