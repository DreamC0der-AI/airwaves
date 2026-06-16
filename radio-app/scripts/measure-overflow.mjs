import { webkit, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/airwaves/";
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices["iPhone 12"] });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(1500);

const result = await page.evaluate(() => {
  const iw = window.innerWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > iw + 0.5 || r.left < -0.5) {
      const cls = typeof el.className === "string" ? el.className : el.className?.baseVal ?? "";
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
  }
  return {
    innerWidth: iw,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflowing: offenders.slice(0, 40),
  };
});

console.log(JSON.stringify(result, null, 2));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
