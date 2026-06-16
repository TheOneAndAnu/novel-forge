# Novel Forge

AI-powered novel generation app. Creates complete 30-60k word novels locally on your machine.

## Setup (5 minutes)

### Prerequisites
- Node.js 18+ installed ([download](https://nodejs.org))
- An Anthropic API key ([get one](https://console.anthropic.com/))

### Steps

1. **Unzip** this folder and open it in VS Code

2. **Add your API key** — open `.env.local` and replace `sk-ant-xxxxx` with your real key

3. **Install dependencies:**
   ```
   npm install
   ```

4. **Start the app:**
   ```
   npm run dev
   ```

5. **Open** http://localhost:3000

## How It Works

1. Click **+ New Novel**
2. Fill in the form: title, genre, trope, characters, plot summary, reference intimate scenes
3. Click **Create Novel**
4. On the novel page, click **Generate Novel**
5. Watch the live log as it:
   - Generates a chapter-by-chapter outline (Haiku, fast and cheap)
   - Writes each chapter sequentially (Sonnet, high quality)
   - Generates continuity summaries after each chapter (Haiku)
6. When complete, click **Download .docx**

## Cost

- Outline generation: ~$0.01 (Haiku)
- Each chapter: ~$0.05-0.08 (Sonnet for writing, Haiku for summary)
- A 25-chapter, 45k word novel: roughly **$1.50-2.00**

Prompt caching kicks in from chapter 2 onward — the "novel bible" (character sheets, outline, plot) is cached across calls, saving ~90% on repeated input tokens.

## Features

- **One-click generation** — outline and all chapters generated automatically
- **Live progress log** — see exactly what's happening in real time
- **Crash-safe** — saves after every chapter, can resume if interrupted
- **Reference scenes** — paste 3-5 intimate scene excerpts to match tone
- **Anti-AI-slop prompts** — extensive banned patterns list (no em dashes, no "something shifted", no purple prose)
- **Export as .docx** — download the finished novel as a Word document
- **Cost tracking** — see exactly what each novel costs

## Model Usage

| Task | Model | Why |
|------|-------|-----|
| Outline | Haiku 4.5 | Cheap, structured output |
| Chapters | Sonnet 4.6 | Quality prose, continuity |
| Summaries | Haiku 4.5 | Simple compression |

## File Structure

```
novel-forge/
├── .env.local          ← YOUR API KEY GOES HERE
├── app/
│   ├── page.tsx        ← Dashboard
│   ├── new/page.tsx    ← Novel creation form
│   ├── novel/[id]/     ← Novel view + generation
│   └── api/
│       ├── novels/     ← CRUD endpoints
│       ├── generate/   ← SSE generation endpoint
│       └── export/     ← .docx export
├── lib/
│   ├── types.ts
│   ├── storage.ts      ← Local JSON file storage
│   ├── prompts/        ← All prompt engineering
│   └── utils/          ← Cost calculation
└── .data/              ← Auto-created, stores your novels
```

## Tips

- **Plot summary is the most important field.** 300-500 words of specific plot details produces dramatically better output than vague descriptions.
- **Reference scenes matter.** Paste 3-4 excerpts from books whose intimate scene style you want to match.
- **You can stop and resume.** Hit "Stop Generation" anytime. Chapters are saved individually. Click "Resume" to continue from where you left off.
- **Character descriptions should be specific.** Not "he's tall and dark" but "6'2, lean, sharp jawline, speaks slowly and rarely smiles, grew up in poverty in South Mumbai."
