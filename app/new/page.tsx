'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NovelInputs, NsfwIntensity } from '@/lib/types';
import { STYLE_PRESETS } from '@/lib/prompts/systemPrompts';

const GENRES = ['Dark Romance','Mafia Romance','Billionaire Romance','Fantasy Romance','Romantic Suspense','Revenge Drama','Paranormal Romance','Historical Romance','Contemporary Romance','Erotic Thriller'];
const TROPES = ['Enemies to Lovers','Forced Proximity','Fake Dating / Contract Marriage','Forbidden Love','Secret Identity','Revenge Arc','Fated Mates','Love Triangle','Redemption Arc','One Night Stand to More','Boss/Employee','Bodyguard Romance','Arranged Marriage','Second Chance Romance','Age Gap'];
const HERO_TYPES = ['Cold CEO','Ruthless Mafia Don','Dark King','Brooding Detective','Scarred Soldier','Charming Rogue','Dangerous Stranger','Rival / Competitor','Possessive Billionaire','Morally Grey Anti-Hero'];
const HEROINE_TYPES = ['Fierce and Independent','Quiet Strength','Fish Out of Water','Reborn / Second Chance','Undercover / Secret Identity','Ambitious Newcomer','Woman on the Run','Ice Queen Thawing','Smart-mouthed Survivor','Soft but Unbreakable'];

export default function NewNovelPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [hasIntimateScenes, setHasIntimateScenes] = useState(false);
  const [form, setForm] = useState<NovelInputs>({
    title: '', genre: GENRES[0], trope: TROPES[0], setting: '', timePeriod: 'Contemporary',
    heroName: '', heroArchetype: HERO_TYPES[0], heroDescription: '',
    heroineName: '', heroineArchetype: HEROINE_TYPES[0], heroineDescription: '',
    coreConflict: '', plotSummary: '',
    hasIntimateScenes: false, nsfwIntensity: 'steamy', minIntimateScenes: 0, referenceScenes: [],
    targetWords: 45000, chapterCount: 25,
    stylePreset: 'commercial-romance',
    writingStyle: '',
  });

  const set = <K extends keyof NovelInputs>(k: K, v: NovelInputs[K]) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit() {
    if (!form.title.trim() || !form.plotSummary.trim() || !form.heroName.trim() || !form.heroineName.trim()) {
      alert('Fill in title, plot summary, and character names at minimum.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: { ...form, referenceScenes: form.referenceScenes.filter(s => s.trim()) } }),
      });
      const novel = await res.json();
      router.push(`/novel/${novel.id}`);
    } catch { alert('Failed to create'); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <h1 className="font-serif text-2xl font-bold mb-1">New Novel</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text2)' }}>The more detail you give, the better the output. Plot summary is the most important field.</p>

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
          <label>Custom Style Guide <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional — overrides preset)</span></label>
          <textarea
            value={form.writingStyle ?? ''}
            onChange={e => set('writingStyle', e.target.value)}
            rows={6}
            placeholder="Paste your writing style rules here. Be specific about prose style, dialogue approach, pacing, atmospheric preferences, banned patterns, etc."
          />
          <div className="hint">If filled, this is injected directly into every chapter prompt and takes priority over the preset above.</div>
        </div>
      </div>

      {/* Basics */}
      <div className="card mb-5">
        <div className="section-label">Basics</div>
        <div className="grid gap-4">
          <div>
            <label>Title</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Working title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label>Genre</label>
              <select value={GENRES.includes(form.genre) ? form.genre : '__other__'} onChange={e => { if (e.target.value === '__other__') set('genre', ''); else set('genre', e.target.value); }}>
                {GENRES.map(g => <option key={g}>{g}</option>)}
                <option value="__other__">Other...</option>
              </select>
              {!GENRES.includes(form.genre) && <input className="mt-2" value={form.genre} onChange={e => set('genre', e.target.value)} placeholder="Enter genre..." />}
            </div>
            <div>
              <label>Trope</label>
              <select value={TROPES.includes(form.trope) ? form.trope : '__other__'} onChange={e => { if (e.target.value === '__other__') set('trope', ''); else set('trope', e.target.value); }}>
                {TROPES.map(t => <option key={t}>{t}</option>)}
                <option value="__other__">Other...</option>
              </select>
              {!TROPES.includes(form.trope) && <input className="mt-2" value={form.trope} onChange={e => set('trope', e.target.value)} placeholder="Enter trope..." />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label>Setting</label><input value={form.setting} onChange={e => set('setting', e.target.value)} placeholder="Mumbai, small-town Italy, NYC..." /></div>
            <div><label>Time Period</label><input value={form.timePeriod} onChange={e => set('timePeriod', e.target.value)} placeholder="Contemporary, 1920s..." /></div>
          </div>
        </div>
      </div>

      {/* Characters */}
      <div className="card mb-5">
        <div className="section-label">Characters</div>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label>Hero Name</label><input value={form.heroName} onChange={e => set('heroName', e.target.value)} placeholder="Arjun Malhotra" /></div>
            <div>
              <label>Archetype</label>
              <select value={HERO_TYPES.includes(form.heroArchetype) ? form.heroArchetype : '__other__'} onChange={e => { if (e.target.value === '__other__') set('heroArchetype', ''); else set('heroArchetype', e.target.value); }}>
                {HERO_TYPES.map(a => <option key={a}>{a}</option>)}
                <option value="__other__">Other...</option>
              </select>
              {!HERO_TYPES.includes(form.heroArchetype) && <input className="mt-2" value={form.heroArchetype} onChange={e => set('heroArchetype', e.target.value)} placeholder="Enter archetype..." />}
            </div>
          </div>
          <div>
            <label>Hero Description</label>
            <textarea value={form.heroDescription} onChange={e => set('heroDescription', e.target.value)} rows={3} placeholder="Backstory, personality, fears, physical appearance, voice. Be specific." />
          </div>
          <hr className="border-[var(--border)]" />
          <div className="grid grid-cols-2 gap-4">
            <div><label>Heroine Name</label><input value={form.heroineName} onChange={e => set('heroineName', e.target.value)} placeholder="Meera Kapoor" /></div>
            <div>
              <label>Archetype</label>
              <select value={HEROINE_TYPES.includes(form.heroineArchetype) ? form.heroineArchetype : '__other__'} onChange={e => { if (e.target.value === '__other__') set('heroineArchetype', ''); else set('heroineArchetype', e.target.value); }}>
                {HEROINE_TYPES.map(a => <option key={a}>{a}</option>)}
                <option value="__other__">Other...</option>
              </select>
              {!HEROINE_TYPES.includes(form.heroineArchetype) && <input className="mt-2" value={form.heroineArchetype} onChange={e => set('heroineArchetype', e.target.value)} placeholder="Enter archetype..." />}
            </div>
          </div>
          <div>
            <label>Heroine Description</label>
            <textarea value={form.heroineDescription} onChange={e => set('heroineDescription', e.target.value)} rows={3} placeholder="Backstory, personality, fears, physical appearance, voice. Be specific." />
          </div>
        </div>
      </div>

      {/* Plot */}
      <div className="card mb-5">
        <div className="section-label">Plot</div>
        <div className="grid gap-4">
          <div>
            <label>Core Conflict</label>
            <textarea value={form.coreConflict} onChange={e => set('coreConflict', e.target.value)} rows={2} placeholder="What's the central tension? What keeps them apart? What are the stakes?" />
          </div>
          <div>
            <label>Plot Summary <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(most important field)</span></label>
            <textarea value={form.plotSummary} onChange={e => set('plotSummary', e.target.value)} rows={8} placeholder="Write the full plot here. Include key turning points, twists, the midpoint reversal, the climax, and how it ends. The more detail you give here, the better every chapter will be. Think of this as the skeleton of your book." />
            <div className="hint">Aim for 300-500 words. Include specifics: names, events, emotional beats, twists.</div>
          </div>
          <div>
            <label>Additional Notes <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional)</span></label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Chapter title style, specific scenes you want, tone reminders, anything not covered above." />
          </div>
        </div>
      </div>

      {/* Intimate Scenes */}
      <div className="card mb-5">
        <div className="section-label">Intimate Scenes</div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="hasIntimateScenes"
            checked={hasIntimateScenes}
            onChange={e => {
              setHasIntimateScenes(e.target.checked);
              set('hasIntimateScenes', e.target.checked);
            }}
          />
          <label htmlFor="hasIntimateScenes" style={{ marginBottom: 0 }}>This novel contains intimate scenes</label>
        </div>
        {hasIntimateScenes && (
          <div className="mt-4">
            <label>Intensity Level</label>
            <div className="flex gap-2 mt-1">
              {(['mild','steamy','explicit'] as NsfwIntensity[]).map(level => (
                <button key={level} type="button" onClick={() => set('nsfwIntensity', level)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${form.nsfwIntensity === level ? 'text-white' : 'border'}`}
                  style={form.nsfwIntensity === level ? { background: 'var(--rust)' } : { borderColor: 'var(--border)', color: 'var(--text2)' }}>
                  {level}
                </button>
              ))}
            </div>
            <div className="hint mt-2">
              {form.nsfwIntensity === 'mild' && 'Sensual and suggestive. Closed door, but charged.'}
              {form.nsfwIntensity === 'steamy' && 'Open door. Explicit actions and sensations, not clinical.'}
              {form.nsfwIntensity === 'explicit' && 'Fully graphic. Nothing faded, nothing skipped.'}
            </div>
            <div className="hint mt-3">You'll mark which chapters contain intimate scenes in the outline editor after generation. You can paste a reference scene per chapter there.</div>
          </div>
        )}
      </div>

      {/* Settings */}
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
              {[15,20,25,30,35].map(n => <option key={n} value={n}>{n} chapters (~{Math.round(form.targetWords/n).toLocaleString()} words each)</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'var(--bg)' }}>
          Estimated cost: <span className="font-mono font-bold">~${((form.targetWords * 1.3 * 15 + form.chapterCount * 3000 * 3) / 1_000_000).toFixed(2)}</span>
          <span style={{ color: 'var(--text2)' }}> (Sonnet for chapters, Haiku for outline/summaries)</span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <a href="/" className="btn btn-secondary">Cancel</a>
        <button onClick={handleSubmit} disabled={saving} className="btn btn-primary">
          {saving ? 'Creating...' : 'Create Novel'}
        </button>
      </div>
    </div>
  );
}
