import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { SidebarProvider } from '@/lib/SidebarContext';
import '@/app/globals.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <SidebarProvider>
          <Sidebar />
          <div className="flex flex-col min-h-screen lg:ml-64" id="main-content">
            <Header />
            <main className="flex-1 pt-16 lg:pt-0 pb-8">{children}</main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}