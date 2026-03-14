'use client';

import { useParams } from 'next/navigation';
import SidebarPanel from '@/components/SidebarPanel';
import StatusFooterBarV2 from '@/components/StatusFooterBarV2';

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
      <StatusFooterBarV2 />
    </div>
  );
}
