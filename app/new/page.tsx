'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NovelInputs, NsfwIntensity } from '@/lib/types';
import { STYLE_PRESETS } from '@/lib/prompts/systemPrompts';

export default function NewNovelPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NovelInputs>({
    title: '',
    genre: '',
    trope: '',
    setting: '',
    timePeriod: '',
    heroName: '',
    heroArchetype: '',
    heroDescription: '',
    heroineName: '',
    heroineArchetype: '',
    heroineDescription: '',
    coreConflict: '',
    plotSummary: '',
    mustIncludeScenes: '',
    hasIntimateScenes: false,
    nsfwIntensity: 'steamy',
    minIntimateScenes: 0,
    referenceScenes: [],
    targetWords: 45000,
    chapterCount: 20,
    stylePreset: 'commercial-romance',
    writingStyle: '',
  });

  const set = <K extends keyof NovelInputs>(k: K, v: NovelInputs[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit() {
    if (!form.title.trim() || !form.plotSummary.trim() || !form.heroName.trim() || !form.heroineName.trim()) {
      alert('Title, story brief, and both character names are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: form }),
      });
      const novel = await res.json();
      router.push(`/novel/${novel.id}`);
    } catch {
      alert('Failed to create novel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <h1 className="font-serif text-2xl font-bold mb-1">New Novel</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text2)' }}>
        Paste your full story idea into the brief. The more detail, the better the output.
      </p>

      {/* Writing Style */}
      <div className="card mb-5">
        <div className="section-label">Writing Style</div>
        <div className="grid grid-cols-1 gap-2 mb-4">
          {STYLE_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => set('stylePreset', preset.id)}
              className="text-left px-4 py-3 rounded-lg border transition-all"
              style={{
                borderColor: form.stylePreset === preset.id ? 'var(--rust)' : 'var(--border)',
                background: form.stylePreset === preset.id ? 'var(--surface)' : 'transparent',
              }}
            >
              <div className="text-sm font-semibold" style={{ color: form.stylePreset === preset.id ? 'var(--rust)' : 'var(--text1)' }}>
                {preset.label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{preset.description}</div>
            </button>
          ))}
        </div>
        <div>
          <label>
            Custom Style Guide{' '}
            <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional — overrides preset)</span>
          </label>
          <textarea
            value={form.writingStyle ?? ''}
            onChange={e => set('writingStyle', e.target.value)}
            rows={5}
            placeholder="Paste your writing style rules here. Prose style, dialogue approach, pacing, tone, banned patterns, anything specific."
          />
          <div className="hint">Injected into every chapter prompt and takes priority over the preset above.</div>
        </div>
      </div>

      {/* Story */}
      <div className="card mb-5">
        <div className="section-label">Story</div>
        <div className="grid gap-4">

          <div>
            <label>Title</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Working title"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label>Hero Name</label>
              <input
                value={form.heroName}
                onChange={e => set('heroName', e.target.value)}
                placeholder="Arjun Malhotra"
              />
            </div>
            <div>
              <label>Heroine Name</label>
              <input
                value={form.heroineName}
                onChange={e => set('heroineName', e.target.value)}
                placeholder="Meera Kapoor"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label>
                Setting{' '}
                <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional)</span>
              </label>
              <input
                value={form.setting}
                onChange={e => set('setting', e.target.value)}
                placeholder="Mumbai, NYC..."
              />
            </div>
            <div>
              <label>
                Genre{' '}
                <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional)</span>
              </label>
              <input
                value={form.genre}
                onChange={e => set('genre', e.target.value)}
                placeholder="Dark Romance"
              />
            </div>
            <div>
              <label>
                Trope{' '}
                <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional)</span>
              </label>
              <input
                value={form.trope}
                onChange={e => set('trope', e.target.value)}
                placeholder="Enemies to Lovers"
              />
            </div>
          </div>

          <div>
            <label>
              Story Brief{' '}
              <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(most important field)</span>
            </label>
            <textarea
              value={form.plotSummary}
              onChange={e => set('plotSummary', e.target.value)}
              rows={10}
              placeholder="Paste everything here — who the characters are, their backstories and personalities, the setting, what the central conflict is, how they meet, the major turning points, the midpoint crisis, the darkest moment, the climax, and how it resolves. The more specific you are, the better every chapter will be."
            />
            <div className="hint">Aim for 300–500 words. Specific beats, names, and emotional moments matter more than broad strokes.</div>
          </div>

        </div>
      </div>

      {/* Required Scenes */}
      <div className="card mb-5">
        <div className="section-label">
          Required Scenes{' '}
          <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>optional</span>
        </div>
        <textarea
          value={form.mustIncludeScenes ?? ''}
          onChange={e => set('mustIncludeScenes', e.target.value)}
          rows={5}
          placeholder={`Specific scenes, moments, or dialogue that MUST appear in the novel. The entire outline will be structured so these happen organically.\n\nExamples:\n- She finds his old letters and realizes he never stopped loving her\n- "I don't need you to save me. I needed you to stay." (Meera to Arjun, after the accident)\n- They get locked in a hotel room together during a blackout`}
        />
        <div className="hint">
          These are injected as absolute requirements into the outline and every relevant chapter. The story shapes around them, not the other way around.
        </div>
      </div>

      {/* Intimate Scenes */}
      <div className="card mb-5">
        <div className="section-label">Intimate Scenes</div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="hasIntimateScenes"
            checked={form.hasIntimateScenes}
            onChange={e => set('hasIntimateScenes', e.target.checked)}
          />
          <label htmlFor="hasIntimateScenes" style={{ marginBottom: 0 }}>
            This novel contains intimate scenes
          </label>
        </div>
        {form.hasIntimateScenes && (
          <div className="mt-4">
            <label>Intensity Level</label>
            <div className="flex gap-2 mt-1">
              {(['mild', 'steamy', 'explicit'] as NsfwIntensity[]).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set('nsfwIntensity', level)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${form.nsfwIntensity === level ? 'text-white' : 'border'}`}
                  style={
                    form.nsfwIntensity === level
                      ? { background: 'var(--rust)' }
                      : { borderColor: 'var(--border)', color: 'var(--text2)' }
                  }
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="hint mt-2">
              {form.nsfwIntensity === 'mild' && 'Sensual and suggestive. Closed door — charged but restrained.'}
              {form.nsfwIntensity === 'steamy' && 'Open door. Explicit physical detail, emotionally grounded.'}
              {form.nsfwIntensity === 'explicit' && 'Fully graphic. Nothing faded, nothing skipped.'}
            </div>
            <div className="hint mt-2">
              The outline will automatically place intimate scenes at the right narrative moments. You can adjust them in the outline editor before generating chapters.
            </div>
          </div>
        )}
      </div>

      {/* Generation Settings */}
      <div className="card mb-8">
        <div className="section-label">Generation Settings</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label>Target Word Count</label>
            <select value={form.targetWords} onChange={e => set('targetWords', +e.target.value)}>
              <option value={30000}>30,000 (short novella)</option>
              <option value={40000}>40,000</option>
              <option value={45000}>45,000 (recommended)</option>
              <option value={50000}>50,000</option>
              <option value={60000}>60,000 (long)</option>
            </select>
          </div>
          <div>
            <label>Chapters</label>
            <select value={form.chapterCount} onChange={e => set('chapterCount', +e.target.value)}>
              {[15, 20, 25, 30, 35].map(n => (
                <option key={n} value={n}>
                  {n} chapters (~{Math.round(form.targetWords / n).toLocaleString()} words each)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'var(--bg)' }}>
          Estimated cost:{' '}
          <span className="font-mono font-bold">
            ~${((form.targetWords * 1.3 * 15 + form.chapterCount * 3000 * 3) / 1_000_000).toFixed(2)}
          </span>
          <span style={{ color: 'var(--text2)' }}> (Sonnet for chapters, Haiku for outline/summaries)</span>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <a href="/" className="btn btn-secondary">Cancel</a>
        <button onClick={handleSubmit} disabled={saving} className="btn btn-primary">
          {saving ? 'Creating...' : 'Create Novel'}
        </button>
      </div>
    </div>
  );
}
