// Serves Maple Wordle at ima.moe/maplewordle by fetching it from GitHub Pages.
// Cloudflare route: ima.moe/maplewordle*   (only these paths, which include /maplewordledev; the rest of ima.moe is untouched)
const ORIGIN = 'https://sugaryummy.github.io';
// The test site's pages: browsers check for a newer copy every time (GitHub Pages lets them reuse one for 10 minutes),
// so a new test build shows up on every page right away.
function fresh(res, url) {
  const out = new Response(res.body, res);
  if (url.pathname.startsWith('/maplewordledev') && (out.headers.get('Content-Type') || '').includes('text/html')) {
    out.headers.set('Cache-Control', 'no-cache');
    out.headers.delete('Expires');
  }
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // "/maplewordle" needs a trailing slash so the page's files (script.js, images/...) load from the right folder.
    if (url.pathname === '/maplewordle') {
      return Response.redirect(`${url.origin}/maplewordle/${url.search}`, 301);
    }
    // The test site (ima.moe/maplewordledev): same, plus its older builds in b/<build>/, which keep only their code;
    // anything else (images, sounds, videos) comes from the newest build.
    if (url.pathname === '/maplewordledev') {
      return Response.redirect(`${url.origin}/maplewordledev/${url.search}`, 301);
    }
    const old = url.pathname.match(/^\/maplewordledev\/b\/[\w.]+(\/.*)?$/);
    if (old && !old[1]) return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
    if (old && (request.method === 'GET' || request.method === 'HEAD')) {
      let res = await fetch(ORIGIN + url.pathname + url.search, { method: request.method });
      if (res.status === 404) res = await fetch(ORIGIN + '/maplewordledev' + old[1] + url.search, { method: request.method });
      return fresh(res, url);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const res = await fetch(ORIGIN + url.pathname + url.search, { method: request.method });
    return fresh(res, url);
  },
};
