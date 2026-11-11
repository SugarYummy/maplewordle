# BGM PvP server: setup

Until this is set up, PvP rooms and the random queue only work between tabs of one browser.

`worker/pvp.js` is one small Cloudflare Worker with two Durable Objects:

- `PvpRoom`: one per room code. It passes messages between the players.
- `PvpQueue`: one in total. It keeps the list of public rooms waiting for players.

The game itself runs on the room host's device, so the server stores nothing.

## 1. Deploy (Wrangler, about 2 minutes)

From the repo folder, on a computer with Node.js:

```
npx wrangler login
npx wrangler deploy -c worker/pvp.wrangler.jsonc
```

It prints the address, e.g. `https://maplewordle-pvp.<your-subdomain>.workers.dev`.

The Free plan works: the config uses SQLite-backed Durable Objects (`new_sqlite_classes`), which the Free plan allows. A first deploy may ask you to pick or confirm your workers.dev subdomain.

Prefer the dashboard? Make a Worker, paste `worker/pvp.js`, then add two Durable Object bindings in Settings → Bindings:

- `ROOMS` → class `PvpRoom`
- `QUEUE` → class `PvpQueue`

If the dashboard doesn't offer the classes, use Wrangler.

## 2. Try it on the test site (no code change)

Open the test site's PvP page, then run this in the browser console (F12), with your address and `wss://` instead of `https://`:

```
localStorage['mapleWordle:pvpServer'] = 'wss://maplewordle-pvp.<your-subdomain>.workers.dev'
```

Reload. The "tabs of this browser" note disappears, and rooms and the queue now go through the server. Test it with your alt on another device or browser. To undo it:

```
delete localStorage['mapleWordle:pvpServer']
```

## 3. Make it permanent

Put the same `wss://` address in `PVP_SERVER` near the top of `pvp.js`, as the default instead of `''`.

## Notes

- **Limits** (top of `worker/pvp.js`): 8 people per room, messages up to 16 KB, 30 messages a second per player.
- **Cost:** the rooms use WebSocket Hibernation, so an idle room costs nothing. A match sends a few messages a second at most.
- **Logs:** `npx wrangler tail -c worker/pvp.wrangler.jsonc` shows live logs if something's wrong.
- **Address:** a workers.dev address is simplest. `ima.moe/maplewordle-pvp/*` also works, because the Worker drops that prefix. That route is more specific than the site's `ima.moe/maplewordle*` route, so it wins.
