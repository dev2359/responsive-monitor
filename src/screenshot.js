const { chromium } = require('playwright');

/**
 * 지정 기기로 URL 스크린샷 캡처 + 코드 기반 이슈 감지
 */
async function captureScreenshot(url, device) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
  });
  const page = await context.newPage();
  const issues = [];

  // ── JS 콘솔 에러 감지
  page.on('console', msg => {
    if (msg.type() === 'error') {
      issues.push({ type: 'console_error', message: `콘솔 에러: ${msg.text().slice(0, 120)}` });
    }
  });

  // ── 네트워크 4xx / 5xx 감지
  page.on('response', res => {
    if (res.status() >= 400) {
      const short = res.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 80);
      issues.push({ type: 'network_error', message: `HTTP ${res.status()}: ${short}` });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 폰트·이미지 등 렌더링 안정화 대기
    await page.waitForTimeout(2500);

    // ── 가로 스크롤 감지 (레이아웃 오버플로우 대표 증상)
    const hasHScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2
    );
    if (hasHScroll) {
      issues.push({ type: 'layout', message: '가로 스크롤 발생 (레이아웃 오버플로우 의심)' });
    }

    // ── 뷰포트 오른쪽 밖으로 삐져나간 요소 감지
    const overflows = await page.evaluate(() => {
      const result = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 5) {
          const cls = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/)[0] : '';
          result.push(el.tagName.toLowerCase() + cls);
        }
      }
      return [...new Set(result)].slice(0, 5);
    });
    if (overflows.length > 0) {
      issues.push({ type: 'layout', message: `뷰포트 초과 요소 감지: ${overflows.join(', ')}` });
    }

    // ── 이미지 로드 실패 감지
    const brokenImgs = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => img.src.replace(/^https?:\/\/[^/]+/, '').slice(0, 60))
        .slice(0, 3)
    );
    if (brokenImgs.length > 0) {
      issues.push({ type: 'broken_image', message: `이미지 로드 실패: ${brokenImgs.join(', ')}` });
    }

    const screenshotBuffer = await page.screenshot({ fullPage: true });
    await browser.close();
    return { screenshotBuffer, issues };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = { captureScreenshot };
