import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireAdmin, parseEventInput } from '../../../../../lib/adminAuth';
import { errorResponse, ValidationError } from '../../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// イベント編集（送られてきた項目だけ更新）
// 削除はできない仕様。販売をやめるときは is_published=false にする（購入履歴を守るため）
export async function PATCH(req: Request, context: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseEventInput(body, true);
    if (Object.keys(input).length === 0) throw new ValidationError('変更する項目がありません');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('live_events')
      .update(input)
      .eq('id', context.params.id)
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });

    return NextResponse.json({ id: data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
