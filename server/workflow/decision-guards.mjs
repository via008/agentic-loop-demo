function countFailedToolAttempts(run, toolName) {
  return run.steps.filter(
    step =>
      step.decision?.type === 'call_tool' &&
      step.decision.toolCall?.name === toolName &&
      step.execution?.status === 'failed',
  ).length;
}

export function applyDecisionGuards(run, decision) {
  if (decision.type !== 'respond') {
    return decision;
  }

  const needsWeather = !run.state.weather;
  const needsOutingPlan = Boolean(run.state.weather) && !run.state.outingPlan;

  if (needsWeather) {
    const weatherFailedTimes = countFailedToolAttempts(run, 'get_weather');

    if (weatherFailedTimes < 2) {
      return {
        type: 'call_tool',
        reason: '当前还缺少天气数据，先继续重试天气工具再决定是否结束。',
        toolCall: {
          name: 'get_weather',
          arguments: {
            city: run.state.city,
            date: run.state.date,
          },
        },
      };
    }
  }

  if (needsOutingPlan) {
    const outingFailedTimes = countFailedToolAttempts(run, 'plan_outing');

    if (outingFailedTimes < 2) {
      return {
        type: 'call_tool',
        reason: '当前还没有出行建议，先重试 plan_outing 再决定是否结束。',
        toolCall: {
          name: 'plan_outing',
          arguments: {
            city: run.state.city,
          },
        },
      };
    }
  }

  return decision;
}
