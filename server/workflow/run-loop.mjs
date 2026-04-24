import {
  appendEvent,
  appendMessage,
  clone,
  now,
  runs,
  updateRun,
} from '../run-store.mjs';
import { proposeNextAction } from './action-proposal.mjs';
import { executeTool } from './execute-tool.mjs';
import { reviewLoop } from './loop-review.mjs';
import {
  applyStepResultToState,
  buildObservation,
  computeProgressDelta,
} from './state.mjs';
import { reviewStep } from './step-review.mjs';

const MAX_LOOPS = 8;
const MAX_STEP_REPAIRS = 3;

function buildStepReviewTitle(verdict) {
  if (verdict === 'repair') {
    return 'Step 审查触发纠偏';
  }

  if (verdict === 'abort_step') {
    return 'Step 审查终止当前轮修复';
  }

  return 'Step 审查通过';
}

function buildLoopReviewTitle(verdict) {
  if (verdict === 'replan') {
    return 'Loop 复盘触发重规划';
  }

  if (verdict === 'finalize') {
    return 'Loop 复盘决定收敛';
  }

  if (verdict === 'abort') {
    return 'Loop 复盘终止任务';
  }

  return 'Loop 复盘允许继续推进';
}

function createModelEventRecorder(run, loopIndex) {
  return event => {
    appendEvent(run, {
      loopIndex,
      phase: 'model',
      status: event.status,
      title: event.title,
      summary: event.summary,
      detail: event.detail,
    });
  };
}

function withLatency(detail, latencyMs) {
  if (detail && typeof detail === 'object') {
    return {
      ...detail,
      latencyMs,
    };
  }

  return {
    value: detail ?? null,
    latencyMs,
  };
}

export async function runLoop(runId, modelOptions) {
  const run = runs.get(runId);

  if (!run) {
    return;
  }
  const runStartedAt = Date.now();
  updateRun(run, { status: 'running' });

  try {
    // loop 循环：决定并记录“下一步是什么”，并把结果写进 run.steps / run.state （跨步推进）
    while (!run.state.isComplete && run.steps.length < MAX_LOOPS) {
      const loopIndex = run.steps.length + 1;
      const stateBefore = clone(run.state);
      const observeStartedAt = Date.now();
      const observation = buildObservation(run.state);
      appendEvent(run, {
        loopIndex,
        phase: 'observe',
        status: 'info',
        title: '构建当前观察',
        summary: observation.summary,
        detail: withLatency(observation, Date.now() - observeStartedAt),
      });

      const loopModelOptions = {
        ...modelOptions,
        onModelEvent: createModelEventRecorder(run, loopIndex),
      };

      const proposalStartedAt = Date.now();

      // 基于当前观察的信息，让 LLM 决定下一步要干什么
      const propose = proposeNextAction;
      const proposalResult = await propose(run, observation, loopModelOptions);

      const proposal =
        proposalResult &&
        typeof proposalResult === 'object' &&
        'action' in proposalResult
          ? proposalResult.action
          : proposalResult;

      const proposalLatencyMs =
        proposalResult &&
        typeof proposalResult === 'object' &&
        'metrics' in proposalResult &&
        proposalResult.metrics &&
        typeof proposalResult.metrics === 'object' &&
        typeof proposalResult.metrics.latencyMs === 'number'
          ? proposalResult.metrics.latencyMs
          : Date.now() - proposalStartedAt;

      appendEvent(run, {
        loopIndex,
        phase: 'step',
        status: 'info',
        title: '生成 Step 提案',
        summary: proposal.reason,
        detail: withLatency(proposal, proposalLatencyMs),
      });

      let finalAction = proposal;
      let execution = null;
      let repairCount = 0;
      let toolAttemptCount = 0;
      const stepReviews = [];

      // Step 级自纠：在同一轮循环中先修复/重试，再提交本轮结果。
      while (repairCount <= MAX_STEP_REPAIRS) {
        const stepReviewStartedAt = Date.now();
        const stepReview = await reviewStep({
          run,
          observation,
          proposal: finalAction,
          lastExecution: execution,
          repairCount,
          modelOptions,
        });

        stepReviews.push(stepReview);
        appendEvent(run, {
          loopIndex,
          phase: 'step',
          status:
            stepReview.verdict === 'pass'
              ? 'pass'
              : stepReview.verdict === 'repair'
                ? 'repair'
                : 'abort',
          title: buildStepReviewTitle(stepReview.verdict),
          summary: stepReview.reason,
          detail: withLatency(stepReview, Date.now() - stepReviewStartedAt),
          attempt: repairCount + 1,
        });

        // 修复：如需修复则重复当前轮循环
        if (stepReview.verdict === 'repair' && stepReview.repairedAction) {
          finalAction = stepReview.repairedAction;
          execution = null;
          repairCount += 1;
          continue;
        }

        // 终止：如需终止则跳出当前轮循环
        if (stepReview.verdict === 'abort_step') {
          break;
        }

        // 通过预检后，如需调用工具则执行工具。
        if (finalAction.type === 'call_tool') {
          toolAttemptCount += 1;
          appendEvent(run, {
            loopIndex,
            phase: 'tool',
            status: 'start',
            title: `开始执行工具 ${finalAction.toolCall.name}`,
            summary: `第 ${toolAttemptCount} 次工具尝试`,
            detail: {
              toolCall: finalAction.toolCall,
              attempt: toolAttemptCount,
            },
            attempt: toolAttemptCount,
          });
          execution = await executeTool(
            finalAction.toolCall,
            run.state,
            loopModelOptions,
          );
          appendEvent(run, {
            loopIndex,
            phase: 'tool',
            status: execution.status === 'success' ? 'success' : 'failed',
            title:
              execution.status === 'success'
                ? `工具 ${finalAction.toolCall.name} 执行成功`
                : `工具 ${finalAction.toolCall.name} 执行失败`,
            summary:
              execution.status === 'success'
                ? `第 ${toolAttemptCount} 次工具尝试成功`
                : execution.error,
            detail: withLatency(
              {
                toolName: finalAction.toolCall.name,
                toolCall: finalAction.toolCall,
                execution,
                attempt: toolAttemptCount,
              },
              execution.latencyMs ?? 0,
            ),
            attempt: toolAttemptCount,
          });

          // 工具失败时交给 step-review 决定是否需要在当前 step 内重试/纠偏。
          if (execution.status === 'failed') {
            continue;
          }
        }

        // 若已响应或工具执行成功，则提交当前 step。
        break;
      }

      // 消息日志使用最终提交的动作（已包含 step 内纠偏后的最终动作）。
      appendMessage(run, {
        role: 'assistant',
        content:
          finalAction.type === 'call_tool'
            ? `${finalAction.reason}\n\n调用工具：${finalAction.toolCall.name}\n参数：${JSON.stringify(finalAction.toolCall.arguments, null, 2)}`
            : finalAction.responseDraft,
      });

      if (finalAction.type === 'call_tool' && execution) {
        appendMessage(run, {
          role: 'tool',
          toolName: finalAction.toolCall.name,
          content:
            execution.status === 'success'
              ? JSON.stringify(execution.output, null, 2)
              : `工具执行失败：${execution.error}`,
        });
      }

      const stateUpdateStartedAt = Date.now();
      const stateAfter = applyStepResultToState(
        run.state,
        finalAction,
        execution,
      );

      const progressDelta = computeProgressDelta(stateBefore, stateAfter);

      // 在 loop review 前先更新进度计数，确保 loop review 能看到“停滞”信号。
      if (progressDelta === 0) {
        stateAfter.stagnationCount = (stateAfter.stagnationCount ?? 0) + 1;
      } else {
        stateAfter.stagnationCount = 0;
        stateAfter.progressScore =
          (stateAfter.progressScore ?? 0) + progressDelta;
      }
      let stateLatencyMs = Date.now() - stateUpdateStartedAt;

      const loopReviewStartedAt = Date.now();
      const loopReview = await reviewLoop({
        run,
        observation,
        action: finalAction,
        execution,
        stateBefore,
        stateAfter,
        progressDelta,
        loopModelOptions,
      });
      appendEvent(run, {
        loopIndex,
        phase: 'loop',
        status: loopReview.verdict,
        title: buildLoopReviewTitle(loopReview.verdict),
        summary: loopReview.reason,
        detail: withLatency(loopReview, Date.now() - loopReviewStartedAt),
      });

      // 重规划：如需重规划则重复当前轮循环
      if (loopReview.verdict === 'replan') {
        const statePatchStartedAt = Date.now();
        stateAfter.plan = loopReview.newPlan ?? stateAfter.plan;
        stateAfter.loopContext = stateAfter.loopContext ?? {};
        stateAfter.loopContext.replanCount =
          (stateAfter.loopContext.replanCount ?? 0) + 1;
        stateAfter.loopContext.lastReview = loopReview.reason;
        stateLatencyMs += Date.now() - statePatchStartedAt;
      }

      // 收敛：如需收敛则跳出当前轮循环
      if (loopReview.verdict === 'finalize') {
        const statePatchStartedAt = Date.now();
        if (!stateAfter.finalAnswer && loopReview.finalAnswerDraft) {
          stateAfter.finalAnswer = loopReview.finalAnswerDraft;
        }
        stateAfter.isComplete = true;
        stateLatencyMs += Date.now() - statePatchStartedAt;
      }

      appendEvent(run, {
        loopIndex,
        phase: 'state',
        status: 'info',
        title: '状态已更新',
        summary: `当前目标：${stateAfter.nextGoal}`,
        detail: withLatency(
          {
            progressDelta,
            progressScore: stateAfter.progressScore,
            stagnationCount: stateAfter.stagnationCount,
            stateAfter,
          },
          stateLatencyMs,
        ),
      });

      run.state = stateAfter;

      run.steps.push({
        index: run.steps.length + 1,
        observation,
        // 记录双层自纠（proposal / stepReviews / loopReview）过程信息。
        proposal,
        stepReviews,
        finalAction,
        loopReview,
        repairCount,
        execution,
        stateAfter: clone(stateAfter),
        createdAt: now(),
      });

      updateRun(run);

      if (loopReview.verdict === 'abort') {
        break;
      }
    }

    if (run.state.isComplete) {
      appendEvent(run, {
        phase: 'run',
        status: 'success',
        title: 'Run 完成',
        summary: '任务已成功收敛。',
        detail: withLatency(
          {
            finalAnswer: run.state.finalAnswer,
          },
          Date.now() - runStartedAt,
        ),
      });
      updateRun(run, {
        status: 'success',
        finalMessage: '天气出行助手已完成本次任务。',
      });
      return;
    }

    appendEvent(run, {
      phase: 'run',
      status: 'failed',
      title: 'Run 失败',
      summary: '未在预期步骤内完成。',
      detail: withLatency(
        {
          steps: run.steps.length,
        },
        Date.now() - runStartedAt,
      ),
    });
    updateRun(run, {
      status: 'failed',
      error: '双层自纠正 loop 未在预期步骤内完成。',
    });
  } catch (error) {
    appendEvent(run, {
      phase: 'run',
      status: 'failed',
      title: 'Run 异常退出',
      summary: error instanceof Error ? error.message : String(error),
      detail: withLatency(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        Date.now() - runStartedAt,
      ),
    });
    updateRun(run, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
