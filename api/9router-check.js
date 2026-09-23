export default async function handler(req, res) {
  const baseUrl = process.env.NINEROUTER_URL
    ?.trim()
    .replace(/\/+$/, "");

  const apiKey = process.env.NINEROUTER_API_KEY?.trim();

  if (!baseUrl) {
    return res.status(500).json({
      ok: false,
      error: "NINEROUTER_URL is missing"
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "NINEROUTER_API_KEY is missing"
    });
  }

  try {
    const response = await fetch(
      `${baseUrl}/v1/models/image`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        upstreamStatus: response.status,
        upstreamResponse: data
      });
    }

    const models =
      data?.data?.map(model => model.id) ?? [];

    return res.status(200).json({
      ok: true,
      message: "Vercel can reach 9Router",
      modelCount: models.length,
      models
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}