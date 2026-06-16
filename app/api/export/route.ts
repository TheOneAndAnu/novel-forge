import { NextRequest, NextResponse } from 'next/server';
import { getNovel } from '@/lib/storage';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
} from 'docx';

function parseMarkdownToRuns(text: string, baseSize: number, baseFont: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: baseSize, font: baseFont }));
    }
    if (match[1] !== undefined) {
      runs.push(new TextRun({ text: match[1], size: baseSize, font: baseFont, bold: true }));
    } else if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], size: baseSize, font: baseFont, italics: true }));
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: baseSize, font: baseFont }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text, size: baseSize, font: baseFont })];
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const novel = await getNovel(id);
  if (!novel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (novel.chapters.length === 0) return NextResponse.json({ error: 'No chapters' }, { status: 400 });

  const title = novel.outline?.title || novel.inputs.title;
  const tagline = novel.outline?.tagline || '';

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({ text: '', spacing: { before: 3000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 52, font: 'Georgia' })],
    }),
  );

  if (tagline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: tagline, italics: true, size: 24, font: 'Georgia' })],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${novel.wordCount.toLocaleString()} words`,
          size: 20,
          font: 'Georgia',
          color: '888888',
        }),
      ],
    }),
  );

  for (const ch of novel.chapters.sort((a, b) => a.index - b.index)) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200, after: 200 },
        children: [
          new TextRun({
            text: `Chapter ${ch.index}`,
            bold: true,
            size: 28,
            font: 'Georgia',
            allCaps: true,
            color: '666666',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: ch.title, italics: true, size: 26, font: 'Georgia' })],
      }),
    );

    const paragraphs = ch.content.split(/\n\n+/);
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const pText = paragraphs[pi].trim();
      if (!pText) continue;

      children.push(
        new Paragraph({
          spacing: { after: 120, line: 340 },
          indent: pi > 0 ? { firstLine: 360 } : undefined,
          children: parseMarkdownToRuns(pText, 24, 'Georgia'),
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const filename = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}.docx"`,
    },
  });
}
