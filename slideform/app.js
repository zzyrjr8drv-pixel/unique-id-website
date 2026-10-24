const input = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const fileCard = document.querySelector('#file-card');
const fileName = document.querySelector('#file-name');
const fileSize = document.querySelector('#file-size');
const toast = document.querySelector('#toast');
let selectedFile = null;
let toastTimer;
let correctionRevisions = [];
let approvedRevision = null;
let noteText = '';
let noteTitle = '';
let noteReadToken = 0;

function readableSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function setFile(file) {
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) return announce('This file is larger than the 100 MB limit.');
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = readableSize(file.size);
  document.querySelector('#file-icon').textContent = (file.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
  fileCard.hidden = false;
  document.querySelector('#drop-title').textContent = 'Document ready';
  document.querySelector('#drop-subtitle').innerHTML = 'Choose another file <span>or drop it here</span>';
  document.querySelector('#preview-deck').textContent = file.name;
  refreshPreview();
  readNoteForSlideDraft(file);
}

function noteExtension(file) { return (file.name.split('.').pop() || '').toLowerCase(); }
function splitNoteIntoSections(value) {
  const paragraphs = value.replace(/\r/g, '').trim().split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  return paragraphs.map(part => {
    const lines = part.split('\n').map(line => line.trim()).filter(Boolean);
    let title = '', body = part;
    if (/^#{1,6}\s/.test(lines[0])) { title = lines[0].replace(/^#+\s*/, ''); body = lines.slice(1).join('\n'); }
    else if (lines.length > 1 && [...lines[0]].length < 90 && !/^[-*•\d]/.test(lines[0])) { title = lines[0]; body = lines.slice(1).join('\n'); }
    if (!title) {
      const lead = body.split(/(?<=[.!?。！？])\s+/u)[0] || body;
      title = [...lead].length > 68 ? [...lead].slice(0, 65).join('') + '…' : lead.replace(/[.!?。！？]$/, '');
      body = body.slice(lead.length).trim() || lead;
    }
    return {title: title || 'Key point', body};
  }).filter(section => section.title || section.body);
}
async function extractNoteText(file) {
  const ext = noteExtension(file);
  if (file.size > 100 * 1024 * 1024) throw new Error('This file is larger than the 100 MB limit.');
  if (['txt','md','csv','tsv','json','xml'].includes(ext)) return file.text();
  if (['html','htm'].includes(ext)) {
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach(node => node.remove());
    return doc.body.innerText || doc.body.textContent || '';
  }
  if (ext === 'rtf') return file.text().then(text => text.replace(/\\par\b/g, '\n').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, ''));
  const data = await file.arrayBuffer();
  if (ext === 'docx') {
    if (!window.mammoth) throw new Error('The Word reader is still loading. Try again in a moment.');
    return (await window.mammoth.extractRawText({arrayBuffer:data})).value;
  }
  if (ext === 'pdf') {
    if (!window.pdfjsLib) throw new Error('The PDF reader is still loading. Try again in a moment.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({data}).promise, pages = [];
    for (let i=1; i<=pdf.numPages; i++) { const page=await pdf.getPage(i), text=await page.getTextContent(); pages.push(text.items.map(item=>item.str).filter(Boolean).join(' ')); }
    return pages.join('\n\n');
  }
  if (ext === 'pptx') {
    if (!window.JSZip) throw new Error('The PowerPoint reader is still loading. Try again in a moment.');
    const zip=await window.JSZip.loadAsync(data), names=Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a,b)=>Number(a.match(/slide(\d+)/i)[1])-Number(b.match(/slide(\d+)/i)[1])), slides=[];
    for (const name of names) { const xml=new DOMParser().parseFromString(await zip.file(name).async('string'),'application/xml'); const text=[...xml.getElementsByTagName('*')].filter(node=>node.localName==='t').map(node=>node.textContent).filter(Boolean).join(' '); if(text.trim()) slides.push(text.trim()); }
    return slides.join('\n\n');
  }
  if (['xlsx','xls'].includes(ext)) {
    if (!window.XLSX) throw new Error('The spreadsheet reader is still loading. Try again in a moment.');
    const book=window.XLSX.read(data); return book.SheetNames.map(name=>`# ${name}\n${window.XLSX.utils.sheet_to_csv(book.Sheets[name])}`).join('\n\n');
  }
  throw new Error('This file can still be packaged, but automatic text reading supports DOCX, PDF, PPTX, XLS/XLSX, CSV/TSV, TXT/MD, RTF, HTML, JSON, and XML.');
}
async function readNoteForSlideDraft(file) {
  const panel=document.querySelector('#note-draft'), status=document.querySelector('#note-draft-status'), preview=document.querySelector('#note-draft-preview'), button=document.querySelector('#continue-to-builder');
  const token=++noteReadToken; noteText=''; noteTitle=file.name.replace(/\.[^.]+$/, ''); panel.hidden=false; button.disabled=true; preview.innerHTML=''; status.textContent='Reading your note…';
  try {
    const text=(await extractNoteText(file)).trim();
    if (token!==noteReadToken) return;
    if (!text) throw new Error('No selectable text found. Scanned or image-only documents need OCR.');
    noteText=text.slice(0, 900000); const sections=splitNoteIntoSections(noteText);
    if (!sections.length) throw new Error('No usable text sections were found in this file.');
    preview.innerHTML=sections.slice(0,5).map((section,index)=>`<li><b>${escapeHTML(section.title)}</b><span>${escapeHTML(section.body.slice(0,190))}${section.body.length>190?'…':''}</span></li>`).join('');
    document.querySelector('#note-draft-title').textContent=`Draft outline · ${sections.length} ${sections.length===1?'section':'sections'}`;
    document.querySelector('#note-draft-copy').textContent=`We found ${text.length.toLocaleString()} characters and organized them into an editable outline. ${sections.length>5?`Showing the first 5 of ${sections.length} sections.`:'Review it in the deck builder before exporting.'}`;
    status.textContent='Note ready'; button.disabled=false;
  } catch(error) {
    if (token!==noteReadToken) return;
    status.textContent='Could not read note text'; document.querySelector('#note-draft-copy').textContent=error.message || 'This file can still be packaged with your brief.'; preview.innerHTML='';
  }
}

function refreshPreview() {
  const title = document.querySelector('#project-title').value.trim();
  const audience = document.querySelector('#audience').value.trim();
  const requirements = document.querySelector('#requirements').value.trim();
  const format = document.querySelector('#output-format').value;
  document.querySelector('#preview-project').textContent = title || 'Untitled project';
  document.querySelector('#preview-audience').textContent = audience || 'Audience not set';
  document.querySelector('#preview-format').textContent = format;
  document.querySelector('#preview-request').textContent = requirements || 'Your requirements will appear here as you write them.';
  document.querySelector('#preview-title').innerHTML = title ? escapeHTML(title).replace(/\s+/g, '<br>') : 'Your next<br>great deck.';
  document.querySelector('#char-count').textContent = `${document.querySelector('#requirements').value.length.toLocaleString()} / 5,000`;
  document.querySelector('#preview-date').textContent = document.querySelector('#deadline').value || '';
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

input.addEventListener('change', () => setFile(input.files[0]));
for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.add('dragover'); });
for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove('dragover'); });
dropzone.addEventListener('drop', event => setFile(event.dataTransfer.files[0]));
dropzone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
document.querySelector('#remove-file').addEventListener('click', () => {
  noteReadToken++; noteText=''; document.querySelector('#note-draft').hidden=true;
  selectedFile = null; input.value = ''; fileCard.hidden = true;
  document.querySelector('#drop-title').textContent = 'Drop your document here';
  document.querySelector('#drop-subtitle').innerHTML = 'or <span>browse files</span> from your computer';
  document.querySelector('#preview-deck').textContent = 'No file uploaded';
});
document.querySelector('#continue-to-builder').addEventListener('click', () => {
  if (!noteText) return;
  try {
    const selected=document.querySelector('#slide-count').value;
    const slideLimit=selected==='Keep the current length'?6:selected==='5–8 slides'?8:selected==='9–12 slides'?12:selected==='13–18 slides'?18:30;
    localStorage.setItem('slideform-note-draft',JSON.stringify({title:document.querySelector('#project-title').value.trim()||noteTitle,content:noteText,slideLimit,sourceName:selectedFile?.name||''}));
    window.location.href='../deck-maker/';
  } catch(error) { announce('Could not transfer the draft. Open the published site and try again.'); }
});
document.querySelectorAll('.field-group input, .field-group textarea, .field-group select').forEach(control => control.addEventListener('input', refreshPreview));
document.querySelectorAll('.field-group select').forEach(control => control.addEventListener('change', refreshPreview));

function updateCorrectionPreview() {
  const draft = document.querySelector('#correction-draft').value;
  document.querySelector('#correction-preview').textContent = draft || 'Your corrected wording will appear here.';
  if (approvedRevision !== null && draft !== correctionRevisions[approvedRevision]?.text) {
    approvedRevision = null;
    document.querySelector('#correction-status').textContent = 'Draft changed after approval. Save and approve the revised version again.';
  }
}

function invalidateApprovalIfChanged() {
  if (approvedRevision === null) return;
  const approved = correctionRevisions[approvedRevision];
  const same = approved && approved.target === document.querySelector('#correction-target').value.trim()
    && approved.original === document.querySelector('#correction-original').value
    && approved.text === document.querySelector('#correction-draft').value
    && approved.request === document.querySelector('#correction-request').value.trim();
  if (!same) {
    approvedRevision = null;
    document.querySelector('#correction-status').textContent = 'Correction details changed after approval. Save and approve the new version again.';
    renderRevisions();
  }
}

function applyCorrectionRequest() {
  const original = document.querySelector('#correction-original').value;
  const request = document.querySelector('#correction-request').value.trim();
  if (!original.trim() || !request) return announce('Add the current wording and a correction request first.');
  let updated = original;
  const replacement = request.match(/把?[「『“"]([^」』”"]+)[」』”"]\s*(?:改成|改為|替換成|替换成|換成|换成)\s*[「『“"]([^」』”"]+)[」』”"]/);
  const englishReplacement = request.match(/replace\s+["'](.+?)["']\s+with\s+["'](.+?)["']/i);
  const remove = request.match(/(?:刪除|删除|移除)\s*[「『“"]([^」』”"]+)[」』”"]/);
  if (replacement || englishReplacement) {
    const [, before, after] = replacement || englishReplacement;
    if (!updated.includes(before)) return announce('That exact wording is not in the selected part. Check the text and try again.');
    updated = updated.replace(before, after);
  } else if (remove) {
    if (!updated.includes(remove[1])) return announce('That exact wording is not in the selected part. Check the text and try again.');
    updated = updated.replace(remove[1], '');
  } else {
    return announce('For automatic Chinese/English correction, use the shown “replace X with Y” format. You can also edit the draft directly.');
  }
  document.querySelector('#correction-draft').value = updated;
  updateCorrectionPreview();
  document.querySelector('#correction-status').textContent = 'Preview updated for the selected wording only. Save it to keep this revision.';
}

function renderRevisions() {
  const list = document.querySelector('#revision-list');
  list.innerHTML = correctionRevisions.map((revision, index) => `<li>Revision ${index + 1}${approvedRevision === index ? ' · approved' : ''} — ${escapeHTML(revision.text.slice(0, 95))}</li>`).join('');
}

function saveRevision() {
  const target = document.querySelector('#correction-target').value.trim();
  const original = document.querySelector('#correction-original').value;
  const text = document.querySelector('#correction-draft').value;
  if (!target || !original.trim() || !text.trim()) return announce('Add the target part, current wording, and a correction draft first.');
  correctionRevisions.push({target, original, text, request:document.querySelector('#correction-request').value.trim(), saved_at:new Date().toISOString()});
  approvedRevision = null;
  document.querySelector('#correction-status').textContent = `Revision ${correctionRevisions.length} saved. Keep refining, or approve this version.`;
  renderRevisions();
}

document.querySelector('#apply-correction').addEventListener('click', applyCorrectionRequest);
document.querySelector('#correction-draft').addEventListener('input', updateCorrectionPreview);
['#correction-target', '#correction-original', '#correction-request', '#correction-draft'].forEach(selector => document.querySelector(selector).addEventListener('input', invalidateApprovalIfChanged));
document.querySelector('#correction-original').addEventListener('input', event => {
  const draft = document.querySelector('#correction-draft');
  if (!draft.value || correctionRevisions.length === 0) { draft.value = event.target.value; updateCorrectionPreview(); }
});
document.querySelector('#save-revision').addEventListener('click', saveRevision);
document.querySelector('#approve-revision').addEventListener('click', () => {
  if (correctionRevisions.length === 0 || correctionRevisions.at(-1).text !== document.querySelector('#correction-draft').value) saveRevision();
  if (correctionRevisions.length === 0) return;
  approvedRevision = correctionRevisions.length - 1;
  document.querySelector('#correction-status').textContent = `Revision ${approvedRevision + 1} approved. You can still make another change; the new draft will need approval.`;
  renderRevisions();
});

// Small ZIP writer using the uncompressed ZIP format, so the package works offline without a service or library.
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function makeZip(files) {
  const encoder = new TextEncoder(); const local = []; const central = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name); const data = file.data; const crc = crc32(data); const l = new Uint8Array(30 + name.length); const lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); l.set(name, 30); local.push(l, data);
    const c = new Uint8Array(46 + name.length); const cv = new DataView(c.buffer); cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); c.set(name, 46); central.push(c); offset += l.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], {type:'application/zip'});
}

function dateString(value) { return value || 'Not specified'; }
document.querySelector('#package-button').addEventListener('click', async event => {
  const title = document.querySelector('#project-title'); const requirements = document.querySelector('#requirements');
  title.classList.remove('field-error'); requirements.classList.remove('field-error');
  if (!selectedFile) { announce('Add a document to continue.'); dropzone.scrollIntoView({behavior:'smooth', block:'center'}); return; }
  if (!title.value.trim()) { title.classList.add('field-error'); title.focus(); announce('Give your project a name to continue.'); return; }
  if (!requirements.value.trim()) { requirements.classList.add('field-error'); requirements.focus(); announce('Add your requirements so the handoff has clear direction.'); return; }
  const currentDraft = document.querySelector('#correction-draft').value;
  const originalWording = document.querySelector('#correction-original').value;
  const correctionStarted = document.querySelector('#correction-request').value.trim() || (currentDraft.trim() && currentDraft !== originalWording);
  if (correctionStarted && (approvedRevision === null || !correctionRevisions[approvedRevision])) { announce('Save and approve your latest correction before packaging it.'); document.querySelector('#correction-studio').scrollIntoView({behavior:'smooth',block:'center'}); return; }
  const button = event.currentTarget; button.disabled = true; button.querySelector('span:first-child').textContent = 'Preparing package…';
  try {
    const brief = {
      project: title.value.trim(), audience: document.querySelector('#audience').value.trim() || 'Not specified',
      target_slide_count: document.querySelector('#slide-count').value,
      output_format: document.querySelector('#output-format').value,
      deadline: dateString(document.querySelector('#deadline').value), requirements: requirements.value.trim(),
      source_file: selectedFile.name, source_file_size_bytes: selectedFile.size,
      correction_target: approvedRevision === null ? null : correctionRevisions[approvedRevision].target,
      approved_correction: approvedRevision === null ? null : correctionRevisions[approvedRevision],
      created_at: new Date().toISOString(), status: 'Ready for production handoff',
      note: 'This package contains the original deck and production instructions. It does not contain edited slides.'
    };
    const reqMd = `# ${brief.project}\n\n## Production request\n\n${brief.requirements}\n\n## Project details\n- Audience: ${brief.audience}\n- Target length: ${brief.target_slide_count}\n- Requested output: ${brief.output_format}\n- Deadline: ${brief.deadline}\n- Source file: ${brief.source_file}\n\n## Handoff status\nReady for production. This package contains the original file and instructions; the source has not been edited.\n`;
    const files = [
      {name:selectedFile.name, data:new Uint8Array(await selectedFile.arrayBuffer())},
      {name:'production-brief.json', data:new TextEncoder().encode(JSON.stringify(brief, null, 2))},
      {name:'production-brief.md', data:new TextEncoder().encode(reqMd)},
      ...(correctionRevisions.length ? [
        {name:'correction-rounds.json', data:new TextEncoder().encode(JSON.stringify({target:correctionRevisions[approvedRevision].target, approved_revision:approvedRevision+1, revisions:correctionRevisions}, null, 2))},
        {name:'approved-correction.md', data:new TextEncoder().encode(`# Approved correction · ${correctionRevisions[approvedRevision].target}\n\n## Before\n\n${correctionRevisions[approvedRevision].original}\n\n## Approved wording\n\n${correctionRevisions[approvedRevision].text}\n\n## Request\n\n${correctionRevisions[approvedRevision].request || 'Edited directly by the user'}\n\nThis is an approved wording change for the named part only. The uploaded PowerPoint file remains unchanged in this handoff.\n`)}
      ] : []),
      {name:'README.txt', data:new TextEncoder().encode('SLIDEFORM PRODUCTION HANDOFF\n\nThis ZIP contains your original file, production-brief.json, and a readable production-brief.md.\n\nIt is ready to pass to a presentation designer or a connected document-generation service. The source file has not been edited by this website.\n')}
    ];
    const zip = makeZip(files); const url = URL.createObjectURL(zip); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${title.value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'slideform'}-handoff.zip`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000); button.querySelector('span:first-child').textContent = 'Package downloaded'; announce('Your production handoff package is ready.');
    setTimeout(() => { button.querySelector('span:first-child').textContent = 'Package my brief'; button.disabled = false; }, 1800);
  } catch (error) { console.error(error); announce('Could not create the package. Please try again.'); button.querySelector('span:first-child').textContent = 'Package my brief'; button.disabled = false; }
});
refreshPreview();
