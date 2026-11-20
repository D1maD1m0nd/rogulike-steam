export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api/' + path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
    throw new Error(message || 'Не удалось связаться с сервером.');
  }
  return body as T;
}

export function post<T>(path: string, body: object = {}): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
