// Pluggable image providers for img2img / ControlNet-style repainting.
// Each takes { png: Buffer, prompt, seed, size, cfg } and returns a PNG/JPEG/WebP Buffer of the painted tile.
// API keys come from .env (never committed).

async function postJSON(url, body, headers) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url.split("?")[0]} -> ${r.status} ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

export const providers = {
  // No AI, no cost: returns the base render unchanged. Only for testing the render -> cache -> mosaic chain.
  async identity({ png }) { return png; },

  // Google Gemini image model (image + text -> image). Seed is passed through generationConfig.
  async gemini({ png, prompt, seed, cfg }) {
    const key = process.env[cfg.env];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`;
    const j = await postJSON(url, {
      contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "image/png", data: png.toString("base64") } }] }],
      generationConfig: { responseModalities: ["IMAGE"], seed, temperature: 0.4 },
    }, { "x-goog-api-key": key });
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    const data = part?.inlineData?.data || part?.inline_data?.data;
    if (!data) throw new Error("gemini: no image in response " + JSON.stringify(j).slice(0, 300));
    return Buffer.from(data, "base64");
  },

  // OpenAI gpt-image edits endpoint. No seed parameter exists; determinism comes from the cache.
  async openai({ png, prompt, size, cfg }) {
    const key = process.env[cfg.env];
    const form = new FormData();
    form.append("model", cfg.model);
    form.append("prompt", prompt);
    form.append("size", `${size}x${size}`);
    if (cfg.quality) form.append("quality", cfg.quality);
    form.append("image[]", new Blob([png], { type: "image/png" }), "tile.png");
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) throw new Error(`openai -> ${r.status} ${(await r.text()).slice(0, 400)}`);
    const j = await r.json();
    return Buffer.from(j.data[0].b64_json, "base64");
  },

  // Replicate: FLUX + Canny control (keeps edges/geometry), fixed seed.
  async replicate({ png, prompt, seed, cfg }) {
    const key = process.env[cfg.env];
    const j = await postJSON(`https://api.replicate.com/v1/models/${cfg.model}/predictions`, {
      input: { control_image: `data:image/png;base64,${png.toString("base64")}`, prompt, seed, steps: 28, guidance: 25, output_format: "png" },
    }, { authorization: `Bearer ${key}`, prefer: "wait=60" });
    let pred = j;
    while (pred.status && !["succeeded", "failed", "canceled"].includes(pred.status)) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(pred.urls.get, { headers: { authorization: `Bearer ${key}` } });
      pred = await r.json();
    }
    if (pred.status !== "succeeded") throw new Error("replicate: " + (pred.error || pred.status));
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return Buffer.from(await (await fetch(out)).arrayBuffer());
  },
};
