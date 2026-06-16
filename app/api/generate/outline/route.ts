import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getNovel, updateNovel } from '@/lib/storage';
import { getOutlineSystem, buildOutlinePrompt } from '@/lib/prompts/systemPrompts';
import { calcCost } from '@/lib/utils/cost';
import { Outline } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { novelId } = await req.json();
  const novel = await getNovel(novelId);
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  try {
    const outlinePrompt = buildOutlinePrompt(novel.inputs);

    const outlineRes = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system: getOutlineSystem(novel.inputs.stylePreset ?? 'commercial-romance'),
      messages: [{ role: 'user', content: outlinePrompt }],
    });

    const outlineText = outlineRes.content[0].type === 'text' ? outlineRes.content[0].text : '';
    const cleaned = outlineText.replace(/```json\s?/g, '').replace(/```/g, '').trim();

    let outline: Outline;
    try {
      outline = JSON.parse(cleaned) as Outline;
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outline = JSON.parse(jsonMatch[0]) as Outline;
      } else {
        return NextResponse.json({ error: 'Failed to parse outline JSON' }, { status: 500 });
      }
    }

    const cost = calcCost(outlineRes.usage.input_tokens, outlineRes.usage.output_tokens, 'haiku');

    await updateNovel(novelId, {
      outline,
      status: 'outlined',
      totalInputTokens: novel.totalInputTokens + outlineRes.usage.input_tokens,
      totalOutputTokens: novel.totalOutputTokens + outlineRes.usage.output_tokens,
      estimatedCost: novel.estimatedCost + cost,
    });

    return NextResponse.json({ outline });
  } catch (err: any) {
    await updateNovel(novelId, { status: 'error', error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
