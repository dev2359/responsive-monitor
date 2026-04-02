const axios = require('axios');

/**
 * 슬랙 알림 발송
 * - 이슈 없음: 간단한 완료 메시지
 * - 이슈 있음: 기기별 상세 내용 + GitHub Actions 링크
 */
async function sendSlackNotification(results, runUrl) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️  SLACK_WEBHOOK_URL이 설정되지 않아 알림을 건너뜁니다.');
    return;
  }

  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const issueList = results.filter(r => r.hasIssue);
  const total = results.length;

  // ── 이슈 없음
  if (issueList.length === 0) {
    await axios.post(webhookUrl, {
      text: `✅ *반응형 모니터링 완료* — 전체 ${total}개 기기에서 이슈 없음\n_${now}_`,
    });
    return;
  }

  // ── 이슈 있음
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🚨 반응형 UI 이슈 감지', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${total}개 기기 중 ${issueList.length}개에서 이슈 발견*\n_${now}_`,
      },
    },
    { type: 'divider' },
  ];

  for (const r of issueList) {
    const codeLines = r.codeIssues.length > 0
      ? r.codeIssues.map(i => `• ${i.message}`).join('\n')
      : '• 없음';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*📱 ${r.device.name}* (${r.device.width}×${r.device.height} / ${r.device.category})`,
          `*사이트:* ${r.url}`,
          '',
          `*코드 감지 이슈:*\n${codeLines}`,
          '',
          `*🤖 AI 분석:*\n${r.aiAnalysis}`,
        ].join('\n'),
      },
    });
    blocks.push({ type: 'divider' });
  }

  if (runUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📎 <${runUrl}|스크린샷 및 상세 로그 보기 (GitHub Actions)>`,
      },
    });
  }

  await axios.post(webhookUrl, { blocks });
}

module.exports = { sendSlackNotification };
