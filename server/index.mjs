import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { z } from 'zod';
import { apiKey, baseURL, getModelOptions, model, port } from './config.mjs';
import { readJsonBody, sendJson, sendNoContent } from './http.mjs';
import { appendEvent, now, runs } from './run-store.mjs';
import { runLoop } from './workflow/run-loop.mjs';
import { createInitialState } from './workflow/state.mjs';

const createRunSchema = z.object({
  task: z.string().trim().min(1, '任务内容不能为空。'),
});

const modelOptions = getModelOptions();

async function createRun(task) {
  const run = {
    id: randomUUID(),
    scenario: 'weather_outing_assistant',
    task,
    status: 'queued',
    createdAt: now(),
    updatedAt: now(),
    messages: [
      {
        role: 'user',
        content: task,
        createdAt: now(),
      },
    ],
    events: [],
    steps: [],
    state: null,
  };

  run.state = await createInitialState(task, {
    ...modelOptions,
    onModelEvent: event => {
      appendEvent(run, {
        phase: 'model',
        status: event.status,
        title: event.title,
        summary: event.summary,
        detail: event.detail,
      });
    },
  });

  return run;
}

function handleHealth(response) {
  sendJson(response, 200, {
    ok: Boolean(apiKey),
    mockMode: false,
    hasAnthropicKey: Boolean(apiKey),
    model,
    baseURL,
    weatherProvider: 'open-meteo',
    tools: ['get_weather', 'plan_outing'],
  });
}

async function handleCreateRun(request, response) {
  try {
    const body = await readJsonBody(request);
    const { task } = createRunSchema.parse(body);
    const run = await createRun(task);

    runs.set(run.id, run);
    runLoop(run.id, modelOptions);
    sendJson(response, 201, run);
  } catch (error) {
    sendJson(response, error instanceof z.ZodError ? 400 : 500, {
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? '请求参数不合法。')
          : error instanceof Error
            ? error.message
            : String(error),
    });
  }
}

function handleGetRun(response, runId) {
  const run = runs.get(runId);

  if (!run) {
    sendJson(response, 404, { error: '未找到对应任务。' });
    return;
  }

  sendJson(response, 200, run);
}

const server = createServer(async (request, response) => {
  const method = request.method ?? 'GET';
  const url = new URL(
    request.url ?? '/',
    `http://${request.headers.host ?? 'localhost'}`,
  );

  if (method === 'OPTIONS') {
    sendNoContent(response);
    return;
  }

  if (method === 'GET' && url.pathname === '/health') {
    handleHealth(response);
    return;
  }

  if (method === 'POST' && url.pathname === '/runs') {
    await handleCreateRun(request, response);
    return;
  }

  if (method === 'GET' && /^\/runs\/[^/]+$/.test(url.pathname)) {
    handleGetRun(response, url.pathname.split('/')[2]);
    return;
  }

  sendJson(response, 404, { error: '接口不存在。' });
});

server.listen(port, () => {
  console.log(`智能体循环 API 已启动：http://localhost:${port}`);
});
