const RETRY_COUNT_LIMIT = 3;

function canRetryInStep(execution, repairCount) {
  if (!execution || execution.status !== 'failed') {
    return false;
  }

  // 默认只允许对“可重试”的失败在 step 内重试有限次数。
  return Boolean(execution.retryable) && repairCount < RETRY_COUNT_LIMIT;
}

export async function reviewStep({
  run,
  observation,
  proposal,
  lastExecution,
  repairCount,
}) {
  // 预检：对明显的前置条件违背做确定性的修复。
  if (proposal?.type === 'call_tool') {
    if (proposal.toolCall?.name === 'plan_outing' && !run.state.weather) {
      return {
        verdict: 'repair',
        reason: 'plan_outing 缺少天气前置条件，改为先获取天气。',
        repairedAction: {
          type: 'call_tool',
          reason: '先补齐天气信息再生成出行建议。',
          toolCall: {
            name: 'get_weather',
            arguments: {
              city: run.state.city,
              date: run.state.date,
            },
          },
        },
      };
    }
  }

  // 后检：如果上一次执行是临时/可重试错误，则在同一个 step 内重试一次，
  // 避免消耗外层 loop 的一次机会。
  if (canRetryInStep(lastExecution, repairCount)) {
    return {
      verdict: 'repair',
      reason: '检测到可重试的工具错误，当前步内重试一次。',
      repairedAction: proposal,
    };
  }

  // 任何不再适合继续 step 内重试的失败，都应该中止当前 step，
  // 把控制权交给 loop 层去判断是否改计划或降级。
  if (lastExecution?.status === 'failed') {
    return {
      verdict: 'abort_step',
      reason: '当前步继续修复收益不高，交给 loop 层判断是否改计划或降级回答。',
      repairedAction: null,
    };
  }

  // 默认：通过。
  return {
    verdict: 'pass',
    reason: '当前动作通过 step review。',
    repairedAction: null,
  };
}
