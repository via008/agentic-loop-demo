import { z } from 'zod';

const parsedTaskSchema = z.object({
  city: z.string().trim().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function stripMarkdownCodeFence(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function getTodayInChina() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function looksLikeSubregion(value) {
  return /(?:区|县|旗|镇|乡|街道|新区|开发区|自治县|自治州)$/.test(
    value.trim(),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeParsedTask(task, parsed) {
  const city = parsed.city?.trim();

  if (!city) {
    return parsed;
  }

  if (looksLikeSubregion(city)) {
    return parsed;
  }

  const compactTask = task.replace(/\s+/g, '');
  const compactCity = city.replace(/\s+/g, '');
  const cityPattern = escapeRegExp(compactCity);
  const specificLocationMatch = compactTask.match(
    new RegExp(
      `${cityPattern}(?:市)?[\\u4e00-\\u9fa5]{0,8}(?:区|县|旗|镇|乡|街道|新区|开发区|自治县|自治州)`,
    ),
  );

  if (specificLocationMatch?.[0]) {
    return {
      ...parsed,
      city: specificLocationMatch[0],
    };
  }

  return parsed;
}

function emitModelEvent(options, event) {
  options?.onModelEvent?.(event);
}

// 解析用户任务中的地点与日期
export async function parseTask(task, options) {
  const { apiKey, baseURL, customHeaders, model } = options;
  const startedAt = Date.now();

  if (!apiKey) {
    throw new Error(
      '缺少 ANTHROPIC_API_KEY，请先在 .env.local 中配置后再启动 dev:api。',
    );
  }

  const today = getTodayInChina();

  const systemPrompt = `你是一个任务信息抽取助手。请从用户的中文出行任务中抽取结构化字段。

今天的中国日期是：${today}

输出要求：
- 只返回纯 JSON，不要带 markdown 代码块。
- 只包含以下字段：city、date。
- city 表示天气查询地点，必须尽量保留到可用于查天气的最细粒度地点，例如“重庆涪陵区”“杭州西湖区”，不要只保留上级城市。
- 如果用户说的是“重庆涪陵区”“杭州余杭区”这类包含区县的地点，city 必须保留完整地点，不要截断成“重庆”“杭州”。
- date 必须转换成准确的公历日期，格式固定为 YYYY-MM-DD。
- 对今天、明天、后天、周末、本周六、本周日、下周几、几月几日等表达，都要换算成准确日期。
- 不要返回“今天”“明天”这类相对表达。
- 如果某个字段无法明确判断，可以省略该字段，不要编造。`;

  const userMessage = `请从下面这句用户任务中抽取信息：

${task}`;

  emitModelEvent(options, {
    status: 'start',
    title: '发起 LLM 任务抽取请求',
    summary: '解析用户任务中的地点与日期。',
    detail: {
      source: 'parseTask',
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
      title: 'LLM 任务抽取失败',
      summary: `HTTP ${response.status}`,
      detail: {
        latencyMs: Date.now() - startedAt,
        source: 'parseTask',
        status: response.status,
        errorText,
      },
    });
    throw new Error(`任务抽取失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';

  if (!text) {
    throw new Error('模型没有返回任务抽取结果。');
  }

  const parsed = parsedTaskSchema.parse(
    JSON.parse(stripMarkdownCodeFence(text)),
  );

  const normalized = normalizeParsedTask(task, parsed);

  emitModelEvent(options, {
    status: 'success',
    title: 'LLM 完成任务抽取',
    summary: `city=${normalized.city ?? '空'}; date=${normalized.date ?? '空'}`,
    detail: {
      latencyMs: Date.now() - startedAt,
      source: 'parseTask',
      rawText: text,
      parsed,
      normalized,
    },
  });

  return {
    city: normalized.city,
    date: normalized.date,
  };
}
