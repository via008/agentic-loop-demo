import { decideNextStep } from '../llm/decision/index.mjs';
import { applyDecisionGuards } from './decision-guards.mjs';

// Proposal 层：基于当前 状态/观察 生成下一步动作提案。
// 任何纠偏/修复都应由 step-review / loop-review 层处理。
export async function proposeNextAction(run, observation, modelOptions) {
  const decision = await decideNextStep(run, observation, modelOptions);
  const proposalStartedAt = Date.now();
  const action = applyDecisionGuards(run, decision);

  return {
    action,
    metrics: {
      latencyMs: Date.now() - proposalStartedAt,
    },
  };
}
