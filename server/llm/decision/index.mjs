import {
  defaultReasonForTool,
  getToolDefinitions,
  toolNameSchema,
} from '../../workflow/decision-tools.mjs';

export async function decideNextStep(run, observation, modelOptions) {
  const { apiKey, baseURL, customHeaders, model } = modelOptions;
  const decisionStartedAt = Date.now();
  const emitModelEvent = event => {
    modelOptions?.onModelEvent?.(event);
  };

  if (!apiKey) {
    throw new Error(
      '缺少 ANTHROPIC_API_KEY，请先在 .env.local 中配置后再启动 dev:api。',
    );
  }

  const systemPrompt = `你是一个天气出行助手。你要在多轮循环中决定下一步是调用工具，还是直接给用户最终回答。

规则：
- 优先依据当前 state 和 observation 决策，不要臆造尚未获取的数据。
- 日期字段 date 一律使用 state.date（格式 YYYY-MM-DD）的绝对日期表达；不要把它改写成“今天/明天/后天/周末”等相对日期。
- 当天气信息不存在时，优先调用 get_weather。
- 当天气已存在但 outingPlan 不存在时，通常调用 plan_outing。
- 当 weather 和 outingPlan 都已经具备时，直接给出最终回答，不要再调用工具。
- 如果上一轮工具失败，要结合错误原因修正策略，不要盲目重复同一个错误调用。
- 如果某个工具连续失败或当前错误说明该工具暂时不可用，可以停止继续重试，直接给用户一个基于现有信息的 best-effort 回答。
- 如果调用工具，请在 assistant content 里用一句简短中文说明原因，同时返回 tool call。
- 如果直接回答，请给出面向用户的最终自然语言答复。
- 输出保持简洁、准确。`;

  const userMessage = `用户原始任务：
${run.task}

当前 observation：
${JSON.stringify(observation, null, 2)}

当前 state：
${JSON.stringify(run.state, null, 2)}

请决定下一步。`;

  emitModelEvent({
    status: 'start',
    title: '发起 LLM 决策请求',
    summary: '天气出行助手正在决定下一步动作。',
    detail: {
      source: 'decideNextStep',
      model,
      baseURL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools: getToolDefinitions(),
      toolChoice: 'auto',
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
      temperature: 0.1,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools: getToolDefinitions(),
      tool_choice: 'auto',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    emitModelEvent({
      status: 'failed',
      title: 'LLM 决策请求失败',
      summary: `HTTP ${response.status}`,
      detail: {
        latencyMs: Date.now() - decisionStartedAt,
        source: 'decideNextStep',
        status: response.status,
        errorText,
      },
    });
    throw new Error(`LLM 请求失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const content =
    typeof message?.content === 'string' ? message.content.trim() : '';
  const toolCall = message?.tool_calls?.[0];

  if (toolCall?.function?.name) {
    const toolName = toolNameSchema.parse(toolCall.function.name);
    const rawArguments = toolCall.function.arguments ?? '{}';
    const parsedArguments = rawArguments ? JSON.parse(rawArguments) : {};
    emitModelEvent({
      status: 'success',
      title: 'LLM 返回工具调用',
      summary: toolName,
      detail: {
        latencyMs: Date.now() - decisionStartedAt,
        source: 'decideNextStep',
        content,
        toolCall: {
          name: toolName,
          arguments: parsedArguments,
        },
        rawMessage: message,
      },
    });

    return {
      type: 'call_tool',
      reason: content || defaultReasonForTool(toolName),
      toolCall: {
        name: toolName,
        arguments: parsedArguments,
      },
    };
  }

  if (content) {
    emitModelEvent({
      status: 'success',
      title: 'LLM 返回自然语言答复',
      summary: content,
      detail: {
        latencyMs: Date.now() - decisionStartedAt,
        source: 'decideNextStep',
        content,
        rawMessage: message,
      },
    });
    return {
      type: 'respond',
      reason: '模型判断信息已经足够，可以直接回复用户。',
      responseDraft: content,
    };
  }

  throw new Error('模型既没有返回工具调用，也没有返回最终回答。');
}
