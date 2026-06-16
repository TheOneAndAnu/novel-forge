import { NextRequest, NextResponse } from 'next/server';
import { getNovel, updateNovel } from '@/lib/storage';
import { ChapterOutline } from '@/lib/types';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const novel = await getNovel(params.id);
  if (!novel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!novel.outline) return NextResponse.json({ error: 'No outline to update' }, { status: 400 });

  const { chapters } = (await req.json()) as { chapters: ChapterOutline[] };

  const updated = await updateNovel(params.id, {
    outline: { ...novel.outline, chapters },
  });

  return NextResponse.json({ outline: updated?.outline });
}
