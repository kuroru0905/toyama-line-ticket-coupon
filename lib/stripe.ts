// Stripe REST API を fetch で直接呼ぶ薄いラッパー（SDKの追加依存なし）
import crypto from 'crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('環境変数 STRIPE_SECRET_KEY が未設定です');
  }
  return key;
}

export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired' | null;
  metadata: Record<string, string> | null;
  amount_total: number | null;
};

async function stripeRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? 'Stripe APIエラー';
    throw new Error(`Stripe: ${message}`);
  }
  return json as T;
}

export async function createCheckoutSession(params: {
  orderId: string;
  eventTitle: string;
  amountJpy: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'jpy',
    'line_items[0][price_data][unit_amount]': String(params.amountJpy),
    'line_items[0][price_data][product_data][name]': params.eventTitle,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.orderId,
    'metadata[order_id]': params.orderId,
    // 未決済セッションは約30分で失効（Stripeの最小値30分に余裕を持たせて31分）
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
  });
  return stripeRequest<CheckoutSession>('/checkout/sessions', { method: 'POST', body });
}

export async function retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' }
  );
}

// Webhook署名（Stripe-Signature ヘッダー）の検証
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSec = 300
): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').map((p) => p.split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'hex');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}
