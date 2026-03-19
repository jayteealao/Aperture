import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("aperture-ws", { viewport: { width: 1280, height: 900 } });

const consoleErrors: string[] = [];
const consoleWarnings: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
  if (msg.type() === "warning") consoleWarnings.push(msg.text());
});

const failedRequests: string[] = [];
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

await page.goto("http://localhost:8080/workspace");
await waitForPageLoad(page);
await page.waitForTimeout(2000);

const rootHTML = await page.evaluate(() => {
  const root = document.getElementById("root");
  return root ? root.innerHTML.slice(0, 1200) : "NO #root ELEMENT";
});

const bodyStyle = await page.evaluate(() => {
  const s = getComputedStyle(document.body);
  return { bg: s.backgroundColor, color: s.color, display: s.display };
});

await page.screenshot({ path: "tmp/workspace-debug.png" });

console.log(JSON.stringify({
  url: page.url(),
  bodyStyle,
  rootLength: (await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? 0)),
  rootHTML,
  consoleErrors,
  consoleWarnings,
  failedRequests
}, null, 2));

await client.disconnect();
