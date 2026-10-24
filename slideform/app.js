const input = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const fileCard = document.querySelector('#file-card');
const fileName = document.querySelector('#file-name');
const fileSize = document.querySelector('#file-size');
const toast = document.querySelector('#toast');
let selectedFile = null;
let toastTimer;

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
  const button = event.currentTarget; button.disabled = true; button.querySelector('span:first-child').textContent = 'Preparing package…';
  try {
    const brief = {
      project: title.value.trim(), audience: document.querySelector('#audience').value.trim() || 'Not specified',
      target_slide_count: document.querySelector('#slide-count').value,
      output_format: document.querySelector('#output-format').value,
      deadline: dateString(document.querySelector('#deadline').value), requirements: requirements.value.trim(),
      source_deck: selectedFile.name, source_deck_size_bytes: selectedFile.size,
      created_at: new Date().toISOString(), status: 'Ready for production handoff',
      note: 'This package contains the original deck and production instructions. It does not contain edited slides.'
    };
    const reqMd = `# ${brief.project}\n\n## Production request\n\n${brief.requirements}\n\n## Project details\n- Audience: ${brief.audience}\n- Target length: ${brief.target_slide_count}\n- Requested output: ${brief.output_format}\n- Deadline: ${brief.deadline}\n- Source deck: ${brief.source_deck}\n\n## Handoff status\nReady for production. This package contains the original deck and instructions; slides have not yet been edited.\n`;
    const files = [
      {name:selectedFile.name, data:new Uint8Array(await selectedFile.arrayBuffer())},
      {name:'production-brief.json', data:new TextEncoder().encode(JSON.stringify(brief, null, 2))},
      {name:'production-brief.md', data:new TextEncoder().encode(reqMd)},
      {name:'README.txt', data:new TextEncoder().encode('SLIDEFORM PRODUCTION HANDOFF\n\nThis ZIP contains your original PowerPoint, production-brief.json, and a readable production-brief.md.\n\nIt is ready to pass to a presentation designer or a connected slide-generation service. The deck has not been edited by this website.\n')}
    ];
    const zip = makeZip(files); const url = URL.createObjectURL(zip); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${title.value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'slideform'}-handoff.zip`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000); button.querySelector('span:first-child').textContent = 'Package downloaded'; announce('Your production handoff package is ready.');
    setTimeout(() => { button.querySelector('span:first-child').textContent = 'Package my brief'; button.disabled = false; }, 1800);
  } catch (error) { console.error(error); announce('Could not create the package. Please try again.'); button.querySelector('span:first-child').textContent = 'Package my brief'; button.disabled = false; }
});
refreshPreview();
