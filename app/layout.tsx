import './globals.css';

export const metadata = { title: 'Novel Forge', description: 'AI novel generation' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="border-b border-[var(--border)] bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-serif text-xl font-bold" style={{ color: 'var(--rust)' }}>
              Novel Forge
            </a>
            <a href="/new" className="btn btn-primary btn-sm">+ New Novel</a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
