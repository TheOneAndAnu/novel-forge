import { NextRequest } from 'next/server';
import { getNovel, updateNovel } from '@/lib/storage';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const novel = await getNovel(params.id);
  if (!novel) return Response.json({ error: 'Novel not found' }, { status: 404 });

  await updateNovel(params.id, {
    status: 'outlined',
    chapters: [],
    wordCount: 0,
    storyBible: undefined,
    error: undefined,
  });

  return Response.json({ ok: true });
}
