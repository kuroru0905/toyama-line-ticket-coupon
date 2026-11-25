import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../../lib/lineAuth';
import { errorResponse } from '../../../../../lib/apiError';
import { getEntryState, getEntryWindow, formatJst } from '../../../../../lib/eventWindows';

export const dynamic = 'force-dynamic';

// 入場時にチケットを使用済みにする（本人の支払済みチケットのみ／開演3時間前〜開演日の23:59）
export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const orderId = context.params.id;
    if (!orderId) {
      return NextResponse.json({ error: 'チケットIDが指定されていません' }, { status: 400 });
    }

    const user = await requireLineUser(req);
    const supabase = getSupabaseAdmin();

    const { data: order, error: orderError } = await supabase
      .from('ticket_orders')
      .select('id, status, live_events(starts_at)')
      .eq('id', orderId)
      .eq('line_user_id', user.userId)
      .maybeSingle();
    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    const ev = order?.live_events as { starts_at: string } | { starts_at: string }[] | null | undefined;
    const startsAt = Array.isArray(ev) ? ev[0]?.starts_at : ev?.starts_at;
    if (!order || !startsAt) {
      return NextResponse.json({ error: 'このチケットは利用できません' }, { status: 404 });
    }
    if (order.status === 'paid') {
      const state = getEntryState(startsAt);
      const win = getEntryWindow(startsAt);
      if (state === 'not_yet') {
        return NextResponse.json(
          { error: `入場受付は ${formatJst(win.opensAt)} から（開演3時間前）です` },
          { status: 409 }
        );
      }
      if (state === 'closed') {
        return NextResponse.json({ error: '入場受付は終了しました（開演日の23:59まで）' }, { status: 409 });
      }
    }

    const { data: updated, error } = await supabase
      .from('ticket_orders')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('line_user_id', user.userId)
      .eq('status', 'paid')
      .select('id, event_id, status, amount_jpy, paid_at, used_at')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'このチケットはすでに使用済みか、利用できません' },
        { status: 409 }
      );
    }
    return NextResponse.json({ ticket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
