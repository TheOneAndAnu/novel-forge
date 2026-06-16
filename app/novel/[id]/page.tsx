'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { Novel, ChapterOutline } from '@/lib/types';

interface LogEntry {
  step: string;
  detail: string;
  timestamp: string;
  act?: number;
  actSummary?: string;
  currentChapter?: number;
  totalChapters?: number;
  wordCount?: number;
  totalWords?: number;
  chapterWords?: number;
  totalCost?: string;
  chapterCost?: string;
  cacheInfo?: string;
  title?: string;
  tagline?: string;
  chapterCount?: number;
}

const ACT_NAMES: Record<number, string> = { 1: 'Setup', 2: 'Confrontation', 3: 'Resolution' };

function chapterAct(ch: ChapterOutline, total: number): 1 | 2 | 3 {
  if (ch.act) return ch.act;
  if (ch.index <= Math.floor(total * 0.25)) return 1;
  if (ch.index <= Math.floor(total * 0.75)) return 2;
  return 3;
}

export default function NovelPage({ params }: { params: { id: string } }) {
  const [novel, setNovel] = useState<Novel | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [savingOutline, setSavingOutline] = useState(false);
  const [editableChapters, setEditableChapters] = useState<ChapterOutline[] | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const [regeneratingChapter, setRegeneratingChapter] = useState<number | null>(null);
  const [currentAct, setCurrentAct] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { fetchNovel(); }, []);

  async function fetchNovel() {
    const res = await fetch(`/api/novels/${params.id}`);
    if (res.ok) {
      const data: Novel = await res.json();
      setNovel(data);
      if (data.outline) setEditableChapters(data.outline.chapters);
    }
    setLoading(false);
  }

  // ── Act computation ──────────────────────────────────────────────
  const actInfo = useMemo(() => {
    if (!novel?.outline) return null;
    const total = novel.outline.chapters.length;
    const written = new Set(novel.chapters.map(c => c.index));

    const acts = ([1, 2, 3] as const).map(n => {
      const chs = novel.outline!.chapters.filter(ch => chapterAct(ch, total) === n);
      const doneCount = chs.filter(ch => written.has(ch.index)).length;
      return {
        act: n,
        chapters: chs,
        done: doneCount,
        total: chs.length,
        complete: chs.length > 0 && doneCount === chs.length,
        started: doneCount > 0,
        summary: novel.actSummaries?.[n] || null,
      };
    });

    const nextAct = acts.find(a => !a.complete)?.act ?? null;
    return { acts, nextAct };
  }, [novel]);

  // ── Live stats from SSE ──────────────────────────────────────────
  const live = useMemo(() => {
    const doneEntries = logs.filter(l => l.step === 'chapter_done');
    const last = doneEntries[doneEntries.length - 1];
    const completeEntry = logs.find(l => l.step === 'complete');
    const actCompleteEntry = logs.filter(l => l.step === 'act_complete').at(-1);
    const final = completeEntry || actCompleteEntry || last;
    if (!final) return null;
    return {
      chaptersDoneInSession: doneEntries.length,
      totalChapters: final.totalChapters || novel?.outline?.chapters.length || 0,
      wordCount: completeEntry?.totalWords || actCompleteEntry?.totalWords || final.wordCount || 0,
      totalCost: final.totalCost || '$0.0000',
      isComplete: !!completeEntry,
      actComplete: actCompleteEntry ? { act: actCompleteEntry.act, summary: actCompleteEntry.actSummary } : null,
    };
  }, [logs]);

  const baseChaptersDone = novel?.chapters.length || 0;
  const chapsDone = generating && live ? baseChaptersDone + live.chaptersDoneInSession : baseChaptersDone;
  const totalCh = novel?.outline?.chapters.length || novel?.inputs.chapterCount || 20;
  const words = generating && live ? live.wordCount : (novel?.wordCount || 0);
  const cost = generating && live ? live.totalCost : `$${(novel?.estimatedCost || 0).toFixed(4)}`;

  const isComplete = (live?.isComplete || novel?.status === 'complete') && !generating;
  const displayStatus = isComplete ? 'complete' : generating ? 'generating' : (novel?.status || 'draft');

  async function generateOutline() {
    setGeneratingOutline(true);
    try {
      const res = await fetch('/api/generate/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: params.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Outline generation failed: ${err.error}`);
      }
    } catch (err: any) {
      alert(`Outline generation failed: ${err.message}`);
    } finally {
      setGeneratingOutline(false);
      await fetchNovel();
    }
  }

  async function saveOutline() {
    if (!editableChapters) return;
    setSavingOutline(true);
    try {
      await fetch(`/api/novels/${params.id}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapters: editableChapters }),
      });
      await fetchNovel();
    } finally {
      setSavingOutline(false);
    }
  }

  async function startActGeneration(act: 1 | 2 | 3) {
    setGenerating(true);
    setCurrentAct(act);
    setLogs([]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/generate/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: params.id, act }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const entry: LogEntry = JSON.parse(line.slice(6));
              setLogs(prev => [...prev, entry]);
              setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setLogs(prev => [...prev, { step: 'error', detail: err.message, timestamp: new Date().toISOString() }]);
      }
    } finally {
      setGenerating(false);
      setCurrentAct(null);
      await fetchNovel();
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function saveAndRegenerate() {
    if (!editableChapters) return;
    if (!confirm('This will clear all existing chapters and regenerate from the current outline. Continue?')) return;
    setSavingOutline(true);
    try {
      await fetch(`/api/novels/${params.id}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapters: editableChapters }),
      });
      await fetch(`/api/novels/${params.id}/reset`, { method: 'POST' });
      await fetchNovel();
      setShowOutlineEditor(false);
      startActGeneration(1);
    } finally {
      setSavingOutline(false);
    }
  }

  async function regenerateSingleChapter(chapterIndex: number) {
    setRegeneratingChapter(chapterIndex);
    try {
      const res = await fetch('/api/generate/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: params.id, chapterIndex }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Regeneration failed: ${err.error}`);
      } else {
        await fetchNovel();
        setActiveChapter(chapterIndex);
      }
    } catch (err: any) {
      alert(`Regeneration failed: ${err.message}`);
    } finally {
      setRegeneratingChapter(null);
    }
  }

  function openInGoogleDocs() {
    if (!novel) return;
    const title = novel.outline?.title || novel.inputs.title;
    const text = [
      title.toUpperCase(),
      novel.outline?.tagline ? `\n${novel.outline.tagline}` : '',
      '\n',
      ...novel.chapters
        .sort((a, b) => a.index - b.index)
        .flatMap(ch => [`\n\nCHAPTER ${ch.index}: ${ch.title.toUpperCase()}\n\n`, ch.content]),
    ].join('');
    navigator.clipboard.writeText(text).catch(() => {});
    window.open('https://docs.google.com/document/create', '_blank');
  }

  function updateChapter(idx: number, patch: Partial<ChapterOutline>) {
    setEditableChapters(prev => {
      if (!prev) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }

  if (loading) return <div className="text-center py-20" style={{ color: 'var(--text2)' }}>Loading...</div>;
  if (!novel) return <div className="text-center py-20" style={{ color: 'var(--red)' }}>Novel not found</div>;

  const outline = novel.outline;
  const displayTitle = outline?.title || novel.inputs.title;
  const displayTagline = outline?.tagline || '';
  const pct = totalCh > 0 ? Math.round((chapsDone / totalCh) * 100) : 0;

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-bold">{displayTitle}</h1>
          {displayTagline && <p className="text-sm italic mt-1" style={{ color: 'var(--text2)' }}>{displayTagline}</p>}
          <div className="flex items-center gap-3 mt-2 text-sm" style={{ color: 'var(--text2)' }}>
            <span className={`badge badge-${displayStatus}`}>{displayStatus}</span>
            <span>{novel.inputs.genre}</span>
            <span>{novel.inputs.trope}</span>
            <span>{words.toLocaleString()} words</span>
            <span className="font-mono">{cost}</span>
          </div>
        </div>
      </div>

      {/* Overall progress bar */}
      {chapsDone > 0 && (
        <div className="card mb-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">{chapsDone} / {totalCh} chapters</span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Outline loading */}
      {generatingOutline && (
        <div className="card mb-5">
          <p className="text-sm animate-pulse" style={{ color: 'var(--text2)' }}>
            Generating chapter outline with Claude Haiku — about 20–30 seconds...
          </p>
        </div>
      )}

      {/* ── ACT CARDS ── */}
      {outline && actInfo && !generatingOutline && (displayStatus !== 'draft' || chapsDone > 0) && (
        <div className="grid gap-3 mb-5">
          {actInfo.acts.map(a => {
            const isCurrentlyGenerating = generating && currentAct === a.act;
            const liveActSummary = live?.actComplete?.act === a.act ? live.actComplete.summary : null;
            const summary = liveActSummary || a.summary;

            return (
              <div
                key={a.act}
                className="card"
                style={{
                  borderColor: a.complete ? '#bbf7d0' : isCurrentlyGenerating ? 'var(--accent)' : 'var(--border)',
                  background: a.complete ? '#f0fdf4' : isCurrentlyGenerating ? 'var(--surface)' : 'var(--card)',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>
                        Act {a.act}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: a.complete ? 'var(--green)' : 'var(--text2)' }}>
                        {ACT_NAMES[a.act]}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text2)' }}>
                        · {a.done}/{a.total} chapters
                        {a.complete && ` · ${novel.chapters.filter(c => a.chapters.some(ac => ac.index === c.index)).reduce((s, c) => s + c.wordCount, 0).toLocaleString()} words`}
                      </span>
                    </div>

                    {/* Summary */}
                    {summary && (
                      <p className="text-sm leading-relaxed mt-2" style={{ color: 'var(--text1)' }}>
                        {summary}
                      </p>
                    )}

                    {/* In-progress indicator */}
                    {isCurrentlyGenerating && !summary && (
                      <p className="text-sm animate-pulse mt-1" style={{ color: 'var(--text2)' }}>
                        {logs.length > 0 ? logs[logs.length - 1].detail : 'Starting...'}
                      </p>
                    )}

                    {/* Not yet started hint */}
                    {!a.started && !a.complete && !isCurrentlyGenerating && actInfo.nextAct !== a.act && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>
                        Available after Act {a.act - 1} completes
                      </p>
                    )}
                  </div>

                  {/* Act action button */}
                  {!generating && !a.complete && actInfo.nextAct === a.act && (
                    <button
                      onClick={() => startActGeneration(a.act as 1 | 2 | 3)}
                      className="btn btn-primary btn-sm shrink-0"
                    >
                      {a.started ? `Resume Act ${a.act}` : `Generate Act ${a.act}`}
                    </button>
                  )}
                  {isCurrentlyGenerating && (
                    <button onClick={stopGeneration} className="btn btn-secondary btn-sm shrink-0">
                      Stop
                    </button>
                  )}
                  {a.complete && (
                    <span className="text-green-600 text-sm shrink-0">✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 mb-5 flex-wrap">
        {/* Draft, no outline */}
        {!generating && !generatingOutline && !novel.outline && (
          <button onClick={generateOutline} className="btn btn-primary">
            Generate Outline
          </button>
        )}

        {/* Outlined, nothing started yet */}
        {!generating && !generatingOutline && novel.outline && chapsDone === 0 && displayStatus !== 'complete' && (
          <button onClick={() => startActGeneration(1)} className="btn btn-primary">
            Generate Act 1
          </button>
        )}

        {/* Download */}
        {isComplete && (
          <>
            <a href={`/api/export?id=${novel.id}`} download className="btn btn-primary">Download .docx</a>
            <button onClick={openInGoogleDocs} className="btn btn-secondary"
              title="Copies all text to clipboard and opens a new Google Doc — paste with Ctrl+V">
              Open in Google Docs
            </button>
          </>
        )}
        {chapsDone > 0 && !generating && !isComplete && (
          <a href={`/api/export?id=${novel.id}`} download className="btn btn-secondary">Download (partial)</a>
        )}

        {/* Edit outline */}
        {!generating && novel.outline && (isComplete || novel.status === 'error' || (novel.status === 'generating' && chapsDone > 0)) && (
          <button onClick={() => setShowOutlineEditor(v => !v)} className="btn btn-secondary">
            {showOutlineEditor ? 'Hide Outline' : 'Edit Outline'}
          </button>
        )}
      </div>

      {/* Generation Log */}
      {logs.length > 0 && (
        <div className="mb-5">
          <div className="section-label">Generation Log</div>
          <div className="log-container" ref={logRef}>
            {logs.map((entry, i) => (
              <div key={i} className={`log-line ${entry.step === 'error' ? 'error' : ''} ${entry.step === 'complete' ? 'complete' : ''}`}>
                <span className="time">{new Date(entry.timestamp).toLocaleTimeString()} </span>
                <span className="step">[{entry.step}] </span>
                <span className="detail">{entry.detail}</span>
                {entry.chapterWords && <span className="words"> [{entry.chapterWords.toLocaleString()} words]</span>}
                {entry.chapterCost && <span className="cost"> {entry.chapterCost}</span>}
                {entry.totalCost && entry.step === 'chapter_done' && <span className="cost"> (total: {entry.totalCost})</span>}
                {entry.cacheInfo && <span style={{ color: '#a78bfa' }}> {entry.cacheInfo}</span>}
                {entry.step === 'complete' && entry.totalWords && (
                  <span className="words"> [{entry.totalWords.toLocaleString()} total words, {entry.totalCost}]</span>
                )}
              </div>
            ))}
            {generating && (
              <div className="log-line"><span className="detail animate-pulse">...</span></div>
            )}
          </div>
        </div>
      )}

      {/* Editable Outline */}
      {(displayStatus === 'outlined' || showOutlineEditor) && editableChapters && !generating && (
        <div className="card mb-5">
          <div className="flex justify-between items-center mb-4">
            <div className="section-label" style={{ marginBottom: 0 }}>Edit Outline</div>
            <div className="flex gap-2">
              <button onClick={generateOutline} disabled={generatingOutline} className="btn btn-ghost btn-sm">
                {generatingOutline ? 'Regenerating...' : 'Regenerate Outline'}
              </button>
              <button onClick={saveOutline} disabled={savingOutline} className="btn btn-secondary btn-sm">
                {savingOutline ? 'Saving...' : 'Save Outline'}
              </button>
              {showOutlineEditor && (
                <button onClick={saveAndRegenerate} disabled={savingOutline} className="btn btn-primary btn-sm">
                  {savingOutline ? 'Saving...' : 'Save & Regenerate All'}
                </button>
              )}
            </div>
          </div>

          {/* Chapters grouped by act */}
          <div className="grid gap-4">
            {([1, 2, 3] as const).map(actNum => {
              const actChs = editableChapters.filter(ch => chapterAct(ch, editableChapters.length) === actNum);
              if (!actChs.length) return null;
              return (
                <div key={actNum}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-3 px-1" style={{ color: 'var(--text2)' }}>
                    Act {actNum} — {ACT_NAMES[actNum]}
                  </div>
                  <div className="grid gap-3">
                    {actChs.map(ch => {
                      const idx = editableChapters.findIndex(c => c.index === ch.index);
                      return (
                        <div key={ch.index} className="p-4 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text2)' }}>
                            Chapter {ch.index}
                          </div>
                          <div className="grid gap-3">
                            <div>
                              <label>Title</label>
                              <input value={ch.title} onChange={e => updateChapter(idx, { title: e.target.value })} />
                            </div>
                            <div>
                              <label>Summary</label>
                              <textarea rows={4} value={ch.summary} onChange={e => updateChapter(idx, { summary: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label>Word Target</label>
                                <input type="number" value={ch.wordTarget} onChange={e => updateChapter(idx, { wordTarget: +e.target.value })} />
                              </div>
                              <div className="flex items-center gap-2" style={{ marginTop: '1.5rem' }}>
                                <input
                                  type="checkbox"
                                  id={`intimate-${ch.index}`}
                                  checked={ch.hasIntimateScene}
                                  onChange={e => updateChapter(idx, { hasIntimateScene: e.target.checked })}
                                />
                                <label htmlFor={`intimate-${ch.index}`} style={{ marginBottom: 0 }}>Intimate scene</label>
                              </div>
                            </div>
                            {ch.hasIntimateScene && (
                              <div className="grid gap-3">
                                <div>
                                  <label>Scene Notes</label>
                                  <textarea rows={2} value={ch.intimateSceneNotes || ''}
                                    onChange={e => updateChapter(idx, { intimateSceneNotes: e.target.value })}
                                    placeholder="What happens emotionally and narratively..." />
                                </div>
                                <div>
                                  <label>Reference Scene <span className="text-xs font-normal" style={{ color: 'var(--text2)' }}>(optional)</span></label>
                                  <textarea rows={5} value={ch.referenceScene || ''}
                                    onChange={e => updateChapter(idx, { referenceScene: e.target.value })}
                                    placeholder="Paste a scene from your own work to adapt for these characters..." />
                                  <div className="hint">If provided, the scene generator adapts this as a draft rather than writing from scratch.</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={saveOutline} disabled={savingOutline} className="btn btn-secondary">
              {savingOutline ? 'Saving...' : 'Save Outline'}
            </button>
          </div>
        </div>
      )}

      {/* Single-chapter regeneration progress */}
      {regeneratingChapter !== null && (
        <div className="card mb-5">
          <p className="text-sm animate-pulse">Regenerating Chapter {regeneratingChapter}...</p>
        </div>
      )}

      {/* Chapter list (grouped by act) */}
      {outline && chapsDone > 0 && (
        <div className="card mb-5">
          <div className="section-label">Chapters</div>
          <div className="grid gap-4">
            {([1, 2, 3] as const).map(actNum => {
              const actChs = outline.chapters.filter(ch => chapterAct(ch, outline.chapters.length) === actNum);
              if (!actChs.length) return null;
              return (
                <div key={actNum}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--text2)' }}>
                    Act {actNum} — {ACT_NAMES[actNum]}
                  </div>
                  <div className="grid gap-2">
                    {actChs.map(ch => {
                      const written = novel.chapters.find(c => c.index === ch.index);
                      const justWritten = !written && logs.some(l => l.step === 'chapter_done' && l.currentChapter === ch.index);
                      const isDone = written || justWritten;
                      const isActive = activeChapter === ch.index;
                      const chWords = written?.wordCount || (justWritten
                        ? logs.find(l => l.step === 'chapter_done' && l.currentChapter === ch.index)?.chapterWords
                        : null);

                      return (
                        <div
                          key={ch.index}
                          onClick={() => written && setActiveChapter(isActive ? null : ch.index)}
                          className={`p-3 rounded-lg border text-sm transition-all ${written ? 'cursor-pointer hover:border-green-300' : ''} ${isActive ? 'ring-2' : ''}`}
                          style={{
                            borderColor: isDone ? '#bbf7d0' : 'var(--border)',
                            background: isDone ? '#f0fdf4' : 'var(--card)',
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">
                              <span style={{ color: 'var(--text2)' }}>Ch. {ch.index}</span>{' '}{ch.title}
                            </span>
                            <div className="flex gap-2 items-center">
                              {ch.hasIntimateScene && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fce7f3', color: '#be185d' }}>intimate</span>
                              )}
                              {chWords && <span className="text-xs" style={{ color: 'var(--green)' }}>{chWords.toLocaleString()} words</span>}
                              {!isDone && <span className="text-xs" style={{ color: 'var(--text2)' }}>~{ch.wordTarget.toLocaleString()}</span>}
                              {written && !generating && (
                                <button
                                  onClick={e => { e.stopPropagation(); regenerateSingleChapter(ch.index); }}
                                  disabled={regeneratingChapter !== null}
                                  title="Regenerate this chapter"
                                  className="text-xs px-2 py-0.5 rounded border transition-opacity"
                                  style={{ borderColor: 'var(--border)', color: 'var(--text2)', opacity: regeneratingChapter === ch.index ? 0.5 : 1 }}
                                >
                                  {regeneratingChapter === ch.index ? '...' : '↺'}
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                            {ch.summary.length > 180 ? ch.summary.slice(0, 180) + '...' : ch.summary}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chapter Reader */}
      {activeChapter && novel.chapters.find(c => c.index === activeChapter) && (() => {
        const ch = novel.chapters.find(c => c.index === activeChapter)!;
        return (
          <div className="card mb-5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Chapter {ch.index}</div>
                <h2 className="font-serif text-xl font-bold">{ch.title}</h2>
                <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{ch.wordCount.toLocaleString()} words</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActiveChapter(Math.max(1, activeChapter - 1))}
                  disabled={activeChapter <= 1} className="btn btn-ghost btn-sm">Prev</button>
                <button onClick={() => setActiveChapter(activeChapter + 1)}
                  disabled={!novel.chapters.find(c => c.index === activeChapter + 1)} className="btn btn-ghost btn-sm">Next</button>
                <button onClick={() => regenerateSingleChapter(activeChapter)}
                  disabled={regeneratingChapter !== null || generating} className="btn btn-ghost btn-sm">
                  {regeneratingChapter === activeChapter ? 'Regenerating...' : 'Regenerate'}
                </button>
                <button onClick={() => setActiveChapter(null)} className="btn btn-ghost btn-sm">Close</button>
              </div>
            </div>
            <div className="chapter-text" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {ch.content.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>
        );
      })()}

      {/* Error */}
      {novel.error && !generating && (
        <div className="card mb-5" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
          <div className="font-bold text-sm" style={{ color: 'var(--red)' }}>Error</div>
          <p className="text-sm mt-1" style={{ color: '#991b1b' }}>{novel.error}</p>
        </div>
      )}
    </div>
  );
}
