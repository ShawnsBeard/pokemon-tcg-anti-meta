import { getDeckDetails } from "../_limitless.js";

export default async function handler(req, res) {
  try {
    const host = req.headers.host || "localhost";
    const protocol = host.includes("localhost") ? "http" : "https";
    const { slug } = req.query;
    const data = await getDeckDetails(slug, `${protocol}://${host}${req.url}`);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
