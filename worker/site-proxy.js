// Serves Maple Wordle at ima.moe/maplewordle by fetching it from GitHub Pages.
// Cloudflare route: ima.moe/maplewordle*   (only this path; the rest of ima.moe is untouched)
const ORIGIN = 'https://sugaryummy.github.io';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // "/maplewordle" needs a trailing slash so the page's files (script.js, images/...) load from the right folder.
    if (url.pathname === '/maplewordle') {
      return Response.redirect(`${url.origin}/maplewordle/${url.search}`, 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const res = await fetch(ORIGIN + url.pathname + url.search, { method: request.method });
    return new Response(res.body, res);
  },
};
