'use client';

import { useParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const dataset = params.dataset as string;

  return (
    <div className="layout-container">
      <Sidebar dataset={dataset} />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}
