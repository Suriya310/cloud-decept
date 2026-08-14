import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import '@/app/globals.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className="lg:ml-64 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 pt-16 lg:pt-0 pb-8">{children}</main>
        </div>
      </body>
    </html>
  );
}