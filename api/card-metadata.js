import { getCardMetadata } from "./_limitless.js";

export default async function handler(req, res) {
  try {
    const host = req.headers.host || "localhost";
    const protocol = host.includes("localhost") ? "http" : "https";
    const data = await getCardMetadata(`${protocol}://${host}${req.url}`);

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
