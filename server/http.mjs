export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

export function sendNoContent(response) {
  response.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  response.end();
}

export async function readJsonBody(request) {
  let raw = '';

  for await (const chunk of request) {
    raw += chunk;

    if (raw.length > 1_000_000) {
      throw new Error('请求体过大。');
    }
  }

  return raw ? JSON.parse(raw) : {};
}
