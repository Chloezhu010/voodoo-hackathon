import { COLOR_IDS } from '../config/colors.js';
import type { EditorValidationStatus } from '../sim/editorState.js';
import type { ColorId, LevelData } from '../sim/types.js';

declare global {
  interface ImportMeta {
    readonly env?: Record<string, string | undefined>;
  }
}

export const GEMINI_BRIEF_MODEL = 'gemini-3-flash-preview';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_BRIEF_MODEL}:streamGenerateContent?alt=sse`;
const GEMINI_KEY_STORAGE = 'gemini_api_key';

export interface GeminiBriefReport {
  verdict: 'ship' | 'iterate' | 'cut';
  progressionPlacement: 'early' | 'middle' | 'late' | 'cut';
  difficultyScore: number;
  confidence: number;
  teamSummary: string;
  roleReviews: GeminiRoleReview[];
  likelyStuckPoints: string[];
  solvability: {
    status: 'likely_solvable' | 'risky' | 'invalid';
    reason: string;
  };
  recommendedChanges: GeminiRecommendation[];
}

export interface GeminiRoleReview {
  role: 'level_designer' | 'gameplay_tester' | 'product_manager' | 'balancing_critic' | 'iteration_partner';
  finding: string;
  severity: 'low' | 'medium' | 'high';
}

export interface GeminiRecommendation {
  priority: 'must' | 'should' | 'could';
  change: string;
  reason: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface StreamOptions {
  onDelta?: (text: string) => void;
}

export function getGeminiApiKey(): string | null {
  const envKey = import.meta.env?.VITE_GEMINI_API_KEY?.trim();
  const storedKey = globalThis.localStorage?.getItem(GEMINI_KEY_STORAGE)?.trim();
  return envKey || storedKey || null;
}

export function storeGeminiApiKey(apiKey: string): void {
  globalThis.localStorage?.setItem(GEMINI_KEY_STORAGE, apiKey.trim());
}

export async function analyzeLevelWithGemini(
  levelData: LevelData,
  validation: EditorValidationStatus,
  localBrief: string,
  apiKey: string,
  options: StreamOptions = {},
): Promise<GeminiBriefReport> {
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(levelData, validation, localBrief) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: GEMINI_BRIEF_SCHEMA,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));

  const text = await readGeminiStream(response, options.onDelta);
  if (!text.trim()) throw new Error('Gemini returned an empty response.');
  return JSON.parse(text) as GeminiBriefReport;
}

function buildPrompt(levelData: LevelData, validation: EditorValidationStatus, localBrief: string): string {
  return [
    'You are an embedded game-team workflow inside a mobile marble-sort level editor.',
    'Analyze only the provided level data. Do not invent mechanics that are not present.',
    'Write every human-readable field in concise English.',
    'Stream the final answer as JSON that exactly follows the response schema.',
    'Use these role lenses: level designer, gameplay tester, product manager, balancing critic, iteration partner.',
    'Rules: each block contains 9 marbles of its color; each box holds 3 marbles; box columns list boxes top-to-bottom.',
    'Coordinates are zero-based. If multiple blocks share a cell, higher z is on top. Hidden blocks conceal color until revealed.',
    'Answer whether the level seems solvable, where players may get stuck, whether difficulty is fair, whether there is a reveal or payoff, whether mechanics are readable, and whether the level belongs early, middle, late, or should be cut.',
    '',
    `Local editor brief: ${localBrief}`,
    `Derived stats: ${JSON.stringify(deriveLevelStats(levelData, validation), null, 2)}`,
    `Canonical level JSON: ${JSON.stringify(levelData, null, 2)}`,
  ].join('\n');
}

async function readGeminiStream(response: Response, onDelta?: (text: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Gemini response stream is unavailable.');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.remainder;
    parsed.events.forEach((event) => {
      const delta = extractTextDelta(event);
      if (!delta) return;
      fullText += delta;
      onDelta?.(fullText);
    });
  }

  buffer += decoder.decode();
  parseSseBuffer(buffer).events.forEach((event) => {
    const delta = extractTextDelta(event);
    if (!delta) return;
    fullText += delta;
    onDelta?.(fullText);
  });
  return fullText;
}

function parseSseBuffer(buffer: string): { events: string[]; remainder: string } {
  const chunks = buffer.split(/\r?\n\r?\n/);
  const remainder = chunks.pop() ?? '';
  const events = chunks
    .map((chunk) => chunk.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n'))
    .filter(Boolean);
  return { events, remainder };
}

function extractTextDelta(eventData: string): string {
  const payload = JSON.parse(eventData) as GeminiResponse;
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') ?? '';
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as GeminiResponse;
    return payload.error?.message || `Gemini request failed: ${response.status}`;
  } catch {
    return `Gemini request failed: ${response.status}`;
  }
}

function deriveLevelStats(levelData: LevelData, validation: EditorValidationStatus): object {
  const blockCounts = makeColorCounts();
  const boxSlots = makeColorCounts();
  const stacks = new Map<string, number>();

  levelData.blocks.forEach((block) => {
    blockCounts[block.color] += 1;
    const key = `${block.col}:${block.row}`;
    stacks.set(key, (stacks.get(key) ?? 0) + 1);
  });
  levelData.box_columns.forEach((column) => {
    column.boxes.forEach((color) => {
      boxSlots[color] += 3;
    });
  });

  return {
    boardSize: levelData.board_size,
    blockCount: levelData.blocks.length,
    occupiedCells: stacks.size,
    maxStackHeight: Math.max(0, ...stacks.values()),
    hiddenBlocks: levelData.blocks.filter((block) => block.is_hidden).length,
    blockCounts,
    marbleCounts: multiplyCounts(blockCounts, 9),
    boxSlots,
    validation,
    mechanics: {
      conveyorSpeed: levelData.conveyor_speed ?? 0.18,
      gravityFlipEnabled: Boolean(levelData.gravity_flip_enabled),
      magnetCount: levelData.magnet_count ?? 0,
    },
  };
}

function makeColorCounts(): Record<ColorId, number> {
  return Object.fromEntries(COLOR_IDS.map((color) => [color, 0])) as Record<ColorId, number>;
}

function multiplyCounts(counts: Record<ColorId, number>, multiplier: number): Record<ColorId, number> {
  return Object.fromEntries(COLOR_IDS.map((color) => [color, counts[color] * multiplier])) as Record<ColorId, number>;
}

const ROLE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    role: {
      type: 'string',
      enum: ['level_designer', 'gameplay_tester', 'product_manager', 'balancing_critic', 'iteration_partner'],
    },
    finding: { type: 'string', description: 'One concise role-specific finding.' },
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['role', 'finding', 'severity'],
} as const;

const GEMINI_BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ship', 'iterate', 'cut'] },
    progressionPlacement: { type: 'string', enum: ['early', 'middle', 'late', 'cut'] },
    difficultyScore: { type: 'integer', minimum: 1, maximum: 10 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    teamSummary: { type: 'string', description: 'Two-sentence cross-functional summary.' },
    roleReviews: { type: 'array', items: ROLE_REVIEW_SCHEMA, minItems: 5, maxItems: 5 },
    likelyStuckPoints: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    solvability: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['likely_solvable', 'risky', 'invalid'] },
        reason: { type: 'string' },
      },
      required: ['status', 'reason'],
    },
    recommendedChanges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['must', 'should', 'could'] },
          change: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['priority', 'change', 'reason'],
      },
      maxItems: 3,
    },
  },
  required: [
    'verdict',
    'progressionPlacement',
    'difficultyScore',
    'confidence',
    'teamSummary',
    'roleReviews',
    'likelyStuckPoints',
    'solvability',
    'recommendedChanges',
  ],
  additionalProperties: false,
} as const;
