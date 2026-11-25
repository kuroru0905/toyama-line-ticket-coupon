import { NextResponse } from 'next/server';
import { AuthError } from './lineAuth';

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  const message = err instanceof Error ? err.message : 'サーバーエラーが発生しました';
  return NextResponse.json({ error: message }, { status: 500 });
}
