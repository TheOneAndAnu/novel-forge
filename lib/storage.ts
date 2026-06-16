import { Novel } from './types';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';

// ─── Filesystem (local dev) ───────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), '.data');
const NOVELS_FILE = path.join(DATA_DIR, 'novels.json');

function fsEnsure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(NOVELS_FILE)) fs.writeFileSync(NOVELS_FILE, '[]');
}

function fsAll(): Novel[] {
  fsEnsure();
  return JSON.parse(fs.readFileSync(NOVELS_FILE, 'utf-8'));
}

function fsSaveAll(novels: Novel[]) {
  fsEnsure();
  fs.writeFileSync(NOVELS_FILE, JSON.stringify(novels, null, 2));
}

// ─── Vercel Blob (production) ─────────────────────────────────────────────────

async function blobAll(): Promise<Novel[]> {
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: 'novels/' });
  if (!blobs.length) return [];
  const novels = await Promise.all(
    blobs.map(async (b) => {
      const res = await fetch(b.url, { cache: 'no-store' });
      return res.json() as Promise<Novel>;
    }),
  );
  return novels.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function blobGet(id: string): Promise<Novel | null> {
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: `novels/${id}.json` });
  if (!blobs.length) return null;
  const res = await fetch(blobs[0].url, { cache: 'no-store' });
  return res.json();
}

async function blobPut(novel: Novel) {
  const { put } = await import('@vercel/blob');
  await put(`novels/${novel.id}.json`, JSON.stringify(novel), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

async function blobDel(id: string) {
  const { list, del } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: `novels/${id}.json` });
  if (blobs.length) await del(blobs[0].url);
}

// ─── Backend selection ────────────────────────────────────────────────────────

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getAllNovels(): Promise<Novel[]> {
  if (useBlob) return blobAll();
  return fsAll();
}

export async function getNovel(id: string): Promise<Novel | null> {
  if (useBlob) return blobGet(id);
  return fsAll().find((n) => n.id === id) ?? null;
}

export async function createNovel(inputs: Novel['inputs']): Promise<Novel> {
  const novel: Novel = {
    id: uuid(),
    inputs,
    outline: null,
    chapters: [],
    status: 'draft',
    wordCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCost: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (useBlob) {
    await blobPut(novel);
  } else {
    const novels = fsAll();
    novels.push(novel);
    fsSaveAll(novels);
  }
  return novel;
}

export async function updateNovel(id: string, updates: Partial<Novel>): Promise<Novel | null> {
  const existing = await getNovel(id);
  if (!existing) return null;
  const updated: Novel = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  if (useBlob) {
    await blobPut(updated);
  } else {
    const novels = fsAll();
    const idx = novels.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    novels[idx] = updated;
    fsSaveAll(novels);
  }
  return updated;
}

export async function deleteNovel(id: string): Promise<boolean> {
  if (useBlob) {
    await blobDel(id);
    return true;
  }
  const novels = fsAll();
  const filtered = novels.filter((n) => n.id !== id);
  if (filtered.length === novels.length) return false;
  fsSaveAll(filtered);
  return true;
}
