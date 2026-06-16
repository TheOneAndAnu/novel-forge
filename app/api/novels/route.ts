import { NextRequest, NextResponse } from 'next/server';
import { getAllNovels, createNovel, deleteNovel } from '@/lib/storage';

export async function GET() {
  return NextResponse.json(await getAllNovels());
}

export async function POST(req: NextRequest) {
  const { inputs } = await req.json();
  const novel = await createNovel(inputs);
  return NextResponse.json(novel);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await deleteNovel(id);
  return NextResponse.json({ ok: true });
}
