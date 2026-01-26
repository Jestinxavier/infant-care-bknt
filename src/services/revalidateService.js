// Using native fetch (available in Node.js 18+)

/**
 * Trigger revalidation on the frontend
 * @param {Object} options
 * @param {string} [options.type] - Resource type (product, category, etc.)
 * @param {string} [options.resource] - Resource identifier (slug, id)
 * @param {string} [options.tag] - Specific tag to revalidate
 */
const triggerRevalidation = async ({ type, resource, tag }) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL;
    const revalidateKey = process.env.NEXT_REVALIDATE_KEY;

    if (!frontendUrl || !revalidateKey) {
      console.warn(
        "⚠️ [Revalidation] Missing FRONTEND_URL or NEXT_REVALIDATE_KEY variables. Skipping revalidation.",
      );
      return;
    }

    const params = new URLSearchParams();
    params.append("key", revalidateKey);
    if (type) params.append("type", type);
    if (resource) params.append("resource", resource);
    if (tag) params.append("tag", tag);

    const url = `${frontendUrl}/api/revalidate?${params.toString()}`;

    console.log(`🔄 [Revalidation] Triggering revalidation: ${url}`);

    // Using native fetch (Node.js 18+)
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const body = await response.text();
      console.error(`❌ [Revalidation] Failed: ${response.status} ${body}`);
    } else {
      const data = await response.json();
      console.log("✅ [Revalidation] Success:", data);
    }
  } catch (error) {
    console.error(
      "❌ [Revalidation] Error triggering revalidation:",
      error.message,
    );
  }
};

module.exports = { triggerRevalidation };
