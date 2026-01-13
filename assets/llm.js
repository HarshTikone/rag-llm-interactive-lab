export async function testLlm({ mode, endpoint, model, apiKey }) {
  if (mode === "explain") {
    return "Explain-only mode is active. No API calls are made.";
  }
  if (!endpoint || !model || !apiKey) {
    throw new Error("Missing endpoint/model/apiKey");
  }
  // Minimal smoke test
  const payload = {
    model,
    messages: [{ role: "user", content: "Reply with: OK" }],
    temperature: 0,
    max_tokens: 16
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM test failed: ${res.status} ${txt.slice(0, 500)}`);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message?.content ?? "(no content)";
  return msg.trim();
}

export async function runCompletion({
  mode,
  endpoint,
  model,
  apiKey,
  messages,
  temperature = 0.7,
  top_p = 0.9,
  max_tokens = 512
}) {
  if (mode === "explain") {
    // No-LLM fallback: return a simple response based on provided context.
    const userMsg = messages.find((m) => m.role === "user")?.content || "";
    return (
      "Explain-only mode:\n\n" +
      "I can’t call an LLM here, but your retrieval context is shown in the Context tab.\n" +
      "Use it to answer the question manually, or enable an OpenAI-compatible endpoint.\n\n" +
      "Question:\n" + userMsg
    );
  }

  if (!endpoint || !model || !apiKey) {
    throw new Error("Missing endpoint/model/apiKey");
  }

  const payload = {
    model,
    messages,
    temperature,
    top_p,
    max_tokens
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM call failed: ${res.status} ${txt.slice(0, 700)}`);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message?.content ?? "(no content)";
  return msg;
}
