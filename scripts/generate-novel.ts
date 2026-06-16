import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildChapterSystemPrompt,
  buildNovelBible,
  buildChapterContext,
  buildSummaryPrompt,
  buildStoryBibleUpdatePrompt,
  buildIntimacyScenePrompt,
} from '../lib/prompts/systemPrompts';
import type { Novel, Chapter } from '../lib/types';

const PLACEHOLDER_RE = /\[INTIMACY SCENE[^\]]*\]/i;
const DATA_DIR = path.join(process.cwd(), '.data');
const NOVELS_FILE = path.join(DATA_DIR, 'novels.json');

function getAllNovels(): Novel[] {
  return JSON.parse(fs.readFileSync(NOVELS_FILE, 'utf-8'));
}

function saveNovels(novels: Novel[]) {
  fs.writeFileSync(NOVELS_FILE, JSON.stringify(novels, null, 2));
}

function calcCost(inputTokens: number, outputTokens: number, model: 'sonnet' | 'haiku'): number {
  if (model === 'sonnet') {
    return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  }
  return (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.25;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  const novels = getAllNovels();
  const novelIdx = novels.findIndex(n => n.inputs.title === "Internet's Favorite Couple");
  if (novelIdx === -1) throw new Error('Novel not found');

  const novel = novels[novelIdx];
  if (!novel.outline) throw new Error('No outline found');

  // Reset chapters for a clean regeneration
  novels[novelIdx] = {
    ...novel,
    chapters: [],
    wordCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCost: 0,
    storyBible: '',
    status: 'generating',
    updatedAt: new Date().toISOString(),
  };
  saveNovels(novels);

  console.log(`Regenerating: ${novel.inputs.title}`);
  console.log(`${novel.outline.chapters.length} chapters | target ${novel.inputs.targetWords.toLocaleString()} words\n`);

  const outline = novel.outline;
  const novelBible = buildNovelBible(novel.inputs, outline);
  const chapters: Chapter[] = [];
  let currentStoryBible = '';
  let totalIn = 0, totalOut = 0, totalCost = 0, totalWords = 0;

  for (let i = 0; i < outline.chapters.length; i++) {
    const ch = outline.chapters[i];
    process.stdout.write(`Ch ${ch.index}/${outline.chapters.length}: "${ch.title}" ... `);

    const prevSummaries = chapters
      .slice(0, i)
      .map(c => `Chapter ${c.index} ("${c.title}"): ${c.summary}`)
      .join('\n\n');

    const chapterPrompt = buildChapterContext(
      novel.inputs, ch, prevSummaries, i === 0, currentStoryBible || undefined
    );

    const systemText = buildChapterSystemPrompt(
      novel.inputs.stylePreset ?? 'commercial-romance',
      novel.inputs.writingStyle
    );

    const chapterRes = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
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
    let intimacyIn = 0, intimacyOut = 0;

    if (ch.hasIntimateScene && PLACEHOLDER_RE.test(content)) {
      process.stdout.write('[intimacy] ');
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
        system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: intimacyPrompt }],
      });
      const scene = intimacyRes.content[0].type === 'text' ? intimacyRes.content[0].text.trim() : '';
      if (scene) {
        content = beforeContent.trimEnd() + '\n\n' + scene + '\n\n' + afterContent.trimStart();
      }
      intimacyIn = intimacyRes.usage.input_tokens;
      intimacyOut = intimacyRes.usage.output_tokens;
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;

    const summaryRes = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: buildSummaryPrompt(content, ch.index) }],
    });
    const summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : '';

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
      (intimacyIn > 0 ? calcCost(intimacyIn, intimacyOut, 'sonnet') : 0);

    totalIn += chIn;
    totalOut += chOut;
    totalCost += chCost;
    totalWords += wordCount;

    console.log(`${wordCount.toLocaleString()} words | $${chCost.toFixed(4)}`);

    const chapter: Chapter = { index: ch.index, title: ch.title, content, wordCount, summary, inputTokens: chIn, outputTokens: chOut };
    chapters.push(chapter);

    // Save after every chapter (crash-safe)
    const fresh = getAllNovels();
    const freshIdx = fresh.findIndex(n => n.inputs.title === "Internet's Favorite Couple");
    fresh[freshIdx] = {
      ...fresh[freshIdx],
      chapters: [...chapters],
      wordCount: totalWords,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      estimatedCost: totalCost,
      storyBible: currentStoryBible,
    };
    saveNovels(fresh);
  }

  // Mark complete
  const fresh = getAllNovels();
  const freshIdx = fresh.findIndex(n => n.inputs.title === "Internet's Favorite Couple");
  fresh[freshIdx].status = 'complete';
  saveNovels(fresh);

  // Write full document
  const lines: string[] = [
    `# ${outline.title}`,
    `*${outline.tagline}*`,
    '',
  ];
  for (const ch of chapters) {
    lines.push(`## Chapter ${ch.index}: ${ch.title}`);
    lines.push('');
    lines.push(ch.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  const docPath = path.join(DATA_DIR, 'internet-favorite-couple-v2.md');
  fs.writeFileSync(docPath, lines.join('\n'), 'utf-8');

  console.log(`\nDone! ${totalWords.toLocaleString()} words | $${totalCost.toFixed(4)}`);
  console.log(`Saved: ${docPath}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
