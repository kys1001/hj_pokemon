// Vercel 서버리스: 기기 연동용 저장소 (Vercel KV / Upstash Redis REST)
// 환경변수 필요: KV_REST_API_URL, KV_REST_API_TOKEN (Vercel Storage에서 KV 연결 시 자동 생성)

async function readJson(req){
  if(req.body){ return typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  const chunks=[]; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
async function kv(cmd){
  const url=process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok=process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url || !tok) throw new Error("연동 저장소가 설정되지 않았습니다 (KV_REST_API_URL / KV_REST_API_TOKEN)");
  const r=await fetch(url, { method:"POST", headers:{ Authorization:"Bearer "+tok, "Content-Type":"application/json" }, body:JSON.stringify(cmd) });
  const j=await r.json();
  if(j.error) throw new Error(j.error);
  return j.result;
}
function keyFor(code){ return "hj:" + String(code).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,40); }

module.exports = async (req, res) => {
  try{
    if(req.method === "GET"){
      const code=(req.query && req.query.code) || "";
      if(!code){ res.status(400).json({ error:"code 필요" }); return; }
      const v=await kv(["GET", keyFor(code)]);
      res.status(200).json({ data: v ? JSON.parse(v) : null });
    }else if(req.method === "POST"){
      const b=await readJson(req);
      const code=b.code || "";
      if(!code){ res.status(400).json({ error:"code 필요" }); return; }
      await kv(["SET", keyFor(code), JSON.stringify(b.data || {})]);
      res.status(200).json({ ok:true });
    }else{
      res.status(405).json({ error:"GET/POST only" });
    }
  }catch(e){
    res.status(500).json({ error:String(e && e.message ? e.message : e) });
  }
};
