import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '登別ライブチケット＆クーポン | 外山企画',
  description:
    'LINE公式アカウントでのチケット購入・発券・利用と、ライブ終了後のスポンサー店舗クーポン配布・利用システム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'sans-serif', backgroundColor: '#f8fafc', color: '#0f172a' }}>
        {children}
      </body>
    </html>
  );
}
