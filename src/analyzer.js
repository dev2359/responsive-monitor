const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 스크린샷을 GPT-4o mini Vision으로 분석
 * 데스크탑처럼 큰 화면은 detail: 'low'로 토큰 절약
 */
async function analyzeScreenshot(screenshotBuffer, device, url) {
  const base64 = screenshotBuffer.toString('base64');
  const detail = device.width >= 1920 ? 'low' : 'high';

  const prompt = `당신은 웹 UI/UX 품질 검수 전문가입니다.
아래 스크린샷은 "${url}" 페이지를 [${device.name} / ${device.width}×${device.height}px] 환경에서 캡처한 것입니다.

다음 항목을 검토하고 이슈 여부를 판단해주세요:
1. 텍스트·버튼·이미지가 서로 겹치거나 잘림
2. 요소가 화면 밖으로 삐져나가거나 오른쪽이 잘림
3. 레이아웃이 의도치 않게 무너지거나 비어 보임
4. 이미지 비율이 찌그러지거나 늘어남
5. 버튼·링크 영역이 너무 작아 터치/클릭하기 어려움
6. 이 기기 사이즈에서 전반적으로 어색하거나 비정상적인 UI

반드시 아래 형식으로만 답변하세요:
- 이슈 없음: 첫 줄에 정확히 "이슈 없음" 이라고만 작성
- 이슈 있음: 번호 목록으로 이슈를 간결하게 나열 (한 줄에 하나, 최대 5개)`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${base64}`, detail },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return res.choices[0].message.content.trim();
}

module.exports = { analyzeScreenshot };
