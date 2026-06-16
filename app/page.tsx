'use client';
import { useEffect, useState } from 'react';
import { Novel } from '@/lib/types';

export default function Dashboard() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/novels').then(r => r.json()).then(d => { setNovels(d); setLoading(false); });
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this novel permanently?')) return;
    await fetch('/api/novels', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setNovels(prev => prev.filter(n => n.id !== id));
  }

  if (loading) return <div className="text-center py-20" style={{ color: 'var(--text2)' }}>Loading...</div>;

  if (novels.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="font-serif text-2xl mb-2">No novels yet</p>
        <p style={{ color: 'var(--text2)' }} className="mb-6">Create your first novel to get started.</p>
        <a href="/new" className="btn btn-primary">+ Create Novel</a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-6">Your Novels</h1>
      <div className="grid gap-3">
        {novels.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(n => (
          <div key={n.id} className="card flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <a href={`/novel/${n.id}`} className="font-serif text-lg font-bold hover:underline truncate">
                  {n.outline?.title || n.inputs.title || 'Untitled'}
                </a>
                <span className={`badge badge-${n.status}`}>{n.status}</span>
              </div>
              <div className="flex gap-4 text-sm" style={{ color: 'var(--text2)' }}>
                <span>{n.inputs.genre}</span>
                <span>{n.inputs.trope}</span>
                <span>{n.wordCount.toLocaleString()} words</span>
                <span className="font-mono">${n.estimatedCost.toFixed(4)}</span>
              </div>
            </div>
            <div className="flex gap-2 ml-4 shrink-0">
              <a href={`/novel/${n.id}`} className="btn btn-secondary btn-sm">Open</a>
              <button onClick={() => handleDelete(n.id)} className="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
