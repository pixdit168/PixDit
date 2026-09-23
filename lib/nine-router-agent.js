export class NineRouterCreativeAgent {
  constructor(options = {}) {
    this.apiBase = String(
      options.apiBase ||
      process.env.NINEROUTER_URL ||
      ""
    )
      .trim()
      .replace(/\/+$/, "");

    this.apiKey = String(
      options.apiKey ||
      process.env.NINEROUTER_API_KEY ||
      ""
    ).trim();

    this.model = String(
      options.model ||
      process.env.NINEROUTER_AGENT_MODEL ||
      "oc/muse-spark-1.3-contributor-free"
    ).trim();

    this.fetch = options.fetchImpl || globalThis.fetch;
  }

  get endpoint() {
    const base = /\/v1$/i.test(this.apiBase)
      ? this.apiBase
      : `${this.apiBase}/v1`;

    return `${base}/chat/completions`;
  }

  get configured() {
    return Boolean(
      this.apiBase &&
      this.apiKey &&
      this.model
    );
  }

  async createVisualBrief(input) {
    if (!this.configured) {
      throw new Error(
        "NineRouter creative agent belum dikonfigurasi."
      );
    }

    const userPrompt = String(
      input.prompt || ""
    ).trim();

    const systemPrompt = `
You are Layera Creative Director.

Your job is to transform a user's advertising idea into
a strong image-generation visual brief.

Do NOT write slogans or text that should appear in the image.

Return ONLY valid JSON with this structure:

{
  "visualBrief": "...",
  "subject": "...",
  "audience": "...",
  "environment": "...",
  "composition": "...",
  "lighting": "...",
  "mood": "...",
  "copyZone": "...",
  "negativePrompt": "..."
}

Rules:
- Preserve the user's actual business and product.
- Do not invent another industry.
- Prefer commercial advertising photography.
- Images must contain no text, logo, letters, watermark,
  captions, labels, or UI.
- Create a useful empty area for later marketing copy.
- Be specific about camera, composition and lighting.
`.trim();

    const response = await this.fetch(
      this.endpoint,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: this.model,
          stream: false,

          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: JSON.stringify({
                prompt: userPrompt,
                category: input.category || "",
                style: input.style || "",
                format: input.format || "",
                primaryColor:
                  input.primaryColor || "",
              }),
            },
          ],
        }),
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Creative agent gagal (${response.status}): ${text.slice(0, 300)}`
      );
    }

    const data = JSON.parse(text);

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Creative agent tidak mengembalikan respons."
      );
    }

    return this.parseResponse(content);
  }

  parseResponse(content) {
    let clean = String(content).trim();

    clean = clean
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");

    try {
      return JSON.parse(clean);
    } catch {
      return {
        visualBrief: clean,
        subject: "",
        audience: "",
        environment: "",
        composition: "",
        lighting: "",
        mood: "",
        copyZone: "",
        negativePrompt: "",
      };
    }
  }
}