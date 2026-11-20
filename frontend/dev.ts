import page from './index.html';

const api = new URL('http://127.0.0.1:' + (process.env.PORT || '3001'));

Bun.serve({
  hostname: '127.0.0.1',
  port: 3000,
  development: { hmr: true, console: true },
  routes: {
    '/': page,
    '/api/*': async request => {
      const { pathname, search } = new URL(request.url);
      const upstream = new Request(new URL(pathname + search, api), request);
      for (let retry = 0; ; retry++) {
        try {
          return await fetch(upstream);
        } catch {
          if (request.method !== 'GET' || retry === 10 || request.signal.aborted) {
            return Response.json({ message: 'Сервер ещё запускается. Попробуй снова.' }, { status: 503 });
          }
          // Editing shared code reloads the page while Nest is still restarting.
          await Bun.sleep(150);
        }
      }
    },
  },
});
console.log('Steam Draft — http://127.0.0.1:3000');
