'use client';

import React, { useEffect, useState } from 'react';
import liff from '@line/liff';

type TabKey = 'ticket' | 'coupon';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('ticket');
  const [liffStatus, setLiffStatus] = useState<string>('確認中');
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('ゲスト');
  const [ticketIssued, setTicketIssued] = useState<boolean>(false);
  const [ticketUsed, setTicketUsed] = useState<boolean>(false);
  const [couponUnlocked, setCouponUnlocked] = useState<boolean>(false);
  const [couponUsed, setCouponUsed] = useState<boolean>(false);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setLiffStatus('ブラウザプレビュー（NEXT_PUBLIC_LIFF_ID 未設定）');
      return;
    }

    liff
      .init({ liffId })
      .then(async () => {
        setLiffStatus(liff.isInClient() ? 'LINEアプリ内（LIFF接続済）' : '外部ブラウザ（LIFF初期化済）');
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          setDisplayName(profile.displayName);
        }
      })
      .catch(() => {
        setLiffStatus('LIFF初期化エラー（設定を確認してください）');
      });
  }, []);

  const handleIssueTicket = () => {
    setTicketIssued(true);
    setTicketUsed(false);
  };

  const handleUseTicket = () => {
    if (!ticketIssued || ticketUsed) return;
    setTicketUsed(true);
    setCouponUnlocked(true);
  };

  const handleUseCoupon = () => {
    if (!couponUnlocked || couponUsed) return;
    setCouponUsed(true);
  };

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 64px' }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', margin: '0 0 4px' }}>
          TOYAMA KIKAKU LINE O2O
        </p>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>
          ライブチケット＆スポンサークーポン
        </h1>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
          ユーザー：{displayName} {lineUserId ? `(${lineUserId.slice(0, 8)}...)` : ''}
        </p>
        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
          状態：{liffStatus}
        </p>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('ticket')}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            backgroundColor: activeTab === 'ticket' ? '#0f172a' : '#ffffff',
            color: activeTab === 'ticket' ? '#ffffff' : '#0f172a',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          1. チケット（購入・発券・使用）
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('coupon')}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            backgroundColor: activeTab === 'coupon' ? '#0f172a' : '#ffffff',
            color: activeTab === 'coupon' ? '#ffffff' : '#0f172a',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          2. ライブ後クーポン
        </button>
      </div>

      {activeTab === 'ticket' ? (
        <section style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>イベント入場チケット</h2>
          <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px' }}>
            チケット発券後、入場時に「チケットを使用する」を押すと利用済みになり、ライブ後クーポンが解放されます。
          </p>

          <div style={{ fontSize: 13, marginBottom: 14, padding: 12, backgroundColor: '#f1f5f9', borderRadius: 8 }}>
            <div>発券状態：{ticketIssued ? '発券済み' : '未発券'}</div>
            <div>利用状態：{ticketUsed ? '使用済み' : ticketIssued ? '未使用（入場可能）' : '—'}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={handleIssueTicket}
              disabled={ticketIssued}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: ticketIssued ? '#94a3b8' : '#0284c7',
                color: '#ffffff',
                fontWeight: 700,
                cursor: ticketIssued ? 'not-allowed' : 'pointer',
              }}
            >
              {ticketIssued ? 'チケット発券完了' : 'チケットを購入・発券する（テスト）'}
            </button>

            <button
              type="button"
              onClick={handleUseTicket}
              disabled={!ticketIssued || ticketUsed}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: !ticketIssued || ticketUsed ? '#94a3b8' : '#16a34a',
                color: '#ffffff',
                fontWeight: 700,
                cursor: !ticketIssued || ticketUsed ? 'not-allowed' : 'pointer',
              }}
            >
              {ticketUsed ? 'チケット使用済み' : 'チケットを使用する（入場消込）'}
            </button>
          </div>
        </section>
      ) : (
        <section style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>スポンサー店舗クーポン</h2>
          {!couponUnlocked ? (
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              チケット使用・ライブ終了後にクーポンが利用可能になります。
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px' }}>
                対象店舗でスタッフ提示のうえ「クーポンを使用する」を押してください。
              </p>
              <div style={{ fontSize: 13, marginBottom: 14, padding: 12, backgroundColor: '#fefce8', borderRadius: 8, border: '1px solid #fde047' }}>
                <div>特典内容：登別・幌別 提携スポンサー店舗 優待クーポン</div>
                <div>利用状態：{couponUsed ? '使用済み' : '利用可能'}</div>
              </div>
              <button
                type="button"
                onClick={handleUseCoupon}
                disabled={couponUsed}
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: couponUsed ? '#94a3b8' : '#d97706',
                  color: '#ffffff',
                  fontWeight: 700,
                  width: '100%',
                  cursor: couponUsed ? 'not-allowed' : 'pointer',
                }}
              >
                {couponUsed ? 'クーポン使用済み' : 'クーポンを使用する'}
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
