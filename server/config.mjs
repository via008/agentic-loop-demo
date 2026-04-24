export const port = Number(process.env.AGENT_LOOP_PORT ?? 3001);
export const model = process.env.ANTHROPIC_MODEL;
export const apiKey = process.env.ANTHROPIC_API_KEY;
export const baseURL =
  process.env.ANTHROPIC_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3';
export const customHeaders = process.env.ANTHROPIC_CUSTOM_HEADERS
  ? Object.fromEntries(
      process.env.ANTHROPIC_CUSTOM_HEADERS.split(',')
        .map(item => item.split(':').map(part => part.trim()))
        .filter(parts => parts.length === 2),
    )
  : {};

export function getModelOptions() {
  return {
    apiKey,
    baseURL,
    customHeaders,
    model,
  };
}
