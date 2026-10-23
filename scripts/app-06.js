
(function(){
  // This layer standardises completion for every activity without changing game logic.
  const moduleRoutes = {
    abc: 'abc-menu-screen', number: 'num123-menu-screen', colour: 'colour-menu-screen',
    body: 'body-part-menu-screen', animal: 'animal-menu-screen', shape: 'shape-menu-screen',
    transport: 'transport-menu-screen', food: 'food-menu-screen', jobs: 'jobs-menu-screen'
  };
  const screenModule = {
    'chooabc-screen':'abc','bijak-suku-kata-screen':'abc','complete-abc-screen':'abc','spell-it-right-screen':'abc','abc-tracing-screen':'abc',
    'match-count-screen':'abc','match-game-screen':'abc','find-letter-screen':'abc','abc-flashcard-screen':'abc',
    'lesson-screen':'abc','count-selection-screen':'abc','quiz-screen':'abc','result-screen':'abc',
    'column-math-screen':'number','column-count-screen':'number','num123-tracing-screen':'number','learn123-screen':'number','match123-screen':'number','lets-count-screen':'number','add-them-up-screen':'number','choo123-screen':'number','taking-away-count-screen':'number','taking-away-screen':'number','find123-screen':'number',
    'learn-colour-screen':'colour','pop-balloon-screen':'colour','match-colour-screen':'colour','match-paint-screen':'colour','match-crayon-screen':'colour','pair-socks-screen':'colour','find-colour-screen':'colour',
    'learn-body-screen':'body','choose-body-screen':'body','match-body-count-screen':'body','match-body-game-screen':'body','label-body-screen':'body',
    'learn-animal-cat-screen':'animal','learn-animal-flash-screen':'animal','match-animal-count-screen':'animal','match-animal-game-screen':'animal','complete-animal-screen':'animal','find-animal-count-screen':'animal','find-animal-game-screen':'animal',
    'learn-shape-screen':'shape','match-shape-screen':'shape','draw-shape-screen':'shape','match-me-screen':'shape',
    'learn-transport-cat-screen':'transport','learn-transport-flash-screen':'transport','sort-transport-screen':'transport','guess-transport-screen':'transport',
    'learn-food-screen':'food','sort-food-screen':'food',
    'jobs-quiz-screen':'jobs'
  };
  let completionOpen=false, completionModule=null;
  const originalAlert=window.alert.bind(window);
  const originalShowScreen=(typeof window.showScreen==='function') ? window.showScreen.bind(window) : null;

  function activeScreenId(){ const el=document.querySelector('.card.active'); return el ? el.id : ''; }
  function inferModule(){ return screenModule[activeScreenId()] || completionModule || 'abc'; }
  function isCompletionMessage(msg){
    const t=String(msg||'').toLowerCase();
    return /completed|complete all|completing|finished|finish!|quiz finished|quiz tamat|tamat!|tamat belajar|tahniah|syabas|selesai|lengkapkan|melengkapkan|habiskan|menghabiskan|hebat!|amazing!|great job|well done|excellent! all labels/.test(t);
  }
  function extractDetail(msg){
    const t=String(msg||'');
    const score=t.match(/(?:score|skor)(?: anda)?\s*[:：]?\s*([^\n]+)/i);
    return score ? ((currentGlobalLang==='ms'?'Skor: ':'Score: ')+score[1].replace(/^[:\s]+/,'')) : '';
  }
  function showCompletion(moduleKey, detail){
    completionModule=moduleKey || inferModule(); completionOpen=true;
    try{ window.speechSynthesis?.cancel(); }catch(e){}
    const pop=document.getElementById('universal-completion-pop');
    document.getElementById('universal-completion-title').textContent = '🎉 ALL DONE! 🎉';
    const d=document.getElementById('universal-completion-detail'); d.textContent=detail||''; d.style.display=detail?'block':'none';
    document.getElementById('universal-completion-close').textContent=completionModule==='jobs' && currentGlobalLang==='ms'?'Tutup ✖️':'Close ✖️';
    pop.style.pointerEvents='auto'; pop.classList.add('show'); pop.setAttribute('aria-hidden','false');
    announceAllDone();
  }
  function closeCompletion(){
    const pop=document.getElementById('universal-completion-pop'); pop.classList.remove('show'); pop.style.pointerEvents='none'; pop.setAttribute('aria-hidden','true');
    const route=moduleRoutes[completionModule] || moduleRoutes.abc; completionOpen=false;
    if(originalShowScreen) originalShowScreen(route); else if(typeof window.navigateTo==='function') window.navigateTo(route);
    completionModule=null;
  }
  document.getElementById('universal-completion-close').addEventListener('click',function(){ if(typeof playClickSound==='function') playClickSound(); closeCompletion(); });

  // Convert existing completion alerts to the themed popup. Ordinary account/error alerts remain unchanged.
  window.alert=function(msg){
    const sid=activeScreenId();
    if(screenModule[sid] && isCompletionMessage(msg)){ showCompletion(screenModule[sid],extractDetail(msg)); return; }
    return originalAlert(msg);
  };

  // Prevent legacy code from immediately navigating away after its old alert.
  if(originalShowScreen){
    window.showScreen=function(screenId){
      if(completionOpen) return;
      if(screenId==='result-screen'){
        const current=activeScreenId();
        if(screenModule[current]){ showCompletion(screenModule[current],''); return; }
      }
      return originalShowScreen(screenId);
    };
  }

})();
