import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getNovel, updateNovel } from '@/lib/storage';
import {
  buildChapterSystemPrompt,
  buildNovelBible,
  buildChapterContext,
  buildSummaryPrompt,
  buildStoryBibleUpdatePrompt,
  buildIntimacyScenePrompt,
} from '@/lib/prompts/systemPrompts';

const PLACEHOLDER_RE = /\[INTIMACY SCENE[^\]]*\]/i;
import { calcCost } from '@/lib/utils/cost';
import { Chapter } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const { novelId } = await req.json();
  const novel = await getNovel(novelId);
  if (!novel) {
    return new Response(JSON.stringify({ error: 'Novel not found' }), { status: 404 });
  }
  if (!novel.outline) {
    return new Response(JSON.stringify({ error: 'No outline — generate outline first' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function log(step: string, detail: string, data?: Record<string, any>) {
        const msg = { step, detail, timestamp: new Date().toISOString(), ...data };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      }

      try {
        await updateNovel(novelId, { status: 'generating', error: undefined });

        const outline = novel.outline!;
        let totalIn = novel.totalInputTokens;
        let totalOut = novel.totalOutputTokens;
        let totalCost = novel.estimatedCost;
        let totalWords = novel.wordCount;

        const chapters: Chapter[] = [...(novel.chapters || [])];
        const startFrom = chapters.length;
        let currentStoryBible = novel.storyBible || '';

        if (startFrom > 0) {
          log('chapters', `Resuming from chapter ${startFrom + 1} (${startFrom} already done)`);
        }

        // Novel bible — static across all chapter calls, gets cached
        const novelBible = buildNovelBible(novel.inputs, outline);

        for (let i = startFrom; i < outline.chapters.length; i++) {
          const ch = outline.chapters[i];

          log('chapter_start', `Writing Chapter ${ch.index}/${outline.chapters.length}: "${ch.title}"`, {
            currentChapter: ch.index,
            totalChapters: outline.chapters.length,
            hasIntimateScene: ch.hasIntimateScene,
            wordTarget: ch.wordTarget,
          });

          // ALL previous chapter summaries for full continuity
          const prevSummaries = chapters
            .slice(0, i)
            .map((c) => `Chapter ${c.index} ("${c.title}"): ${c.summary}`)
            .join('\n\n');

          const chapterPrompt = buildChapterContext(
            novel.inputs,
            ch,
            prevSummaries,
            i === 0,
            currentStoryBible || undefined,
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
                  {
                    type: 'text',
                    text: novelBible,
                    cache_control: { type: 'ephemeral' },
                  },
                  {
                    type: 'text',
                    text: chapterPrompt,
                  },
                ],
              },
            ],
          });

          let content = chapterRes.content[0].type === 'text' ? chapterRes.content[0].text : '';
          let intimacyIn = 0, intimacyOut = 0, intimacyCost = 0;

          if (ch.hasIntimateScene && PLACEHOLDER_RE.test(content)) {
            log('chapter_intimacy', `Generating intimacy scene for Ch.${ch.index}...`, { currentChapter: ch.index, totalChapters: outline.chapters.length });
            const placeholderMatch = content.match(PLACEHOLDER_RE)!;
            const [beforeContent, afterContent] = content.split(placeholderMatch[0]);
            const intimacyPrompt = buildIntimacyScenePrompt(
              novel.inputs, ch,
              ch.intimateSceneNotes || '',
              currentStoryBible,
              beforeContent,
              afterContent,
              ch.referenceScene,
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

          log('chapter_summary', `Generating continuity summary for Ch.${ch.index}...`);

          const summaryRes = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            messages: [{ role: 'user', content: buildSummaryPrompt(content, ch.index) }],
          });

          const summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : '';

          log('chapter_bible', `Updating story bible after Ch.${ch.index}...`);

          const bibleRes = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 700,
            messages: [{ role: 'user', content: buildStoryBibleUpdatePrompt(content, ch.index, currentStoryBible || undefined) }],
          });

          currentStoryBible = bibleRes.content[0].type === 'text' ? bibleRes.content[0].text : currentStoryBible;

          const chIn = chapterRes.usage.input_tokens + summaryRes.usage.input_tokens + bibleRes.usage.input_tokens + intimacyIn;
          const chOut = chapterRes.usage.output_tokens + summaryRes.usage.output_tokens + bibleRes.usage.output_tokens + intimacyOut;
          const chCost =
            calcCost(chapterRes.usage.input_tokens, chapterRes.usage.output_tokens, 'sonnet') +
            calcCost(summaryRes.usage.input_tokens, summaryRes.usage.output_tokens, 'haiku') +
            calcCost(bibleRes.usage.input_tokens, bibleRes.usage.output_tokens, 'haiku') +
            intimacyCost;

          totalIn += chIn;
          totalOut += chOut;
          totalCost += chCost;
          totalWords += wordCount;

          const chapter: Chapter = {
            index: ch.index,
            title: ch.title,
            content,
            wordCount,
            summary,
            inputTokens: chIn,
            outputTokens: chOut,
          };

          chapters.push(chapter);

          await updateNovel(novelId, {
            chapters,
            wordCount: totalWords,
            totalInputTokens: totalIn,
            totalOutputTokens: totalOut,
            estimatedCost: totalCost,
            storyBible: currentStoryBible,
          });

          const cacheInfo = (chapterRes.usage as any).cache_read_input_tokens
            ? ` (${((chapterRes.usage as any).cache_read_input_tokens || 0).toLocaleString()} cached tokens)`
            : '';

          log('chapter_done', `Chapter ${ch.index} complete: ${wordCount.toLocaleString()} words`, {
            currentChapter: ch.index,
            totalChapters: outline.chapters.length,
            wordCount: totalWords,
            chapterWords: wordCount,
            chapterCost: `$${chCost.toFixed(4)}`,
            totalCost: `$${totalCost.toFixed(4)}`,
            cacheInfo,
          });
        }

        await updateNovel(novelId, { status: 'complete' });

        log('complete', `Novel complete!`, {
          totalWords,
          totalChapters: outline.chapters.length,
          totalCost: `$${totalCost.toFixed(4)}`,
          totalInputTokens: totalIn,
          totalOutputTokens: totalOut,
        });
      } catch (err: any) {
        await updateNovel(novelId, { status: 'error', error: err.message });
        log('error', err.message);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
