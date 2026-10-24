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
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ppt', 'pptx'].includes(ext)) return announce('Please choose a PowerPoint file (.ppt or .pptx).');
  if (file.size > 100 * 1024 * 1024) return announce('This file is larger than the 100 MB limit.');
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = readableSize(file.size);
  fileCard.hidden = false;
  document.querySelector('#drop-title').textContent = 'PowerPoint ready';
  document.querySelector('#drop-subtitle').innerHTML = 'Choose another file <span>or drop it here</span>';
  document.querySelector('#preview-deck').textContent = file.name;
  refreshPreview();
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
  selectedFile = null; input.value = ''; fileCard.hidden = true;
  document.querySelector('#drop-title').textContent = 'Drop your PowerPoint here';
  document.querySelector('#drop-subtitle').innerHTML = 'or <span>browse files</span> from your computer';
  document.querySelector('#preview-deck').textContent = 'No file uploaded';
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
  if (!selectedFile) { announce('Add a PowerPoint deck to continue.'); dropzone.scrollIntoView({behavior:'smooth', block:'center'}); return; }
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
      source_deck: selectedFile.name, source_deck_size_bytes: selectedFile.size,
      correction_target: approvedRevision === null ? null : correctionRevisions[approvedRevision].target,
      approved_correction: approvedRevision === null ? null : correctionRevisions[approvedRevision],
      created_at: new Date().toISOString(), status: 'Ready for production handoff',
      note: 'This package contains the original deck and production instructions. It does not contain edited slides.'
    };
    const reqMd = `# ${brief.project}\n\n## Production request\n\n${brief.requirements}\n\n## Project details\n- Audience: ${brief.audience}\n- Target length: ${brief.target_slide_count}\n- Requested output: ${brief.output_format}\n- Deadline: ${brief.deadline}\n- Source deck: ${brief.source_deck}\n\n## Handoff status\nReady for production. This package contains the original deck and instructions; slides have not yet been edited.\n`;
    const files = [
      {name:selectedFile.name, data:new Uint8Array(await selectedFile.arrayBuffer())},
      {name:'production-brief.json', data:new TextEncoder().encode(JSON.stringify(brief, null, 2))},
      {name:'production-brief.md', data:new TextEncoder().encode(reqMd)},
      ...(correctionRevisions.length ? [
        {name:'correction-rounds.json', data:new TextEncoder().encode(JSON.stringify({target:correctionRevisions[approvedRevision].target, approved_revision:approvedRevision+1, revisions:correctionRevisions}, null, 2))},
        {name:'approved-correction.md', data:new TextEncoder().encode(`# Approved correction · ${correctionRevisions[approvedRevision].target}\n\n## Before\n\n${correctionRevisions[approvedRevision].original}\n\n## Approved wording\n\n${correctionRevisions[approvedRevision].text}\n\n## Request\n\n${correctionRevisions[approvedRevision].request || 'Edited directly by the user'}\n\nThis is an approved wording change for the named part only. The uploaded PowerPoint file remains unchanged in this handoff.\n`)}
      ] : []),
      {name:'README.txt', data:new TextEncoder().encode('SLIDEFORM PRODUCTION HANDOFF\n\nThis ZIP contains your original PowerPoint, production-brief.json, and a readable production-brief.md.\n\nIt is ready to pass to a presentation designer or a connected slide-generation service. The deck has not been edited by this website.\n')}
    ];
    const zip = makeZip(files); const url = URL.createObjectURL(zip); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${title.value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'slideform'}-handoff.zip`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000); button.querySelector('span:first-child').textContent = 'Package downloaded'; announce('Your production handoff package is ready.');
    setTimeout(() => { button.querySelector('span:first-child').textContent = 'Package my brief'; button.disabled = false; }, 1800);
  } catch (error) { console.error(error); announce('Could not create the package. Please try again.'); button.querySelector('span:first-child').textContent = 'Package my brief'; button.disabled = false; }
});
refreshPreview();
