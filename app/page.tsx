'use client';

import React, { useEffect, useState, useCallback } from 'react';
import liff from '@line/liff';

type SponsorCoupon = {
  id: string;
  shop_name: string;
  benefit_title: string;
  benefit_detail: string;
  is_published: boolean;
  is_used: boolean;
  used_at: string | null;
};

export default function SponsorCouponPage() {
  const [liffStatus, setLiffStatus] = useState<string>('確認中');
  const [displayName, setDisplayName] = useState<string>('ゲスト');
  const [coupons, setCoupons] = useState<SponsorCoupon[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCoupons = useCallback(async () => {
    try {
      setErrorMsg(null);
      const res = await fetch('/api/coupons', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'クーポンの取得に失敗しました');
        return;
      }
      setCoupons(json.coupons ?? []);
    } catch {
      setErrorMsg('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setLiffStatus('ブラウザプレビュー（NEXT_PUBLIC_LIFF_ID 未設定）');
      return;
    }

    liff
      .init({ liffId })
      .then(async () => {
        setLiffStatus(
          liff.isInClient()
            ? 'LINEアプリ内（LIFF接続済）'
            : '外部ブラウザ（LIFF初期化済）'
        );
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setDisplayName(profile.displayName);
        }
      })
      .catch(() => {
        setLiffStatus('LIFF初期化エラー（設定を確認してください）');
      });
  }, []);

  const handleUseCoupon = async (coupon: SponsorCoupon) => {
    if (coupon.is_used || usingId) return;
    const ok = window.confirm(
      `【${coupon.shop_name}】\n「${coupon.benefit_title}」を使用済みにしますか？\n一度使用すると元に戻せません。`
    );
    if (!ok) return;

    try {
      setUsingId(coupon.id);
      setErrorMsg(null);
      const res = await fetch(`/api/coupons/${coupon.id}/use`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'クーポンの使用処理に失敗しました');
        await fetchCoupons();
        return;
      }
      setCoupons((prev) =>
        prev.map((item) => (item.id === coupon.id ? json.coupon : item))
      );
    } catch {
      setErrorMsg('通信エラーが発生しました');
    } finally {
      setUsingId(null);
    }
  };

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 64px' }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', margin: '0 0 4px' }}>
          TOYAMA KIKAKU SPONSOR COUPON
        </p>
        <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>
          スポンサー店舗クーポン
        </h1>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
          ユーザー：{displayName} ／ 状態：{liffStatus}
        </p>
      </header>

      {errorMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 14, color: '#64748b' }}>クーポンを読み込み中...</p>
      ) : coupons.length === 0 ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 18,
            fontSize: 14,
            color: '#475569',
          }}
        >
          現在表示できるスポンサー店舗クーポンはありません。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {coupons.map((coupon) => (
            <section
              key={coupon.id}
              style={{
                backgroundColor: '#ffffff',
                border: coupon.is_used ? '1px solid #cbd5e1' : '1px solid #bae6fd',
                borderRadius: 12,
                padding: 18,
                opacity: coupon.is_used ? 0.72 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>
                  {coupon.shop_name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 999,
                    backgroundColor: coupon.is_used ? '#e2e8f0' : '#dcfce7',
                    color: coupon.is_used ? '#475569' : '#15803d',
                  }}
                >
                  {coupon.is_used ? '使用済み' : '利用可能'}
                </span>
              </div>

              <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>{coupon.benefit_title}</h2>
              <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px' }}>
                {coupon.benefit_detail}
              </p>

              <button
                type="button"
                disabled={coupon.is_used || usingId === coupon.id}
                onClick={() => handleUseCoupon(coupon)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: coupon.is_used ? '#94a3b8' : '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: coupon.is_used || usingId === coupon.id ? 'not-allowed' : 'pointer',
                }}
              >
                {coupon.is_used
                  ? 'このクーポンは使用済みです'
                  : usingId === coupon.id
                    ? '処理中...'
                    : 'クーポンを使用する'}
              </button>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
