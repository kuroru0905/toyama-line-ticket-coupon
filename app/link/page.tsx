'use client';

import React, { useEffect, useState } from 'react';
import liff from '@line/liff';

// スポンサーマイページの「LINEと連携する」から開くページ
// https://liff.line.me/<LIFF_ID>/link?token=xxxx
type Phase = 'loading' | 'linking' | 'done' | 'error';

export default function LinkPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('確認しています...');
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setPhase('error');
      setMessage('LIFFの設定がありません（NEXT_PUBLIC_LIFF_ID）');
      return;
    }

    const run = async () => {
      try {
        await liff.init({ liffId });
      } catch {
        setPhase('error');
        setMessage('LINEの初期化に失敗しました。LINEアプリから開き直してください');
        return;
      }
      // liff.line.me 経由のクエリは init 後に復元される
      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) {
        setPhase('error');
        setMessage('連携コードがありません。スポンサーマイページからもう一度お試しください');
        return;
      }
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) {
        setPhase('error');
        setMessage('LINEログイン情報を取得できませんでした');
        return;
      }

      setPhase('linking');
      setMessage('スポンサー契約と連携しています...');
      try {
        const res = await fetch('/api/sponsor-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) {
          setPhase('error');
          setMessage(json.error || '連携に失敗しました');
          return;
        }
        setSponsorName(json.sponsorName ?? null);
        setActive(Boolean(json.active));
        setPhase('done');
        setMessage('連携が完了しました！');
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        setPhase('error');
        setMessage('通信エラーが発生しました');
      }
    };
    run();
  }, []);

  const goHome = () => {
    window.location.href = '/';
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        padding: '32px 16px',
        fontFamily: 'system-ui, -apple-system, "Hiragino Sans", sans-serif',
        color: '#0f172a',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          margin: '0 auto',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {phase === 'done' ? '✅' : phase === 'error' ? '⚠️' : '🔗'}
        </div>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>スポンサーLINE連携</h1>
        <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, margin: 0 }}>{message}</p>

        {phase === 'done' && (
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, marginTop: 12, whiteSpace: 'pre-line' }}>
            {sponsorName ? `「${sponsorName}」の` : ''}スポンサーとして、
            このLINEアカウントでスポンサー先行販売のチケットを購入できます。
            {!active && '\n※ 現在、契約は有効化前です（お支払いの確認後に先行購入できるようになります）。'}
          </p>
        )}

        {(phase === 'done' || phase === 'error') && (
          <button
            type="button"
            onClick={goHome}
            style={{
              marginTop: 20,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            チケット・クーポンを見る
          </button>
        )}
      </div>
    </main>
  );
}
