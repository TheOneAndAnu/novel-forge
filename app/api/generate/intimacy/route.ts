import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getNovel, updateNovel } from '@/lib/storage';
import {
  buildChapterSystemPrompt,
  buildIntimacyScenePrompt,
  buildStoryBibleUpdatePrompt,
} from '@/lib/prompts/systemPrompts';

const PLACEHOLDER_RE = /\[INTIMACY SCENE[^\]]*\]/i;
import { calcCost } from '@/lib/utils/cost';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { novelId, chapterIndex, sceneNotes } = await req.json();

  const novel = await getNovel(novelId);
  if (!novel) {
    return Response.json({ error: 'Novel not found' }, { status: 404 });
  }

  const chapterData = novel.chapters.find(c => c.index === chapterIndex);
  if (!chapterData) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const placeholderMatch = chapterData.content.match(PLACEHOLDER_RE);
  if (!placeholderMatch) {
    return Response.json({ error: 'No intimacy scene placeholder found in this chapter' }, { status: 400 });
  }

  const chapterOutline = novel.outline?.chapters.find(c => c.index === chapterIndex);
  if (!chapterOutline) {
    return Response.json({ error: 'Chapter outline not found' }, { status: 404 });
  }

  const [beforeContent, afterContent] = chapterData.content.split(placeholderMatch[0]);

  const prompt = buildIntimacyScenePrompt(
    novel.inputs,
    chapterOutline,
    sceneNotes || chapterOutline.intimateSceneNotes || '',
    novel.storyBible || '',
    beforeContent,
    afterContent,
    chapterOutline.referenceScene,
  );

  const sceneRes = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: buildChapterSystemPrompt(novel.inputs.stylePreset ?? 'commercial-romance', novel.inputs.writingStyle),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: prompt }],
  });

  const sceneContent = sceneRes.content[0].type === 'text' ? sceneRes.content[0].text.trim() : '';
  const updatedContent = beforeContent.trimEnd() + '\n\n' + sceneContent + '\n\n' + afterContent.trimStart();
  const updatedWordCount = updatedContent.split(/\s+/).filter(Boolean).length;

  const sceneCost = calcCost(sceneRes.usage.input_tokens, sceneRes.usage.output_tokens, 'sonnet');

  const bibleRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: buildStoryBibleUpdatePrompt(updatedContent, chapterIndex, novel.storyBible),
    }],
  });

  const updatedBible = bibleRes.content[0].type === 'text' ? bibleRes.content[0].text : novel.storyBible;
  const bibleCost = calcCost(bibleRes.usage.input_tokens, bibleRes.usage.output_tokens, 'haiku');

  const updatedChapters = novel.chapters.map(c =>
    c.index === chapterIndex
      ? { ...c, content: updatedContent, wordCount: updatedWordCount }
      : c,
  );

  const totalWordCount = updatedChapters.reduce((sum, c) => sum + c.wordCount, 0);
  const totalCost = sceneCost + bibleCost;

  await updateNovel(novelId, {
    chapters: updatedChapters,
    wordCount: totalWordCount,
    storyBible: updatedBible,
    totalInputTokens: novel.totalInputTokens + sceneRes.usage.input_tokens + bibleRes.usage.input_tokens,
    totalOutputTokens: novel.totalOutputTokens + sceneRes.usage.output_tokens + bibleRes.usage.output_tokens,
    estimatedCost: novel.estimatedCost + totalCost,
  });

  return Response.json({
    scene: sceneContent,
    updatedContent,
    wordCount: updatedWordCount,
    cost: `$${totalCost.toFixed(4)}`,
  });
}
