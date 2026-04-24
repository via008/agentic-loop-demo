export function classifyExecutionError(toolName, errorMessage) {
  const message = String(errorMessage ?? '');
  const text = message.toLowerCase();
  const name = String(toolName ?? '');

  // 临时/服务端波动类问题：通常适合在同一个 step 内重试一次。
  if (
    text.includes('暂时不可用') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('503') ||
    text.includes('502') ||
    text.includes('network') ||
    text.includes('econnreset') ||
    text.includes('fetch failed')
  ) {
    return {
      errorCode: 'TRANSIENT_TOOL_ERROR',
      retryable: true,
      category: 'transient',
      message,
      toolName: name,
    };
  }

  // 缺少前置条件：继续重试同一个工具调用也不会有帮助。
  if (
    text.includes('无法执行') ||
    text.includes('前置') ||
    text.includes('还没有天气') ||
    text.includes('缺少天气')
  ) {
    return {
      errorCode: 'MISSING_PREREQUISITE',
      retryable: false,
      category: 'missing_prerequisite',
      message,
      toolName: name,
    };
  }

  // 参数不合法/解析错误：通常可以通过调整参数后重试修复。
  if (
    text.includes('zod') ||
    text.includes('invalid') ||
    text.includes('参数') ||
    text.includes('json') ||
    text.includes('parse')
  ) {
    return {
      errorCode: 'BAD_ARGUMENTS',
      retryable: true,
      category: 'bad_arguments',
      message,
      toolName: name,
    };
  }

  return {
    errorCode: 'UNKNOWN_TOOL_ERROR',
    retryable: false,
    category: 'unknown',
    message,
    toolName: name,
  };
}
