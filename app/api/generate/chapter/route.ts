import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getNovel, updateNovel } from '@/lib/storage';
import {
  buildChapterSystemPrompt,
  buildNovelBible,
  buildChapterContext,
  buildSummaryPrompt,
  buildIntimacyScenePrompt,
} from '@/lib/prompts/systemPrompts';

const PLACEHOLDER_RE = /\[INTIMACY SCENE[^\]]*\]/i;
import { calcCost } from '@/lib/utils/cost';
import { Chapter } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { novelId, chapterIndex } = await req.json();

  const novel = await getNovel(novelId);
  if (!novel) return Response.json({ error: 'Novel not found' }, { status: 404 });
  if (!novel.outline) return Response.json({ error: 'No outline found' }, { status: 400 });

  const chapterOutline = novel.outline.chapters.find(c => c.index === chapterIndex);
  if (!chapterOutline) return Response.json({ error: 'Chapter not found in outline' }, { status: 404 });

  const novelBible = buildNovelBible(novel.inputs, novel.outline);

  const prevSummaries = novel.chapters
    .filter(c => c.index < chapterIndex)
    .sort((a, b) => a.index - b.index)
    .map(c => `Chapter ${c.index} ("${c.title}"): ${c.summary}`)
    .join('\n\n');

  const chapterPrompt = buildChapterContext(
    novel.inputs,
    chapterOutline,
    prevSummaries,
    chapterIndex === 1,
    novel.storyBible || undefined,
  );

  const chapterRes = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: buildChapterSystemPrompt(novel.inputs.stylePreset ?? 'commercial-romance', novel.inputs.writingStyle),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: novelBible, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: chapterPrompt },
        ],
      },
    ],
  });

  let content = chapterRes.content[0].type === 'text' ? chapterRes.content[0].text : '';
  let intimacyIn = 0, intimacyOut = 0, intimacyCost = 0;

  if (chapterOutline.hasIntimateScene && PLACEHOLDER_RE.test(content)) {
    const placeholderMatch = content.match(PLACEHOLDER_RE)!;
    const [beforeContent, afterContent] = content.split(placeholderMatch[0]);
    const intimacyPrompt = buildIntimacyScenePrompt(
      novel.inputs, chapterOutline,
      chapterOutline.intimateSceneNotes || '',
      novel.storyBible || '',
      beforeContent,
      afterContent,
      chapterOutline.referenceScene,
    );
    const intimacyRes = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: [{ type: 'text', text: buildChapterSystemPrompt(novel.inputs.stylePreset ?? 'commercial-romance', novel.inputs.writingStyle), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: intimacyPrompt }],
    });
    const scene = intimacyRes.content[0].type === 'text' ? intimacyRes.content[0].text.trim() : '';
    if (scene) {
      content = beforeContent.trimEnd() + '\n\n' + scene + '\n\n' + afterContent.trimStart();
    }
    intimacyIn = intimacyRes.usage.input_tokens;
    intimacyOut = intimacyRes.usage.output_tokens;
    intimacyCost = calcCost(intimacyIn, intimacyOut, 'sonnet');
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const summaryRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: buildSummaryPrompt(content, chapterIndex) }],
  });

  const summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : '';

  const chIn = chapterRes.usage.input_tokens + summaryRes.usage.input_tokens + intimacyIn;
  const chOut = chapterRes.usage.output_tokens + summaryRes.usage.output_tokens + intimacyOut;
  const cost =
    calcCost(chapterRes.usage.input_tokens, chapterRes.usage.output_tokens, 'sonnet') +
    calcCost(summaryRes.usage.input_tokens, summaryRes.usage.output_tokens, 'haiku') +
    intimacyCost;

  const updatedChapter: Chapter = {
    index: chapterIndex,
    title: chapterOutline.title,
    content,
    wordCount,
    summary,
    inputTokens: chIn,
    outputTokens: chOut,
  };

  const exists = novel.chapters.some(c => c.index === chapterIndex);
  const updatedChapters = exists
    ? novel.chapters.map(c => c.index === chapterIndex ? updatedChapter : c)
    : [...novel.chapters, updatedChapter].sort((a, b) => a.index - b.index);

  const totalWordCount = updatedChapters.reduce((sum, c) => sum + c.wordCount, 0);

  await updateNovel(novelId, {
    chapters: updatedChapters,
    wordCount: totalWordCount,
    totalInputTokens: novel.totalInputTokens + chIn,
    totalOutputTokens: novel.totalOutputTokens + chOut,
    estimatedCost: novel.estimatedCost + cost,
  });

  return Response.json({
    chapter: updatedChapter,
    cost: `$${cost.toFixed(4)}`,
  });
}
