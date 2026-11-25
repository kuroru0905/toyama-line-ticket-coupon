import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../../lib/lineAuth';
import { errorResponse } from '../../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// 入場時にチケットを使用済みにする（本人の支払済みチケットのみ）
export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const orderId = context.params.id;
    if (!orderId) {
      return NextResponse.json({ error: 'チケットIDが指定されていません' }, { status: 400 });
    }

    const user = await requireLineUser(req);
    const supabase = getSupabaseAdmin();

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
