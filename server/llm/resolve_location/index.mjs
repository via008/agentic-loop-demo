import { z } from 'zod';

const locationSchema = z.object({
  name: z.string().trim().min(1),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().trim().min(1),
});

function stripMarkdownCodeFence(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function emitModelEvent(options, event) {
  options?.onModelEvent?.(event);
}

export async function resolveLocation(city, options) {
  const normalizedCity = city.trim();
  const { apiKey, baseURL, customHeaders, model } = options;
  const startedAt = Date.now();

  if (!apiKey) {
    throw new Error('缺少 ANTHROPIC_API_KEY，无法解析精确地点。');
  }

  const systemPrompt = `你是一个地点解析助手。请把中文地点解析为可用于天气查询的结构化坐标信息。

输出要求：
- 只返回纯 JSON，不要带 markdown 代码块。
- 必须包含字段：name、latitude、longitude、timezone。
- name 使用更精确的中文地点名称，例如“重庆市涪陵区”。
- latitude 和 longitude 使用十进制度数。
- timezone 对中国地点统一返回 Asia/Shanghai。
- 不要输出额外字段。`;

  const userMessage = `请解析这个地点，并返回精确的结构化位置信息：

${normalizedCity}`;

  emitModelEvent(options, {
    status: 'start',
    title: '发起 LLM 地点解析请求',
    summary: normalizedCity,
    detail: {
      source: 'resolveLocation',
      model,
      baseURL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    },
  });

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...customHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    emitModelEvent(options, {
      status: 'failed',
      title: 'LLM 地点解析失败',
      summary: `HTTP ${response.status}`,
      detail: {
        latencyMs: Date.now() - startedAt,
        source: 'resolveLocation',
        status: response.status,
        errorText,
      },
    });
    throw new Error(`地点解析失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';

  if (!text) {
    throw new Error('模型没有返回地点解析结果。');
  }

  const parsed = locationSchema.parse(JSON.parse(stripMarkdownCodeFence(text)));
  emitModelEvent(options, {
    status: 'success',
    title: 'LLM 完成地点解析',
    summary: parsed.name,
    detail: {
      latencyMs: Date.now() - startedAt,
      source: 'resolveLocation',
      rawText: text,
      parsed,
    },
  });

  return parsed;
}
