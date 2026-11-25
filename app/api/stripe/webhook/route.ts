import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { verifyWebhookSignature, type CheckoutSession } from '../../../../lib/stripe';
import { markOrderPaidFromSession } from '../../../../lib/tickets';

export const dynamic = 'force-dynamic';

// Stripe Webhook（checkout.session.completed）で注文を確定する。
// ユーザーが決済後に画面を閉じても購入が確定するための保険。
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET が未設定です' }, { status: 500 });
  }

  const payload = await req.text();
  if (!verifyWebhookSignature(payload, req.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: '署名が不正です' }, { status: 400 });
  }

  const event = JSON.parse(payload) as {
    type: string;
    data: { object: CheckoutSession };
  };

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    try {
      const supabase = getSupabaseAdmin();
      await markOrderPaidFromSession(supabase, event.data.object);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
