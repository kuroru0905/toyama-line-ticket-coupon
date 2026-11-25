import { NextResponse } from 'next/server';
import { AuthError } from './lineAuth';

// 入力値の誤り（400）
export class ValidationError extends Error {}

// 権限なし（403）
export class ForbiddenError extends Error {}

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : 'サーバーエラーが発生しました';
  return NextResponse.json({ error: message }, { status: 500 });
}
