export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function serverError(message: string, detail?: unknown): Response {
  console.error('serverError:', message, detail);
  return json({ error: message }, 500);
}
