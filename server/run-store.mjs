export const runs = new Map();

export function now() {
  return new Date().toISOString();
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function updateRun(run, patch = {}) {
  Object.assign(run, patch, { updatedAt: now() });
  runs.set(run.id, run);
  return run;
}

export function appendMessage(run, message) {
  run.messages.push({
    ...message,
    createdAt: now(),
  });
}

export function appendEvent(run, event) {
  if (!Array.isArray(run.events)) {
    run.events = [];
  }

  run.events.push({
    id: `${Date.now()}-${run.events.length + 1}`,
    ...event,
    createdAt: now(),
  });
}
