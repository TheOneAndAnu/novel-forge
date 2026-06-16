// Haiku input: $1/M, output: $5/M
// Sonnet input: $3/M, output: $15/M
export function calcCost(inputTokens: number, outputTokens: number, model: 'haiku' | 'sonnet') {
  if (model === 'haiku') {
    return (inputTokens * 1 + outputTokens * 5) / 1_000_000;
  }
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}
