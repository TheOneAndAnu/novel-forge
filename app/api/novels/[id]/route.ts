import { NextRequest, NextResponse } from 'next/server';
import { getNovel } from '@/lib/storage';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const novel = await getNovel(params.id);
  if (!novel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(novel);
}
