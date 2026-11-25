import type { SupabaseClient } from '@supabase/supabase-js';

// LINEアカウントが「有効なスポンサー契約」と連携しているか
// （先行販売はどの枠のスポンサーでも購入可：上位枠は下位枠の特典を含むため）
export async function isActiveSponsorLineUser(
  supabase: SupabaseClient,
  lineUserId: string
): Promise<boolean> {
  const { data: links, error } = await supabase
    .from('sponsor_line_links')
    .select('sponsor_id')
    .eq('line_user_id', lineUserId);
  if (error || !links || links.length === 0) return false;

  const ids = links.map((l) => l.sponsor_id as string);
  const { count } = await supabase
    .from('sponsors')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('status', 'active');
  return (count ?? 0) > 0;
}

// 有効なスポンサーのID一覧（解約・未払いのスポンサーのクーポンを隠すため）
export async function activeSponsorIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from('sponsors').select('id').eq('status', 'active');
  return new Set((data ?? []).map((s) => s.id as string));
}
