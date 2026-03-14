import { redirect } from 'next/navigation';

export default function RootPage() {
  // 默认进入汉化版浏览页
  redirect('/viewer/localization');
}
