import { getStandardFormats } from "./_limitless.js";

export default async function handler(req, res) {
  try {
    const data = await getStandardFormats();

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
