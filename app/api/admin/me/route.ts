import { NextResponse } from 'next/server';
import { requireLineUser } from '../../../../lib/lineAuth';
import { isAdminUserId } from '../../../../lib/adminAuth';
import { errorResponse } from '../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// ログイン中のLINEアカウントが管理者かどうか
export async function GET(req: Request) {
  try {
    const user = await requireLineUser(req);
    return NextResponse.json({
      isAdmin: isAdminUserId(user.userId),
      userId: user.userId,
      displayName: user.displayName,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
