import { cp, mkdir, rm } from "node:fs/promises";
await rm("cloudflare/static", { recursive: true, force: true });
await mkdir("cloudflare/static/resource/wam/meeting", { recursive: true });
await cp("wam/dist", "cloudflare/static/resource/wam/meeting", {
  recursive: true,
});
