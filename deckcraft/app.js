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
function esc(text) { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function splitContent(value) {
  const blocks = value.trim().split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    let title, body;
    if (lines.length > 1) { title = lines[0].replace(/^#+\s*/, ''); body = lines.slice(1).join('\n'); }
    else {
      const text = lines[0] || '';
      if (text.length < 74) { title = text.replace(/^#+\s*/, ''); body = ''; }
      else { const sentence = text.match(/^(.{18,68}?)(?:[.!?]\s|$)/); title = sentence ? sentence[1].replace(/[.!?]$/, '') : text.slice(0, 48).trim(); body = text.slice(title.length).trim(); }
    }
    return { title: title || `Slide ${index + 1}`, body };
  });
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
  let selected = blocks.slice(0, max);
  if (blocks.length > max) {
    const overflow = blocks.slice(max).map(b => `${b.title}\n${b.body}`.trim()).join('\n\n');
    selected[max - 1] = {...selected[max - 1], body:[selected[max - 1].body, overflow].filter(Boolean).join('\n\n')};
  }
  state.slides = selected.map((slide, i) => ({...slide, label:sectionLabel(i, Math.max(selected.length, max))}));
  while (state.slides.length < max) state.slides.push({title:'Add your point', body:'', label:sectionLabel(state.slides.length, max)});
  state.selected = 0; renderEditor(); renderPreview();
  if (announceReady) showToast(`${state.slides.length} editable slides ready. Adjust anything you like.`);
}
function reviewContent() {
  const blocks = splitContent($('#source-content').value);
  const seen = new Set();
  triageBlocks = blocks.map(block => {
    const fullText = `${block.title}\n${block.body}`.trim();
    const normalized = fullText.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const repeated = normalized && seen.has(normalized);
    if (normalized) seen.add(normalized);
    const length = [...fullText].length;
    const hasSentence = /[.!?。！？]/u.test(fullText);
    const hasEvidence = /\d|%|％|\$|€|£|年|月|日/u.test(fullText);
    const ready = !repeated && (length >= 44 || (length >= 22 && (hasSentence || hasEvidence)));
    const reason = repeated ? 'Repeated wording' : ready ? (hasEvidence ? 'Includes a useful detail or figure' : 'Has enough context to place') : 'Add context or a supporting detail';
    return {...block, ready, reason};
  });
  const readyCount=triageBlocks.filter(block=>block.ready).length;
  $('#content-report').hidden = !triageBlocks.length;
  $('#report-summary').textContent = `${readyCount} ready · ${triageBlocks.length-readyCount} need work`;
  $('#report-list').innerHTML = triageBlocks.slice(0,50).map((block,index)=>`<div class="report-item"><span class="report-badge ${block.ready?'ready':'needs'}">${block.ready?'READY TO USE':'NEEDS WORK'}</span><div><strong>${esc(block.title)}</strong><small>${esc(block.reason)}${index===49&&triageBlocks.length>50?' · Showing first 50':''}</small></div></div>`).join('');
}
function setSlideCount() {
  const target = Number($('#slide-limit').value);
  state.slides = state.slides.slice(0, target);
  while (state.slides.length < target) state.slides.push({title:'Add your point', body:'', label:sectionLabel(state.slides.length, target)});
  updateSectionLabels(); state.selected = Math.min(state.selected, state.slides.length - 1); renderEditor(); renderPreview();
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

function exportDeck() {
  if (!window.pptxgen) { showToast('PowerPoint export library did not load. Check your connection and refresh.'); return; }
  if (!state.slides.length) return showToast('Add some content before building the PowerPoint.');
  const button = $('#generate'); button.disabled=true; button.querySelector('span:first-child').textContent='Building your deck…';
  try {
    const pptx = new window.pptxgen(); const theme=themes[state.theme];
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
