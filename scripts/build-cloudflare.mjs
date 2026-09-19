import { cp, mkdir, rm } from "node:fs/promises";
await rm("cloudflare/static", { recursive: true, force: true });
// One WAM bundle serves both the tutorial and the meeting WAM paths; both
// open the meeting app.
for (const name of ["tutorial", "meeting"]) {
  await mkdir(`cloudflare/static/resource/wam/${name}`, { recursive: true });
  await cp("wam/dist", `cloudflare/static/resource/wam/${name}`, {
    recursive: true,
  });
}
