// PDF extraction using PDF.js from CDN (loaded dynamically).
// Keeps the app “static-host friendly”.

export async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return;

  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js";
  script.async = true;

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // Worker
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
}

export async function extractTextFromPdfFile(file, onProgress = () => {}) {
  await ensurePdfJsLoaded();

  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join(" ");
    fullText += `\n\n[${file.name} | page ${i}]\n` + pageText;
    onProgress({ page: i, total: pdf.numPages, file: file.name });
  }

  return fullText.trim();
}
