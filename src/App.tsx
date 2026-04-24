import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

type RunStatus = 'queued' | 'running' | 'success' | 'failed';

type RunEvent = {
  id: string;
  loopIndex?: number;
  attempt?: number;
  phase: 'observe' | 'step' | 'tool' | 'loop' | 'state' | 'run' | 'model';
  status:
    | 'info'
    | 'pass'
    | 'repair'
    | 'abort'
    | 'start'
    | 'success'
    | 'failed'
    | 'continue'
    | 'replan'
    | 'finalize';
  title: string;
  summary?: string;
  detail?: unknown;
  createdAt: string;
};

type Run = {
  id: string;
  scenario: 'weather_outing_assistant';
  task: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  events: RunEvent[];
  error?: string;
  finalMessage?: string;
};

const eventPhaseLabelMap = {
  observe: '观察',
  step: 'Step',
  tool: '工具',
  model: 'LLM',
  loop: 'Loop',
  state: '状态',
  run: 'Run',
} as const;

const eventStatusLabelMap = {
  info: '信息',
  pass: '通过',
  repair: '纠偏',
  abort: '中止',
  start: '开始',
  success: '成功',
  failed: '失败',
  continue: '继续',
  replan: '重规划',
  finalize: '收敛',
} as const;

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const ms = pad3(date.getMilliseconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}.${ms}`;
}

function formatDuration(ms?: number) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) {
    return '--';
  }

  return `${Math.max(0, Math.round(ms))}ms`;
}

function getEventDurationMs(event: RunEvent) {
  const detail =
    event.detail && typeof event.detail === 'object'
      ? (event.detail as Record<string, unknown>)
      : null;

  if (typeof detail?.latencyMs === 'number') {
    return detail.latencyMs;
  }

  const execution =
    detail?.execution && typeof detail.execution === 'object'
      ? (detail.execution as Record<string, unknown>)
      : null;

  if (typeof execution?.latencyMs === 'number') {
    return execution.latencyMs;
  }

  return undefined;
}

function getRunDurationMs(run: Run | null) {
  if (!run) {
    return undefined;
  }

  const start = new Date(run.createdAt).getTime();
  const end = new Date(run.updatedAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}

const App = (): JSX.Element => {
  const [task, setTask] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    const envBase = import.meta.env.VITE_API_BASE_URL?.trim();
    if (envBase) {
      return envBase.replace(/\/$/, '');
    }

    if (typeof window === 'undefined') {
      return 'http://localhost:3001';
    }

    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }, []);

  useEffect(() => {
    document.title = '天气出行助手 Loop Demo';
  }, []);

  useEffect(() => {
    if (!run || (run.status !== 'queued' && run.status !== 'running')) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/runs/${run.id}`);

        if (!response.ok) {
          return;
        }

        const nextRun = (await response.json()) as Run;
        setRun(nextRun);
      } catch {
        // 继续轮询，直到请求成功或 run 结束。
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [apiBase, run]);

  useEffect(() => {
    if (!run?.events.length) {
      setSelectedEventId(null);
      return;
    }

    setSelectedEventId(currentId => {
      if (currentId && run.events.some(event => event.id === currentId)) {
        return currentId;
      }

      return run.events[0]?.id ?? null;
    });
  }, [run]);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task }),
      });

      const data = (await response.json()) as Run | { error: string };

      if (!response.ok || 'error' in data) {
        throw new Error('error' in data ? data.error : '创建 run 失败');
      }

      setRun(data);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEvent =
    run?.events.find(event => event.id === selectedEventId) ??
    run?.events[0] ??
    null;
  const runDurationMs = getRunDurationMs(run);

  return (
    <div className="page-shell">
      <main className="page-main">
        <section className="hero-card">
          <p className="eyebrow">Loop Timeline Demo</p>
          <p className="hero-copy">
            用户输入出行需求后，会按轮次执行“观察当前状态 → 提出下一步 → Step
            层审查与修正 → 调用工具或生成回答 → Loop 层复盘 → 更新状态”。
          </p>
          <div className="composer">
            <textarea
              value={task}
              onChange={event => setTask(event.target.value)}
              rows={3}
              placeholder="输入你的任务，例如：帮我安排明天去杭州西湖散步..."
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !task.trim()}
            >
              {submitting ? '启动中...' : '启动任务'}
            </button>
          </div>
          <p className="helper-text">
            {run ? (
              <>
                当前任务状态：<code>{run.status}</code>，总耗时：
                <code>{formatDuration(runDurationMs)}</code>
              </>
            ) : (
              '输入任务后启动。'
            )}
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="timeline-layout">
          <section className="timeline-panel">
            <div className="panel-header">
              <h2>时序列表</h2>
              <span className="panel-metric">
                总耗时: {formatDuration(runDurationMs)}
              </span>
            </div>
            {run?.events.length ? (
              <div className="timeline-list">
                {run.events.map((event, index) => {
                  const durationMs = getEventDurationMs(event);
                  const active = selectedEvent?.id === event.id;

                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`timeline-item phase-${event.phase} ${active ? 'is-active' : ''}`}
                      onClick={() => setSelectedEventId(event.id)}
                    >
                      <span className="timeline-marker" aria-hidden="true">
                        {index + 1}
                      </span>
                      <div className="timeline-card">
                        <div className="timeline-card-top">
                          <span className="timeline-phase">{event.title}</span>
                          <span
                            className={`timeline-status status-${event.status}`}
                          >
                            {eventStatusLabelMap[event.status]}
                          </span>
                        </div>
                        <div className="timeline-card-meta">
                          <span>开始: {formatDateTime(event.createdAt)}</span>
                          <span>耗时: {formatDuration(durationMs)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="empty-text">
                任务启动后，这里会按时间顺序显示完整执行日志。
              </p>
            )}
          </section>

          <section className="detail-panel">
            <div className="panel-header">
              <h2>节点信息</h2>
            </div>
            {selectedEvent ? (
              <div className="detail-content">
                <div className="detail-title-row">
                  <strong>{formatDateTime(selectedEvent.createdAt)}</strong>
                  <div className="event-badges">
                    <span className="event-chip phase-chip">
                      {eventPhaseLabelMap[selectedEvent.phase]}
                    </span>
                    <span className="event-chip">
                      {eventStatusLabelMap[selectedEvent.status]}
                    </span>
                    {typeof selectedEvent.loopIndex === 'number' ? (
                      <span className="event-chip">
                        第 {selectedEvent.loopIndex} 轮
                      </span>
                    ) : null}
                    {typeof selectedEvent.attempt === 'number' ? (
                      <span className="event-chip">
                        尝试 #{selectedEvent.attempt}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="detail-meta-grid">
                  <div className="detail-meta-item">
                    <span>标题</span>
                    <strong>{selectedEvent.title}</strong>
                  </div>
                  <div className="detail-meta-item">
                    <span>阶段</span>
                    <strong>{eventPhaseLabelMap[selectedEvent.phase]}</strong>
                  </div>
                  <div className="detail-meta-item">
                    <span>状态</span>
                    <strong>{eventStatusLabelMap[selectedEvent.status]}</strong>
                  </div>
                  <div className="detail-meta-item">
                    <span>耗时</span>
                    <strong>
                      {formatDuration(getEventDurationMs(selectedEvent))}
                    </strong>
                  </div>
                </div>
                {selectedEvent.summary ? (
                  <div className="detail-section1">
                    <span className="detail-section-title">详细数据</span>
                    <p className="event-summary detail-summary">
                      {selectedEvent.summary}
                    </p>
                  </div>
                ) : null}
                {typeof selectedEvent.detail !== 'undefined' ? (
                  <div className="detail-section">
                    <span className="detail-section-title">原始内容</span>
                    <pre className="detail-pre">
                      {formatJson(selectedEvent.detail)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="empty-text">
                选择左侧节点后，这里会展示对应的详细信息。
              </p>
            )}
          </section>
        </section>
      </main>
    </div>
  );
};

export default App;
