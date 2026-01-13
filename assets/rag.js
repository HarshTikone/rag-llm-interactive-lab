// RAG core: chunking, TF-IDF keyword search, optional vector embeddings (Transformers.js),
// and Hybrid retrieval using Reciprocal Rank Fusion (RRF).

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function chunkText(text, { chunkSizeWords = 220, overlapWords = 40 }) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let start = 0;
  let id = 0;

  while (start < words.length) {
    const end = Math.min(words.length, start + chunkSizeWords);
    const chunkWords = words.slice(start, end);
    const chunk = chunkWords.join(" ");
    chunks.push({
      id: id++,
      text: chunk,
      meta: { startWord: start, endWord: end }
    });
    if (end === words.length) break;
    start = Math.max(0, end - overlapWords);
  }

  return chunks;
}

// ---------- Keyword TF-IDF ----------
export class TfIdfIndex {
  constructor(chunks) {
    this.chunks = chunks;
    this.df = new Map();
    this.idf = new Map();
    this.vectors = []; // sparse maps term->tfidf
    this.norms = [];
    this.vocab = new Set();
  }

  build() {
    const docsTokens = this.chunks.map((c) => {
      const toks = tokenize(c.text);
      const seen = new Set(toks);
      for (const t of seen) this.df.set(t, (this.df.get(t) || 0) + 1);
      for (const t of toks) this.vocab.add(t);
      return toks;
    });

    const N = this.chunks.length;
    for (const term of this.vocab) {
      const df = this.df.get(term) || 0;
      // add 1 smoothing
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      this.idf.set(term, idf);
    }

    this.vectors = docsTokens.map((toks) => {
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      const vec = new Map();
      let norm2 = 0;

      for (const [t, count] of tf.entries()) {
        const w = (count / toks.length) * (this.idf.get(t) || 0);
        vec.set(t, w);
        norm2 += w * w;
      }
      this.norms.push(Math.sqrt(norm2) || 1e-9);
      return vec;
    });
  }

  search(query, topK = 5) {
    const qTokens = tokenize(query);
    const qtf = new Map();
    for (const t of qTokens) qtf.set(t, (qtf.get(t) || 0) + 1);

    const qvec = new Map();
    let qnorm2 = 0;
    for (const [t, c] of qtf.entries()) {
      const w = (c / qTokens.length) * (this.idf.get(t) || 0);
      if (w > 0) {
        qvec.set(t, w);
        qnorm2 += w * w;
      }
    }
    const qnorm = Math.sqrt(qnorm2) || 1e-9;

    const scores = this.chunks.map((chunk, i) => {
      const dvec = this.vectors[i];
      let dot = 0;
      for (const [t, qw] of qvec.entries()) {
        const dw = dvec.get(t);
        if (dw) dot += qw * dw;
      }
      const score = dot / (qnorm * this.norms[i]);
      return { chunk, score, method: "keyword" };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }
}

// ---------- Vector embeddings (optional) ----------
async function ensureTransformersLoaded() {
  if (window.__xenova_ready) return;

  // ESM import from CDN
  const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
  window.__xenova = mod;
  window.__xenova_ready = true;
}

export class VectorIndex {
  constructor(chunks) {
    this.chunks = chunks;
    this.embeddings = []; // Float32Array
    this.norms = [];
    this.embedder = null;
  }

  async build(onProgress = () => {}) {
    await ensureTransformersLoaded();
    const { pipeline } = window.__xenova;

    // Small sentence-transformer-like model (browser). First load may take time.
    this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true
    });

    this.embeddings = [];
    this.norms = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const text = this.chunks[i].text.slice(0, 2000); // keep it reasonable
      const out = await this.embedder(text, { pooling: "mean", normalize: true });
      const vec = out.data; // Float32Array
      this.embeddings.push(vec);

      // normalize already true, but keep stable
      let norm2 = 0;
      for (let j = 0; j < vec.length; j++) norm2 += vec[j] * vec[j];
      this.norms.push(Math.sqrt(norm2) || 1e-9);

      onProgress({ done: i + 1, total: this.chunks.length });
    }
  }

  async embedQuery(query) {
    if (!this.embedder) throw new Error("VectorIndex not built");
    const out = await this.embedder(query, { pooling: "mean", normalize: true });
    return out.data;
  }

  static dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  async search(query, topK = 5) {
    const q = await this.embedQuery(query);
    const qnorm = 1; // normalized
    const scored = this.chunks.map((chunk, i) => {
      const d = this.embeddings[i];
      const score = VectorIndex.dot(q, d) / (qnorm * this.norms[i]);
      return { chunk, score, method: "vector" };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

// ---------- Hybrid (RRF Fusion) ----------
export function rrfFuse(listA, listB, topK = 5, rrfK = 60) {
  // listA/listB are ranked arrays with {chunk, score}
  const rank = new Map(); // chunkId -> fusedScore
  const seen = new Map(); // chunkId -> chunk

  const add = (list) => {
    list.forEach((item, idx) => {
      const id = item.chunk.id;
      seen.set(id, item.chunk);
      const r = idx + 1;
      const inc = 1 / (rrfK + r);
      rank.set(id, (rank.get(id) || 0) + inc);
    });
  };

  add(listA);
  add(listB);

  const fused = Array.from(rank.entries())
    .map(([id, s]) => ({ chunk: seen.get(id), score: s, method: "hybrid" }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return fused;
}

export function buildContext(chunksWithScores, maxChars = 8000) {
  let ctx = "";
  for (const item of chunksWithScores) {
    const block = `\n\n[chunk:${item.chunk.id} score:${item.score.toFixed(4)}]\n${item.chunk.text}`;
    if ((ctx + block).length > maxChars) break;
    ctx += block;
  }
  return ctx.trim();
}
