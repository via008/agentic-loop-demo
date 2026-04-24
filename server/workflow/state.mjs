import { parseTask } from '../llm/parse_task/index.mjs';
import { clone } from '../run-store.mjs';

export async function createInitialState(task, modelOptions) {
  const parsed = await parseTask(task, modelOptions);

  return {
    userGoal: task,
    city: parsed.city,
    date: parsed.date,
    weather: null,
    outingPlan: null,
    finalAnswer: null,
    lastToolError: null,
    nextGoal: '先获取天气信息',
    isComplete: false,

    plan: ['获取天气', '生成出行建议', '整理最终回复'],
    currentGoal: '获取天气',
    progressScore: 0,
    stagnationCount: 0,
    attemptsByTool: {
      get_weather: 0,
      plan_outing: 0,
    },
    loopContext: {
      replanCount: 0,
      lastReview: null,
    },
  };
}

export function buildObservation(state) {
  const knownFacts = [
    `用户目标：${state.userGoal}`,
    `城市：${state.city}`,
    `日期：${state.date}`,
  ];
  const missingInfo = [];

  if (state.weather) {
    knownFacts.push(
      `天气：${state.weather.condition}，${state.weather.temperatureMinC}-${state.weather.temperatureMaxC}℃，降雨概率 ${state.weather.rainProbability}%`,
    );
  } else {
    missingInfo.push('还没有天气信息');
  }

  if (state.outingPlan) {
    knownFacts.push(`已有出行建议：${state.outingPlan.summary}`);
  } else if (state.weather) {
    missingInfo.push('还没有根据天气生成出行建议');
  }

  if (state.finalAnswer) {
    knownFacts.push('已经生成最终回答');
  }

  if (state.lastToolError) {
    knownFacts.push(
      `上一轮工具失败：${state.lastToolError.toolName} - ${state.lastToolError.message}`,
    );
    missingInfo.push('需要根据上一次工具错误调整下一步策略');
  }

  const summary = state.finalAnswer
    ? '任务已经完成，当前有最终答复。'
    : state.lastToolError
      ? '上一轮工具执行失败，需要根据错误信息重新决策。'
      : state.outingPlan
        ? '天气和出行建议都已具备，可以整理成最终回答。'
        : state.weather
          ? '已经拿到天气数据，下一步需要生成出行建议。'
          : '当前只有用户目标，下一步需要先查询天气。';

  return {
    summary,
    knownFacts,
    missingInfo,
  };
}

export function computeProgressDelta(prevState, nextState) {
  let delta = 0;

  if (!prevState.weather && nextState.weather) {
    delta += 1;
  }

  if (!prevState.outingPlan && nextState.outingPlan) {
    delta += 1;
  }

  if (!prevState.finalAnswer && nextState.finalAnswer) {
    delta += 1;
  }

  return delta;
}

export function applyStepResultToState(state, action, execution, meta = {}) {
  const nextState = clone(state);

  // 记录工具尝试次数，供循环层做“卡住/停滞”检测使用。
  if (action?.type === 'call_tool' && action.toolCall?.name) {
    const toolName = action.toolCall.name;
    nextState.attemptsByTool = nextState.attemptsByTool ?? {};
    nextState.attemptsByTool[toolName] =
      (nextState.attemptsByTool[toolName] ?? 0) + 1;
  }

  if (action.type === 'call_tool' && execution) {
    if (execution.status === 'success') {
      nextState.lastToolError = null;

      if (action.toolCall.name === 'get_weather') {
        nextState.weather = execution.output;
        nextState.nextGoal = '基于天气生成出行建议';
        nextState.currentGoal = '生成出行建议';
      }

      if (action.toolCall.name === 'plan_outing') {
        nextState.outingPlan = execution.output;
        nextState.nextGoal = '整理最终回复';
        nextState.currentGoal = '整理最终回复';
      }
    } else {
      nextState.lastToolError = {
        toolName: action.toolCall.name,
        message: execution.error,
        errorCode: execution.errorCode,
        category: execution.category,
      };
      nextState.nextGoal = '根据上一次工具错误调整策略';
    }
  }

  if (action.type === 'respond') {
    nextState.finalAnswer = action.responseDraft;
    nextState.lastToolError = null;
    nextState.nextGoal = '任务完成';
    nextState.currentGoal = '任务完成';
    nextState.isComplete = true;
  }

  // 保存循环层复盘信息（可选）。
  if (meta?.loopReview?.reason) {
    nextState.loopContext = nextState.loopContext ?? {};
    nextState.loopContext.lastReview = meta.loopReview.reason;
  }

  return nextState;
}
