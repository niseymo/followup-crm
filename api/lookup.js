import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a knowledgeable furniture sales assistant with deep expertise in home furnishings. You help retail sales associates quickly look up product details, answer customer questions, and provide helpful guidance.

You know about:
- Furniture styles (mid-century modern, traditional, contemporary, farmhouse, Scandinavian, etc.)
- Materials (solid wood species, engineered wood, upholstery fabrics, leather grades, metals, etc.)
- Construction quality indicators (dovetail joints, eight-way hand-tied springs, frame materials, etc.)
- Care and maintenance instructions for different materials
- Typical dimensions and sizing guidance for rooms
- Price tiers and what to expect at each level
- Common customer concerns and how to address them
- Sofa/sectional configurations, bed frame sizes, dining set capacities
- Mattress types (innerspring, memory foam, hybrid, latex) and sleep preferences
- Bedroom sets, dining sets, home office furniture, outdoor furniture
- Accent pieces, storage solutions, shelving

Keep responses concise and practical — a sales associate needs quick, useful answers they can share with a customer on the floor. Use bullet points for lists. If asked about a specific product you don't have details on, give general guidance for that category.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "Query is required" });
  }

  if (query.trim().length > 500) {
    return res.status(400).json({ error: "Query too long (max 500 characters)" });
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: query.trim() }],
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return res.status(200).json({ answer: text });
  } catch (err) {
    console.error("Claude API error:", err);
    return res.status(500).json({ error: "Lookup failed. Please try again." });
  }
}
