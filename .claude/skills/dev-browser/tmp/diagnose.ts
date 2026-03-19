import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("aperture", { viewport: { width: 1280, height: 900 } });

const consoleErrors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const failedRequests: string[] = [];
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

await page.goto("http://localhost:8080");
await waitForPageLoad(page);
await page.waitForTimeout(2000);

const rootHTML = await page.evaluate(() => {
  const root = document.getElementById("root");
  return root ? root.innerHTML.slice(0, 800) : "NO #root ELEMENT";
});

const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const title = await page.title();
const url = page.url();

await page.screenshot({ path: "tmp/aperture-debug.png" });

console.log(JSON.stringify({ title, url, bgColor, rootHTML, consoleErrors, failedRequests }, null, 2));
await client.disconnect();
