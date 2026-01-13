# LLM + RAG Interactive Lab (GitHub Pages)

A static, interactive learning lab for LLM + RAG concepts.
- Upload PDFs (client-side extraction)
- Chunking + overlap
- Keyword TF-IDF search
- Optional Vector search (embeddings in browser)
- Hybrid retrieval (RRF fusion)
- Trace panel: chunks + scores + prompt preview
- Optional LLM answering using an OpenAI-compatible endpoint

## Run locally
Just open `index.html` OR use VS Code Live Server.

## Deploy on GitHub Pages
1) Create a repo and push these files
2) Repo Settings → Pages → Deploy from branch → main → /(root)

Your site will be at:
https://YOUR-USERNAME.github.io/YOUR-REPO/

## Notes on LLM keys
GitHub Pages is static. If you enable LLM calls, the API key is used in-browser.
Use a temporary key and never commit keys.

## If Vector mode is slow
Vector mode loads an embedding model in-browser the first time.
Keyword mode always works and is fast.
