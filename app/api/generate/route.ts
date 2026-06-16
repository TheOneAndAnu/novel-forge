import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getNovel, updateNovel } from '@/lib/storage';
import {
  getChapterSystem,
  getOutlineSystem,
  buildOutlinePrompt,
  buildNovelBible,
  buildChapterContext,
  buildSummaryPrompt,
  buildStoryBibleUpdatePrompt,
} from '@/lib/prompts/systemPrompts';
import { calcCost } from '@/lib/utils/cost';
import { Chapter, Outline } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { novelId } = await req.json();
  const novel = await getNovel(novelId);
  if (!novel) {
    return new Response(JSON.stringify({ error: 'Novel not found' }), { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function log(step: string, detail: string, data?: Record<string, any>) {
        const msg = {
          step,
          detail,
          timestamp: new Date().toISOString(),
          ...data,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      }

      try {
        await updateNovel(novelId, { status: 'generating', error: undefined });
        let totalIn = novel.totalInputTokens;
        let totalOut = novel.totalOutputTokens;
        let totalCost = novel.estimatedCost;
        let totalWords = novel.wordCount;

        // ─── STEP 1: OUTLINE ───────────────────────────────────────
        let outline = novel.outline;

        if (!outline) {
          log('outline', 'Generating chapter-by-chapter outline with Haiku...');

          const outlinePrompt = buildOutlinePrompt(novel.inputs);

          const outlineRes = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 16000,
            system: getOutlineSystem(novel.inputs.stylePreset ?? 'commercial-romance'),
            messages: [{ role: 'user', content: outlinePrompt }],
          });

          const outlineText = outlineRes.content[0].type === 'text' ? outlineRes.content[0].text : '';
          const cleaned = outlineText.replace(/```json\s?/g, '').replace(/```/g, '').trim();

          try {
            outline = JSON.parse(cleaned) as Outline;
          } catch (e) {
            // Try to extract JSON from the response
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              outline = JSON.parse(jsonMatch[0]) as Outline;
            } else {
              throw new Error('Failed to parse outline JSON from API response');
            }
          }

          const oCost = calcCost(outlineRes.usage.input_tokens, outlineRes.usage.output_tokens, 'haiku');
          totalIn += outlineRes.usage.input_tokens;
          totalOut += outlineRes.usage.output_tokens;
          totalCost += oCost;

          await updateNovel(novelId, {
            outline,
            totalInputTokens: totalIn,
            totalOutputTokens: totalOut,
            estimatedCost: totalCost,
          });

          log('outline', `Outline complete: ${outline.chapters.length} chapters planned`, {
            title: outline.title,
            tagline: outline.tagline,
            chapterCount: outline.chapters.length,
            cost: `$${oCost.toFixed(4)}`,
          });
        } else {
          log('outline', `Using existing outline: ${outline.chapters.length} chapters`);
        }

        // ─── STEP 2: CHAPTERS ──────────────────────────────────────
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

          // Include ALL previous chapter summaries for full continuity
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

          // Use prompt caching: novel bible is static, chapter prompt is dynamic
          const chapterRes = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            system: [
              {
                type: 'text',
                text: getChapterSystem(novel.inputs.stylePreset ?? 'commercial-romance'),
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

          const content = chapterRes.content[0].type === 'text' ? chapterRes.content[0].text : '';
          const wordCount = content.split(/\s+/).filter(Boolean).length;

          // Generate summary with Haiku (cheap)
          log('chapter_summary', `Generating continuity summary for Ch.${ch.index}...`);

          const summaryRes = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
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

          const chIn = chapterRes.usage.input_tokens + summaryRes.usage.input_tokens + bibleRes.usage.input_tokens;
          const chOut = chapterRes.usage.output_tokens + summaryRes.usage.output_tokens + bibleRes.usage.output_tokens;
          const chCost =
            calcCost(chapterRes.usage.input_tokens, chapterRes.usage.output_tokens, 'sonnet') +
            calcCost(summaryRes.usage.input_tokens, summaryRes.usage.output_tokens, 'haiku') +
            calcCost(bibleRes.usage.input_tokens, bibleRes.usage.output_tokens, 'haiku');

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

          // Save after every chapter (crash-safe, can resume)
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

        // ─── DONE ──────────────────────────────────────────────────
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
