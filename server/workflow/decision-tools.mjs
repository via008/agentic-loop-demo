import { z } from 'zod';

// Valid tool names that the model is allowed to call.
export const toolNameSchema = z.enum([
  'get_weather',
  'plan_outing',
  'get_weather1',
]);

export function getToolDefinitions() {
  return [
    // DEMO 错误演示
    // {
    //   type: 'function',
    //   function: {
    //     name: 'get_weather1',
    //     description:
    //       '获取某个城市在指定日期的天气信息。当天气数据缺失时优先使用它。',
    //     parameters: {
    //       type: 'object',
    //       properties: {
    //         city: {
    //           type: 'string',
    //           description: '需要查询天气的城市，例如杭州。',
    //         },
    //         date: {
    //           type: 'string',
    //           description: '日期标签，具体的日期，例如2023-12-25。',
    //         },
    //       },
    //       required: ['city', 'date'],
    //       additionalProperties: false,
    //     },
    //   },
    // },
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description:
          '获取某个城市在指定日期的天气信息。当天气数据缺失时次要使用它。',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: '需要查询天气的城市，例如杭州。',
            },
            date: {
              type: 'string',
              description: '日期标签，具体的日期，例如2023-12-25。',
            },
          },
          required: ['city', 'date'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'plan_outing',
        description:
          '基于当前 state.weather 已有的天气信息，为城市生成出行建议。仅当天气已存在且还没有 outingPlan 时调用。',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: '出行城市或地点，例如重庆涪陵区。',
            },
          },
          required: ['city'],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function defaultReasonForTool(toolName) {
  if (toolName === 'get_weather') {
    return '模型判断需要先查询天气。';
  }

  if (toolName === 'plan_outing') {
    return '模型判断需要基于天气生成出行建议。';
  }

  return '模型决定调用工具继续推进任务。';
}
