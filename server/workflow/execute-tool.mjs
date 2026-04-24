import { generateOutingPlan } from '../llm/plan_outing/index.mjs';
import { getWeather } from '../tool/get_weather/index.mjs';
import { getWeather1 } from '../tool/get_weather1/index.mjs';
import { classifyExecutionError } from './error-taxonomy.mjs';

export async function executeTool(toolCall, state, modelOptions) {
  const startedAt = Date.now();
  const { apiKey, baseURL, customHeaders, model, onModelEvent } = modelOptions;

  try {
    let output;

    if (toolCall.name === 'get_weather1') {
      output = await getWeather1(toolCall.arguments, {
        apiKey,
        baseURL,
        customHeaders,
        model,
        onModelEvent,
      });
    } else if (toolCall.name === 'get_weather') {
      output = await getWeather(toolCall.arguments, {
        apiKey,
        baseURL,
        customHeaders,
        model,
        onModelEvent,
      });
    } else if (toolCall.name === 'plan_outing') {
      if (!state.weather) {
        throw new Error('当前还没有天气信息，无法执行 plan_outing。');
      }

      output = await generateOutingPlan(
        toolCall.arguments,
        state.weather,
        state,
        {
          apiKey,
          baseURL,
          customHeaders,
          model,
          onModelEvent,
        },
      );
    } else {
      throw new Error(`未知工具：${toolCall.name}`);
    }

    return {
      status: 'success',
      output,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classified = classifyExecutionError(toolCall?.name, message);

    return {
      status: 'failed',
      error: message,
      errorCode: classified.errorCode,
      retryable: classified.retryable,
      category: classified.category,
      latencyMs: Date.now() - startedAt,
    };
  }
}
