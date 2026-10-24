# Deckcraft

Deckcraft turns pasted content or text extracted from a document into an editable PowerPoint in the browser. The person making the deck chooses the style, the story flow, and a maximum length, then reviews and edits each slide before exporting.

## Run it

Open `index.html` in a current browser. The PowerPoint export library loads from jsDelivr with an unpkg fallback, so exporting needs an internet connection. The presentation content is processed in the browser and is not uploaded.

## What it includes

- Four styles: Studio, Editorial, Midnight, and Fieldnotes.
- Four story-flow directions and a manual-order option.
- Import text from PDF, DOCX, PPTX, XLSX/XLS, CSV/TSV, TXT, Markdown, RTF, HTML, JSON, and XML. Scanned PDFs and image-only slide text need OCR and cannot be extracted here.
- Selectable maximum slide count from 4 through 30. The planner splits long sections, joins a short heading to its supporting point, and does not create blank slides to reach the maximum.
- An automatic first-pass content check that flags near-duplicates, headings without detail, short fragments, and long sections. This is a local writing heuristic, not a guarantee of editorial quality; you make the final call.
- Live slide preview and downloadable editable `.pptx` output.

Document text extraction and the slide arrangement run in your browser. There is no AI rewrite step. Chinese text is kept as supplied and uses a Chinese-capable font setting in the PowerPoint. Import libraries and the PowerPoint export library load from public CDNs, so an internet connection is needed.
