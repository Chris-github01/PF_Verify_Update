import { Outlet } from 'react-router-dom';
import Header from './Header';
import DevBanner from './DevBanner';

export default function Layout() {
  return (
    <div className="flex flex-col min-h-svh bg-slate-950">
      <DevBanner />
      <Header />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
