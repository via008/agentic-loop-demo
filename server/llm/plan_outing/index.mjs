import { z } from 'zod';

const outingToolSchema = z.object({
  city: z.string(),
});

const outingPlanSchema = z.object({
  recommendedTime: z.enum(['morning', 'afternoon']),
  bringUmbrella: z.boolean(),
  clothingAdvice: z.string(),
  summary: z.string(),
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

export async function generateOutingPlan(input, weather, state, options) {
  const { city } = outingToolSchema.parse(input);
  const { apiKey, baseURL, customHeaders, model } = options;
  const startedAt = Date.now();

  if (!apiKey) {
    throw new Error('缺少 ANTHROPIC_API_KEY，无法让模型生成出行建议。');
  }

  const systemPrompt = `你是一个出行规划助手。请根据给定的城市、天气和用户目标，生成结构化的中文出行建议。

输出要求：
- 只返回纯 JSON，不要带 markdown 代码块。
- 字段必须严格包含：
  - recommendedTime: "morning" 或 "afternoon"
  - bringUmbrella: boolean
  - clothingAdvice: string
  - summary: string
- clothingAdvice 和 summary 用简洁自然的中文。
- 不要输出额外字段。`;

  const userMessage = `用户目标：
${state.userGoal}

城市：
${city}

天气：
${JSON.stringify(weather, null, 2)}

请生成结构化出行建议。`;

  emitModelEvent(options, {
    status: 'start',
    title: '发起 LLM 出行建议请求',
    summary: city,
    detail: {
      source: 'generateOutingPlan',
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
      temperature: 0.3,
      max_tokens: 1024,
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
      title: 'LLM 出行建议请求失败',
      summary: `HTTP ${response.status}`,
      detail: {
        latencyMs: Date.now() - startedAt,
        source: 'generateOutingPlan',
        status: response.status,
        errorText,
      },
    });
    throw new Error(`生成出行建议失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';

  if (!text) {
    throw new Error('模型没有返回出行建议内容。');
  }

  const parsed = JSON.parse(stripMarkdownCodeFence(text));
  const validated = outingPlanSchema.parse(parsed);
  emitModelEvent(options, {
    status: 'success',
    title: 'LLM 生成出行建议成功',
    summary: validated.summary,
    detail: {
      latencyMs: Date.now() - startedAt,
      source: 'generateOutingPlan',
      rawText: text,
      parsed: validated,
    },
  });
  return validated;
}
