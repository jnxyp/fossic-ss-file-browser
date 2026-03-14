'use client';

import { useParams } from 'next/navigation';
import SidebarPanel from '@/components/SidebarPanel';
import StatusFooterBar from '@/components/StatusFooterBar';

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const dataset = params.dataset as string;

  return (
    <div className="app-shell">
      <div className="layout-container">
        <SidebarPanel dataset={dataset} />
        <div className="main-content">
          {children}
        </div>
      </div>
      <StatusFooterBar />
    </div>
  );
}
