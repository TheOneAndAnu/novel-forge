export type NsfwIntensity = 'mild' | 'steamy' | 'explicit';

export interface NovelInputs {
  title: string;
  genre: string;
  trope: string;
  setting: string;
  timePeriod: string;
  heroName: string;
  heroArchetype: string;
  heroDescription: string;
  heroineName: string;
  heroineArchetype: string;
  heroineDescription: string;
  coreConflict: string;
  plotSummary: string;
  hasIntimateScenes?: boolean;
  nsfwIntensity: NsfwIntensity;
  minIntimateScenes: number;
  referenceScenes: string[];
  targetWords: number;
  chapterCount: number;
  stylePreset: string;
  notes?: string;
  writingStyle?: string;
}

export interface ChapterOutline {
  index: number;
  title: string;
  summary: string;
  wordTarget: number;
  hasIntimateScene: boolean;
  intimateSceneNotes?: string;
  referenceScene?: string;
}

export interface Outline {
  title: string;
  tagline: string;
  chapters: ChapterOutline[];
}

export interface Chapter {
  index: number;
  title: string;
  content: string;
  wordCount: number;
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Novel {
  id: string;
  inputs: NovelInputs;
  outline: Outline | null;
  chapters: Chapter[];
  status: 'draft' | 'outlined' | 'generating' | 'complete' | 'error';
  wordCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  storyBible?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}
