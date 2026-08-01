// Vercel 서버리스 함수: Gemini Vision으로 단어장 이미지 → 단어-뜻 목록 추출
// API 키는 Vercel 환경변수 GEMINI_API_KEY 에만 저장됨 (코드/깃허브에 노출 안 됨)

async function readJson(req){
  if(req.body){ return typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  const chunks=[]; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async (req, res) => {
  if(req.method !== "POST"){ res.status(405).json({ error: "POST only" }); return; }

  const key = process.env.GEMINI_API_KEY;
  if(!key){ res.status(500).json({ error: "GEMINI_API_KEY가 설정되지 않았습니다 (Vercel 환경변수)" }); return; }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try{
    const { image, mime } = await readJson(req);
    if(!image){ res.status(400).json({ error: "image(base64)가 필요합니다" }); return; }

    const prompt = [
      "이 이미지는 영어 단어장 페이지입니다. 아래 규칙을 반드시 지켜서 추출하세요.",
      "1) 각 항목의 '메인 표제어'(굵은 글씨의 큰 영어 단어)만 뽑습니다.",
      "2) 각 표제어의 한글 뜻은 앞에서부터 최대 2개 의미만 뽑습니다(뜻이 1., 2., 3.처럼 여러 개면 1번과 2번 의미까지만, 쉼표로 구분).",
      "3) 다음은 전부 제외: 예문(영어 문장), 발음기호([...]), 품사표시(명/형/동 등), 손글씨 낙서, '+'로 표시된 파생어/관련어, 예문 속 단어.",
      "4) 뜻을 알 수 없으면 ko는 빈 문자열로 둡니다.",
      "5) 반드시 JSON 배열만 출력합니다. 형식 예: [{\"en\":\"society\",\"ko\":\"사회, 협회\"}]"
    ].join("\n");

    const body = {
      contents: [{ parts: [ { text: prompt }, { inline_data: { mime_type: mime || "image/jpeg", data: image } } ] }],
      generationConfig: { temperature: 0, response_mime_type: "application/json" }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();

    if(!r.ok){
      res.status(502).json({ error: "Gemini API 오류", detail: data && data.error ? data.error.message : data });
      return;
    }

    let text = "";
    try{ text = data.candidates[0].content.parts.map(p => p.text || "").join(""); }catch(e){ text = "[]"; }

    let pairs = [];
    try{ pairs = JSON.parse(text); }catch(e){
      const m = text.match(/\[[\s\S]*\]/);          // 혹시 앞뒤 텍스트가 붙은 경우 배열만 추출
      if(m){ try{ pairs = JSON.parse(m[0]); }catch(e2){ pairs = []; } }
    }
    if(!Array.isArray(pairs)) pairs = [];

    const clean = pairs
      .map(p => ({ en: String(p.en || "").trim().toLowerCase(), ko: String(p.ko || "").trim() }))
      .filter(p => p.en);

    res.status(200).json({ pairs: clean });
  }catch(e){
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
