import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../lib/lineAuth';
import { createCheckoutSession } from '../../../../lib/stripe';
import { errorResponse } from '../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// チケット購入：注文(pending)を作り、Stripe Checkout の決済ページURLを返す
export async function POST(req: Request) {
  try {
    const user = await requireLineUser(req);
    const body = (await req.json().catch(() => ({}))) as { eventId?: string };
    if (!body.eventId) {
      return NextResponse.json({ error: '公演IDが指定されていません' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: event, error: eventError } = await supabase
      .from('live_events')
      .select('id, title, price_jpy, capacity')
      .eq('id', body.eventId)
      .eq('is_published', true)
      .maybeSingle();
    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }
    if (!event) {
      return NextResponse.json({ error: 'この公演は販売していません' }, { status: 404 });
    }

    // すでに購入済みか
    const { data: owned } = await supabase
      .from('ticket_orders')
      .select('id')
      .eq('event_id', event.id)
      .eq('line_user_id', user.userId)
      .in('status', ['paid', 'used'])
      .limit(1);
    if (owned && owned.length > 0) {
      return NextResponse.json({ error: 'この公演のチケットはすでにお持ちです' }, { status: 409 });
    }

    // 残席チェック（支払済み・使用済みの枚数で判定）
    if (event.capacity) {
      const { count, error: countError } = await supabase
        .from('ticket_orders')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .in('status', ['paid', 'used']);
      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }
      if ((count ?? 0) >= event.capacity) {
        return NextResponse.json({ error: '完売しました' }, { status: 409 });
      }
    }

    const { data: order, error: orderError } = await supabase
      .from('ticket_orders')
      .insert({
        event_id: event.id,
        line_user_id: user.userId,
        display_name: user.displayName,
        status: 'pending',
        amount_jpy: event.price_jpy,
      })
      .select('id')
      .single();
    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const session = await createCheckoutSession({
      orderId: order.id,
      eventTitle: event.title,
      amountJpy: event.price_jpy,
      successUrl: `${origin}/?tab=tickets&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/?tab=tickets&canceled=1`,
    });

    await supabase
      .from('ticket_orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
