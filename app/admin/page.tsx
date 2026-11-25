import { redirect } from 'next/navigation';

// 管理画面はスポンサーハブの統合管理画面に移りました
const ADMIN_URL = process.env.ADMIN_CONSOLE_URL || 'https://toyama-sponsor-hub.vercel.app/admin/events';

export default function AdminMovedPage() {
  redirect(ADMIN_URL);
}
