const $ = selector => document.querySelector(selector);
const state = { slides: [], selected: 0, theme: 'studio' };
let triageBlocks = [];
let contentTimer;
const themes = {
  studio: {label:'Studio', bg:'F0F3E8', fg:'263B31', muted:'74816E', accent:'809B67', deco:'D4E0C6', font:'Aptos Display'},
  editorial: {label:'Editorial', bg:'F2EADC', fg:'523B30', muted:'8C7969', accent:'A56E50', deco:'E6D1BB', font:'Georgia'},
  midnight: {label:'Midnight', bg:'20283A', fg:'F2EEE4', muted:'ADB5C3', accent:'D6BE83', deco:'343E54', font:'Aptos Display'},
  fieldnotes: {label:'Fieldnotes', bg:'E9EFE5', fg:'2F493C', muted:'738A79', accent:'829C78', deco:'D4E1D1', font:'Aptos Display'}
};
let toastTimer;

function showToast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
}
function pptxConstructor() { return window.PptxGenJS || window.pptxgen; }
function updateExportStatus() {
  const status = $('#library-status');
  if (pptxConstructor()) status.textContent = 'PowerPoint export is ready in your browser.';
  else if (window.deckcraftExportLoaded === false) status.textContent = 'The export library could not load. Check your connection, or click Build to retry.';
  else status.textContent = 'Loading the PowerPoint export…';
}
window.addEventListener('deckcraft-export-library', updateExportStatus);
if (window.deckcraftExportPromise) window.deckcraftExportPromise.then(updateExportStatus);
updateExportStatus();
function esc(text) { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sentenceChunks(text, limit = 520) {
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?/gu)?.map(item => item.trim()).filter(Boolean) || [text.trim()];
  const chunks = []; let current = '';
  for (const sentence of sentences) {
    if ([...sentence].length > limit) {
      if (current) { chunks.push(current); current = ''; }
      const words = sentence.split(/\s+/); let part = '';
      if (words.length === 1) {
        const characters = [...sentence];
        for (let start = 0; start < characters.length; start += limit) chunks.push(characters.slice(start, start + limit).join(''));
        continue;
      }
      for (const word of words) {
        if ([...`${part} ${word}`].length > limit && part) { chunks.push(part.trim()); part = ''; }
        part += `${part ? ' ' : ''}${word}`;
      }
      if (part) chunks.push(part.trim());
    } else if (current && [...`${current} ${sentence}`].length > limit) { chunks.push(current); current = sentence; }
    else current += `${current ? ' ' : ''}${sentence}`;
  }
  if (current) chunks.push(current);
  return chunks;
}
function splitContent(value) {
  const paragraphs = value.replace(/\r/g, '').trim().split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  const parsed = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n').map(line => line.trim()).filter(Boolean);
    const first = lines[0] || '';
    const explicit = /^#{1,6}\s/.test(first) || (lines.length > 1 && [...first].length < 100 && !/^(?:[-*•]|\d+[.)])\s/.test(first));
    let title = explicit ? first.replace(/^#+\s*/, '') : '';
    let body = explicit ? lines.slice(1).join('\n') : lines.join('\n');
    if (!title) {
      const lead = sentenceChunks(body, 105)[0] || body;
      title = [...lead].length <= 74 ? lead.replace(/[.!?。！？]$/, '') : [...lead].slice(0, 62).join('').trim();
      body = [...body].slice([...lead].length).join('').trim();
    }
    const pieces = [...body].length > 520 ? sentenceChunks(body, 520) : [body];
    pieces.forEach((piece, index) => parsed.push({title: index ? `${title} · continued` : (title || `Slide ${parsed.length + 1}`), body: piece.trim()}));
  }
  const merged = [];
  for (const block of parsed) {
    const previous = merged.at(-1);
    if (previous && !previous.body && [...previous.title].length < 90 && block.body) previous.body = block.body;
    else merged.push(block);
  }
  return merged;
}
function sectionLabel(i, total) {
  const flow = $('#story-flow').value;
  if (flow === 'manual') return 'YOUR SECTION';
  if (flow === 'problem') return i < Math.ceil(total / 2) ? 'THE CHALLENGE' : 'YOUR RESPONSE';
  if (flow === 'evidence') return i < Math.ceil(total / 2) ? 'THE EVIDENCE' : 'THE TAKEAWAY';
  if (flow === 'story') return i === 0 ? 'SET THE SCENE' : i === total - 1 ? 'THE REVEAL' : 'THE STORY';
  return i === 0 ? 'THE KEY MESSAGE' : 'THE DETAILS';
}
function structureSlides(readyOnly = false, announceReady = true) {
  const blocks = readyOnly ? triageBlocks.filter(block => block.ready) : splitContent($('#source-content').value);
  if (!blocks.length) { if (announceReady) showToast('Add some content first, then arrange it into slides.'); return; }
  const max = Number($('#slide-limit').value);
  const selected = blocks.slice(0, max);
  state.slides = selected.map((slide, i) => ({...slide, label:sectionLabel(i, selected.length)}));
  state.selected = 0; renderEditor(); renderPreview();
  if (announceReady) showToast(`${state.slides.length} content-backed slides ready${blocks.length > max ? ` · ${blocks.length - max} more parts are beyond the selected limit` : ''}.`);
}
function similarityTokens(value) {
  const words = value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const compact = value.toLocaleLowerCase().replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{N}]/gu, '');
  for (let i = 0; i < compact.length - 1; i++) words.push(compact.slice(i, i + 2));
  return new Set(words.filter(word => word.length > 1));
}
function overlapRatio(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0; left.forEach(token => { if (right.has(token)) overlap++; });
  return overlap / Math.min(left.size, right.size);
}
function reviewContent() {
  const blocks = splitContent($('#source-content').value);
  const seen = [];
  triageBlocks = blocks.map(block => {
    const fullText = `${block.title}\n${block.body}`.trim();
    const tokens = similarityTokens(fullText);
    const repeated = seen.some(previous => overlapRatio(tokens, previous) >= 0.88);
    if (tokens.size) seen.push(tokens);
    const length = [...block.body].length;
    const hasSentence = /[.!?。！？]/u.test(fullText);
    const hasEvidence = /\d|%|％|\$|€|£|年|月|日/u.test(fullText);
    const headingOnly = !block.body.trim();
    const veryDense = length > 520;
    const ready = !repeated && !headingOnly && !veryDense && (length >= 52 || (length >= 25 && (hasSentence || hasEvidence)));
    const reason = repeated ? 'Very similar to an earlier part' : headingOnly ? 'Heading only · add a point or detail' : veryDense ? 'Long section · split it into smaller ideas' : ready ? (hasEvidence ? 'Has a concrete figure, date, or detail' : 'Has a complete point with useful context') : 'Short or incomplete · add context or evidence';
    return {...block, ready, reason};
  });
  const readyCount=triageBlocks.filter(block=>block.ready).length;
  $('#content-report').hidden = !triageBlocks.length;
  $('#report-summary').textContent = `${readyCount} ready · ${triageBlocks.length-readyCount} to review · up to ${$('#slide-limit').value} slides`;
  $('#report-list').innerHTML = triageBlocks.slice(0,50).map((block,index)=>`<div class="report-item"><span class="report-badge ${block.ready?'ready':'needs'}">${block.ready?'READY TO USE':'NEEDS WORK'}</span><div><strong>${esc(block.title)}</strong><small>${esc(block.reason)}${index===49&&triageBlocks.length>50?' · Showing first 50':''}</small></div></div>`).join('');
}
function setSlideCount() {
  const target = Number($('#slide-limit').value);
  state.slides = state.slides.slice(0, target);
  updateSectionLabels(); state.selected = Math.max(0, Math.min(state.selected, state.slides.length - 1)); renderEditor(); renderPreview(); reviewContent();
}
function updateSectionLabels() { state.slides.forEach((slide, i) => slide.label = sectionLabel(i, state.slides.length)); }
function renderEditor() {
  const root = $('#slide-editor'); root.innerHTML = '';
  state.slides.forEach((slide, index) => {
    const card = document.createElement('article'); card.className = 'slide-card';
    card.innerHTML = `<div class="slide-card-head"><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(slide.label)}</strong><div class="slide-actions"><button type="button" data-action="up" aria-label="Move slide up" ${index===0?'disabled':''}>↑</button><button type="button" data-action="down" aria-label="Move slide down" ${index===state.slides.length-1?'disabled':''}>↓</button><button type="button" data-action="delete" aria-label="Delete slide">×</button></div></div><div class="slide-card-content"><input aria-label="Slide ${index+1} title" maxlength="140" value="${esc(slide.title)}" placeholder="Slide title"><textarea aria-label="Slide ${index+1} body" maxlength="1600" placeholder="Supporting text, details, or bullet points">${esc(slide.body)}</textarea></div>`;
    card.querySelector('input').addEventListener('input', event => { slide.title = event.target.value; if (index === state.selected) renderPreview(); });
    card.querySelector('textarea').addEventListener('input', event => { slide.body = event.target.value; if (index === state.selected) renderPreview(); });
    card.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'delete') { state.slides.splice(index, 1); if (!state.slides.length) state.slides.push({title:'Add your point', body:'', label:'YOUR SECTION'}); state.selected = Math.min(state.selected, state.slides.length-1); }
      else { const target = action === 'up' ? index - 1 : index + 1; [state.slides[index], state.slides[target]] = [state.slides[target], state.slides[index]]; state.selected = target; }
      updateSectionLabels(); renderEditor(); renderPreview();
    }));
    card.addEventListener('click', event => { if (!event.target.closest('button')) { state.selected=index; renderPreview(); } });
    root.append(card);
  });
}
function renderPreview() {
  if (!state.slides.length) return;
  state.selected = Math.max(0, Math.min(state.selected, state.slides.length - 1));
  const slide = state.slides[state.selected]; const theme = themes[state.theme];
  $('#slide-canvas').className = `slide-canvas theme-${state.theme}`;
  $('#preview-kicker').textContent = slide.label || 'YOUR SECTION';
  $('#preview-title').textContent = slide.title || 'Your slide title';
  $('#preview-body').textContent = slide.body || 'Supporting detail will appear here.';
  $('#preview-counter').textContent = String(state.selected+1).padStart(2,'0');
  $('#slide-position').textContent = `${String(state.selected+1).padStart(2,'0')} / ${String(state.slides.length).padStart(2,'0')}`;
  $('#preview-dots').innerHTML = state.slides.map((_, i) => `<button type="button" aria-label="Show slide ${i+1}" class="${i===state.selected?'active':''}" data-index="${i}"></button>`).join('');
  $('#preview-dots').querySelectorAll('button').forEach(dot => dot.addEventListener('click', () => { state.selected=Number(dot.dataset.index); renderPreview(); }));
  $('#summary-title').textContent = $('#deck-title').value.trim() || 'Untitled presentation';
  $('#summary-slides').textContent = `${state.slides.length} slides`;
  $('#summary-theme').textContent = `${theme.label} style`;
}
function updateWordCount() { $('#word-count').textContent = `${$('#source-content').value.trim().split(/\s+/).filter(Boolean).length} words`; }
function rtfToText(source) {
  return source.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code) => String.fromCharCode((Number(code) + 65536) % 65536))
    .replace(/\\(par|line)\b\s?/gi, '\n').replace(/\\tab\b/g, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\[^a-z]/gi, '').replace(/[{}]/g, '').trim();
}
async function extractDocumentText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (file.size > 100 * 1024 * 1024) throw new Error('This file is larger than the 100 MB limit.');
  if (['txt','md','csv','tsv','json','xml'].includes(ext)) return file.text();
  if (['html','htm'].includes(ext)) {
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach(node => node.remove());
    return doc.body.innerText || doc.body.textContent || '';
  }
  if (ext === 'rtf') return rtfToText(await file.text());
  const data = await file.arrayBuffer();
  if (ext === 'docx') {
    if (!window.mammoth) throw new Error('The Word reader did not load. Refresh and try again.');
    return (await window.mammoth.extractRawText({arrayBuffer:data})).value;
  }
  if (ext === 'pdf') {
    if (!window.pdfjsLib) throw new Error('The PDF reader did not load. Refresh and try again.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({data}).promise; const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number); const text = await page.getTextContent();
      pages.push(text.items.map(item => item.str).filter(Boolean).join(' '));
    }
    return pages.join('\n\n');
  }
  if (ext === 'pptx') {
    if (!window.JSZip) throw new Error('The PowerPoint reader did not load. Refresh and try again.');
    const zip = await window.JSZip.loadAsync(data);
    const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a,b) => Number(a.match(/slide(\d+)/i)[1]) - Number(b.match(/slide(\d+)/i)[1]));
    const slides = [];
    for (const name of slideNames) {
      const xml = new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml');
      const text = [...xml.getElementsByTagName('*')].filter(node => node.localName === 't').map(node => node.textContent).filter(Boolean).join(' ');
      if (text.trim()) slides.push(text.trim());
    }
    return slides.join('\n\n');
  }
  if (['xlsx','xls'].includes(ext) || ['csv','tsv'].includes(ext)) {
    if (!window.XLSX) throw new Error('The spreadsheet reader did not load. Refresh and try again.');
    const workbook = window.XLSX.read(data);
    return workbook.SheetNames.map(name => `# ${name}\n${window.XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n');
  }
  throw new Error(`Text import for .${ext} is not available yet. Try PDF, DOCX, PPTX, XLSX, XLS, CSV, TSV, TXT, MD, RTF, HTML, JSON, or XML.`);
}
$('#document-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const status = $('#import-status'); status.textContent = `Reading ${file.name}…`;
  try {
    const text = (await extractDocumentText(file)).trim();
    if (!text) throw new Error('No selectable text was found. Scanned pages or image-only slides need OCR before import.');
    $('#source-content').value = text;
    $('#source-content').dispatchEvent(new Event('input', {bubbles:true}));
    status.textContent = `Imported ${file.name} · ${text.length.toLocaleString()} characters`;
    showToast('Document text imported. Review the sections, then build your slides.');
  } catch (error) {
    status.textContent = 'Choose another file or paste text instead.';
    showToast(error.message || 'Could not read that document.');
  } finally { event.target.value = ''; }
});

document.querySelectorAll('.theme-choice').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.theme-choice').forEach(item => { item.classList.toggle('selected', item===button); item.setAttribute('aria-checked', item===button?'true':'false'); });
  state.theme = button.dataset.theme; renderPreview();
}));
$('#structure-content').addEventListener('click', () => structureSlides(false));
$('#structure-ready').addEventListener('click', () => structureSlides(true));
$('#source-content').addEventListener('input', () => {
  updateWordCount(); clearTimeout(contentTimer); contentTimer=setTimeout(reviewContent, 450);
});
$('#story-flow').addEventListener('change', () => { updateSectionLabels(); renderEditor(); renderPreview(); });
$('#slide-limit').addEventListener('change', setSlideCount);
$('#deck-title').addEventListener('input', renderPreview);
$('#previous-slide').addEventListener('click', () => { state.selected=(state.selected+state.slides.length-1)%state.slides.length; renderPreview(); });
$('#next-slide').addEventListener('click', () => { state.selected=(state.selected+1)%state.slides.length; renderPreview(); });
$('#add-slide').addEventListener('click', () => {
  if (state.slides.length >= 30) return showToast('You can add up to 30 slides.');
  state.slides.push({title:'Add your point',body:'',label:'YOUR SECTION'}); state.selected=state.slides.length-1; updateSectionLabels(); renderEditor(); renderPreview();
  $('#slide-editor').lastElementChild.scrollIntoView({behavior:'smooth',block:'center'});
});

async function exportDeck() {
  const button = $('#generate');
  if (!pptxConstructor()) {
    button.disabled = true; button.querySelector('span:first-child').textContent = 'Loading export…';
    $('#library-status').textContent = 'Trying the export library again…';
    const loaded = window.deckcraftLoadExportLibrary ? await window.deckcraftLoadExportLibrary() : false;
    if (!loaded || !pptxConstructor()) {
      button.disabled = false; button.querySelector('span:first-child').textContent = 'Build my PowerPoint';
      updateExportStatus(); showToast('Could not load the PowerPoint export library. Check your connection and try again.'); return;
    }
  }
  if (!state.slides.length) return showToast('Add some content before building the PowerPoint.');
  button.disabled=true; button.querySelector('span:first-child').textContent='Building your deck…';
  try {
    const PptxGen = pptxConstructor();
    const pptx = new PptxGen(); const theme=themes[state.theme];
    pptx.layout='LAYOUT_WIDE'; pptx.author='Deckcraft'; pptx.subject=$('#deck-title').value.trim() || 'Presentation';
    pptx.title=$('#deck-title').value.trim() || 'Presentation'; pptx.company='Deckcraft'; pptx.lang='en-US';
    pptx.theme={headFontFace:theme.font,bodyFontFace:'Aptos',lang:'en-US'};
    state.slides.forEach((content,index) => {
      const slide=pptx.addSlide(); slide.background={color:theme.bg};
      const hasChinese=/[\u3400-\u9fff]/u.test(`${content.title} ${content.body}`);
      const slideFont=hasChinese?'Microsoft JhengHei':theme.font;
      const bodyFont=hasChinese?'Microsoft JhengHei':'Aptos';
      slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.13,h:7.5,line:{color:theme.accent,transparency:100},fill:{color:theme.accent}});
      slide.addText((content.label||'YOUR SECTION').toUpperCase(),{x:0.72,y:0.58,w:8.9,h:0.28,fontFace:'Aptos',fontSize:10,bold:true,charSpacing:1.4,color:theme.accent,margin:0,breakLine:false});
      slide.addText(content.title||'Your slide title',{x:0.72,y:1.25,w:11.7,h:1.65,fontFace:slideFont,fontSize:state.theme==='editorial'?34:36,bold:true,color:theme.fg,breakLine:false,margin:0,fit:'shrink',valign:'mid',paraSpaceAfterPt:0});
      slide.addShape(pptx.ShapeType.line,{x:0.72,y:3.2,w:1.1,h:0,line:{color:theme.accent,width:2.2}});
      if (content.body.trim()) slide.addText(content.body.trim(),{x:0.72,y:3.55,w:10.85,h:2.45,fontFace:bodyFont,fontSize:20,color:theme.muted,margin:0,breakLine:false,fit:'shrink',valign:'top',paraSpaceAfterPt:9,lineSpacingMultiple:1.16});
      slide.addShape(pptx.ShapeType.ellipse,{x:11.55,y:5.65,w:1.25,h:1.25,line:{color:theme.deco,transparency:100},fill:{color:theme.deco,transparency:20}});
      slide.addText(String(index+1).padStart(2,'0'),{x:0.72,y:6.82,w:0.65,h:0.25,fontFace:'Aptos',fontSize:10,color:theme.accent,margin:0});
      slide.addText($('#deck-title').value.trim()||'Untitled presentation',{x:1.5,y:6.82,w:8.2,h:0.25,fontFace:'Aptos',fontSize:9,color:theme.muted,margin:0});
    });
    const fileName=($('#deck-title').value.trim()||'my-presentation').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.pptx';
    Promise.resolve(pptx.writeFile({fileName})).then(() => { showToast('Your editable PowerPoint is ready to download.'); }).catch(error=>{ console.error(error); showToast('The PowerPoint could not be built. Please try again.'); }).finally(()=>{button.disabled=false;button.querySelector('span:first-child').textContent='Build my PowerPoint';});
  } catch(error) { console.error(error); showToast('The PowerPoint could not be built. Please try again.'); button.disabled=false; button.querySelector('span:first-child').textContent='Build my PowerPoint'; }
}
$('#generate').addEventListener('click',exportDeck);
updateWordCount(); reviewContent(); structureSlides(false,false);
