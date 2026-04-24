function buildBestEffortAnswer(state) {
  const city = state.city ?? '目的地';
  const date = state.date ?? '目标日期';

  if (state.weather && !state.outingPlan) {
    const w = state.weather;
    return [
      `我已经拿到 ${city}（${date}）的天气：${w.condition}，${w.temperatureMinC}-${w.temperatureMaxC}℃，降雨概率 ${w.rainProbability}%，风力 ${w.windLevel}。`,
      '出行建议生成工具暂时不可用，我先给你一个 best-effort 建议：',
      w.rainProbability >= 50
        ? '建议带伞或雨衣，尽量避开长时间户外停留。'
        : '降雨概率不高，散步问题不大，但仍建议备一把轻便伞以防万一。',
      w.temperatureMaxC >= 28
        ? '气温偏高，注意补水、防晒，避开正午暴晒。'
        : '气温适中，注意按体感增减衣物。',
      '如果你愿意，可以稍后重试一次，我也可以再生成更完整的结构化出行建议。',
    ].join('\n');
  }

  if (state.weather && state.outingPlan) {
    // 正常情况下应通过 respond 收敛，但这里保留一个确定性的兜底输出。
    return [
      `目的地：${city}（${date}）`,
      `天气：${state.weather.condition}，${state.weather.temperatureMinC}-${state.weather.temperatureMaxC}℃，降雨概率 ${state.weather.rainProbability}%`,
      `建议：${state.outingPlan.summary}`,
    ].join('\n');
  }

  return [
    '部分工具暂时不可用，我还无法拿到完整信息。',
    '建议你稍后重试，或告诉我你更关心的点（是否下雨/温度/风），我会在现有信息下给出 best-effort 建议。',
  ].join('\n');
}

function countFailedToolAttempts(run, toolName) {
  return run.steps.filter(
    step =>
      step.finalAction?.type === 'call_tool' &&
      step.finalAction.toolCall?.name === toolName &&
      step.execution?.status === 'failed',
  ).length;
}

export async function reviewLoop({
  run,
  action,
  execution,
  stateBefore,
  stateAfter,
  progressDelta,
}) {
  // 如果已经完成，则直接收敛。
  if (stateAfter.isComplete || stateAfter.finalAnswer) {
    return {
      verdict: 'finalize',
      reason: '已生成最终回答。',
      finalAnswerDraft: stateAfter.finalAnswer ?? null,
      newPlan: null,
    };
  }

  // 若数据已齐备，则用确定性逻辑收敛（避免额外模型调用）。
  if (stateAfter.weather && stateAfter.outingPlan) {
    return {
      verdict: 'finalize',
      reason: '天气与出行建议已具备，整理最终答复。',
      finalAnswerDraft: buildBestEffortAnswer(stateAfter),
      newPlan: null,
    };
  }

  // 工具卡死检测：如果工具持续失败，则降级为 best-effort 回答。
  const currentFailedToolName =
    action?.type === 'call_tool' && execution?.status === 'failed'
      ? action.toolCall?.name
      : null;

  const currentWeatherFail = currentFailedToolName === 'get_weather' ? 1 : 0;
  const currentOutingFail = currentFailedToolName === 'plan_outing' ? 1 : 0;

  const weatherFailedTimes =
    countFailedToolAttempts(run, 'get_weather') + currentWeatherFail;
  const outingFailedTimes =
    countFailedToolAttempts(run, 'plan_outing') + currentOutingFail;
  const maxFailed = Math.max(weatherFailedTimes, outingFailedTimes);

  if (maxFailed >= 3) {
    return {
      verdict: 'finalize',
      reason: '工具连续失败次数过多，输出 best-effort 回答。',
      finalAnswerDraft: buildBestEffortAnswer(stateAfter),
      newPlan: null,
    };
  }

  // 停滞检测：如果多轮没有进展，则触发重规划。
  if (progressDelta === 0 && (stateAfter.stagnationCount ?? 0) >= 2) {
    return {
      verdict: 'replan',
      reason: '连续多轮无明显进展，触发重新规划。',
      newPlan: [
        '重新确认目标与地点',
        '尝试获取天气',
        '生成出行建议',
        '整理最终回复',
      ],
      finalAnswerDraft: null,
    };
  }

  return {
    verdict: 'continue',
    reason: '继续推进任务。',
    newPlan: null,
    finalAnswerDraft: null,
  };
}
