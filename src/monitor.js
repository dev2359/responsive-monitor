require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { captureScreenshot }    = require('./screenshot');
const { analyzeScreenshot }    = require('./analyzer');
const { sendSlackNotification } = require('./slack');

// GitHub Actions에서 자동 주입되는 실행 URL
const RUN_URL = process.env.GITHUB_RUN_URL || null;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  // ── 설정 파일 로드
  const configPath = path.join(__dirname, '../config/sites.yml');
  const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

  // ── 스크린샷 저장 디렉토리
  const screenshotsDir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const results = [];

  for (const site of config.urls) {
    console.log(`\n🔍 사이트 검사 시작: ${site.url}`);

    for (const device of config.devices) {
      console.log(`  📱 ${device.name} (${device.width}×${device.height})`);

      try {
        // 1. 스크린샷 캡처 + 코드 기반 체크
        const { screenshotBuffer, issues: codeIssues } = await captureScreenshot(site.url, device);

        // 스크린샷 파일 저장 (GitHub Actions artifact용)
        const filename = `${site.name}__${device.name}__${device.width}x${device.height}.png`
          .replace(/[\s/\\:*?"<>|()]/g, '_');
        fs.writeFileSync(path.join(screenshotsDir, filename), screenshotBuffer);

        // 2. OpenAI Vision 분석
        const aiAnalysis = await analyzeScreenshot(screenshotBuffer, device, site.url);
        const hasAiIssue = !aiAnalysis.startsWith('이슈 없음');
        const hasIssue   = codeIssues.length > 0 || hasAiIssue;

        results.push({ url: site.url, device, codeIssues, aiAnalysis, hasIssue });

        const icon = hasIssue ? '⚠️ ' : '✅';
        console.log(`    ${icon} ${aiAnalysis.split('\n')[0]}`);

        // OpenAI API 레이트 리밋 방지
        await sleep(1000);

      } catch (err) {
        console.error(`    ❌ 오류: ${err.message}`);
        results.push({
          url: site.url,
          device,
          codeIssues: [{ type: 'error', message: `실행 오류: ${err.message}` }],
          aiAnalysis: '분석 실패 (실행 오류)',
          hasIssue: true,
        });
      }
    }
  }

  // 3. 슬랙 알림
  await sendSlackNotification(results, RUN_URL);

  const issueCount = results.filter(r => r.hasIssue).length;
  console.log(`\n✅ 모니터링 완료 — ${results.length}개 기기 중 ${issueCount}개 이슈 발견`);
}

run().catch(err => {
  console.error('모니터링 실행 실패:', err);
  process.exit(1);
});
