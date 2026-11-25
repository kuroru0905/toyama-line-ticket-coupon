import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../../../../lib/adminAuth';
import { errorResponse } from '../../../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// イベントの購入者一覧（支払済み・入場済みのみ）
export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('ticket_orders')
      .select('id, display_name, status, amount_jpy, paid_at, used_at')
      .eq('event_id', context.params.id)
      .in('status', ['paid', 'used'])
      .order('paid_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ orders: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
