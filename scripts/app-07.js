
(function () {
  const overlay=document.getElementById('topic-image-loader');
  const title=document.getElementById('topic-loader-title');
  const detail=document.getElementById('topic-loader-detail');
  const fill=document.getElementById('topic-loader-fill');
  const count=document.getElementById('topic-loader-count');
  const progress=document.getElementById('topic-loader-progress');
  const actions=document.getElementById('topic-loader-actions');
  const imageCache=new Map();
  let generation=0, failed=[];
  const lang=()=>typeof currentGlobalLang!=='undefined' && currentGlobalLang==='ms';
  const all=(items)=>items.flat(Infinity).map(item=>typeof item==='string'?item:(item?.img||item?.image||item?.[0])).filter(url=>typeof url==='string' && /^https?:\/\//i.test(url));
  function sourcesFor(id){
    // Use the images selected for this session; learning screens use their full category.
    switch(id){
      case 'learn-animal-flash-screen': return all(currentLearnAnimalList);
      case 'match-animal-game-screen': return all(matchAnimalGameData);
      case 'find-animal-game-screen': return all(findAnimalQuestionsList.flatMap(q=>q.options||[]));
      case 'complete-animal-screen': return all(completeAnimalQuestions);
      case 'learn-body-screen': case 'choose-body-screen': case 'match-body-game-screen': return all(bodyParts);
      case 'learn-food-screen': return all(currentLearnFoodList);
      case 'sort-food-screen': return all(sortFoodSets);
      case 'learn-transport-flash-screen': return all(currentLearnTransportList);
      case 'sort-transport-screen': return all(sortTransportSets);
      case 'guess-transport-screen': return all(guessTransportSets);
      case 'jobs-learn-screen': case 'jobs-quiz-screen': return all(jobsData);
      case 'spell-it-right-screen': return all(spellSessionWords);
      case 'bijak-suku-kata-screen': case 'bijak-suku-kata-2-screen': return all(sukuWords);
      case 'learn-shape-screen': case 'match-shape-screen': case 'draw-shape-screen': case 'match-me-screen': return all(shapeDatabase);
      default: return [];
    }
  }
  const topicScreens=new Set(['learn-animal-flash-screen','match-animal-game-screen','find-animal-game-screen','complete-animal-screen','learn-body-screen','choose-body-screen','match-body-game-screen','label-body-screen','learn-food-screen','sort-food-screen','learn-transport-flash-screen','sort-transport-screen','guess-transport-screen','jobs-learn-screen','jobs-quiz-screen','spell-it-right-screen','bijak-suku-kata-screen','bijak-suku-kata-2-screen','learn-shape-screen','match-shape-screen','draw-shape-screen','match-me-screen']);
  function loadImage(url){
    if(imageCache.has(url))return imageCache.get(url);
    const promise=new Promise((resolve,reject)=>{
      const image=new Image(); image.decoding='async'; image.referrerPolicy='no-referrer';
      image.onload=()=>{Promise.resolve(image.decode?.()).catch(()=>{}).then(()=>resolve(image));};
      image.onerror=()=>reject(new Error('Image failed'));
      image.src=url;
    });
    imageCache.set(url,promise);
    promise.catch(()=>imageCache.delete(url));
    return promise;
  }
  function close(){generation++;overlay.classList.remove('open');actions.style.display='none';}
  async function preload(urls, token){
    failed=[];let done=0,next=0;
    const update=()=>{let pct=Math.round(100*done/urls.length);fill.style.width=pct+'%';progress.setAttribute('aria-valuenow',String(pct));count.textContent=done+' / '+urls.length;};
    update();
    async function worker(){
      while(next<urls.length && token===generation){
        const url=urls[next++];
        try{await loadImage(url)}catch(e){failed.push(url)}
        if(token!==generation)return;
        done++;update();
      }
    }
    await Promise.all(Array.from({length:Math.min(8,urls.length)},worker));
    if(token!==generation)return;
    if(failed.length){
      title.textContent=lang()?'Ada gambar belum berjaya dimuat':'Some pictures could not load';
      detail.textContent=lang()?'Semak internet dan cuba lagi.':'Check your connection and try again.';
      actions.style.display='flex';
    } else close();
  }
  const originalShowScreen=window.showScreen;
  if(typeof originalShowScreen!=='function')return;
  window.showScreen=function(id){
    const previous=document.querySelector('.card.active')?.id;
    if(previous!==id){generation++;overlay.classList.remove('open');actions.style.display='none';}
    const result=originalShowScreen.apply(this,arguments);
    if(previous===id || !topicScreens.has(id))return result;
    const token=generation;
    // Game start functions populate their session data immediately after showScreen.
    queueMicrotask(()=>{
      if(token!==generation || !document.getElementById(id)?.classList.contains('active'))return;
      let urls=[];
      try { urls=sourcesFor(id); } catch(e) { /* An empty session can still show its own screen. */ }
      document.querySelectorAll('#'+id+' img').forEach(img=>{if(img.src)urls.push(img.src)});
      urls=[...new Set(urls.filter(url=>/^https?:\/\//i.test(url)))];
      if(!urls.length)return;
      title.textContent=lang()?'Gambar sedang dimuat...':'Loading pictures...';
      detail.textContent=lang()?'Monster sedang sediakan aktiviti!':'The monster is getting your activity ready!';
      document.getElementById('topic-loader-retry').textContent=lang()?'Cuba lagi':'Try again';
      document.getElementById('topic-loader-continue').textContent=lang()?'Buka aktiviti':'Open activity';
      fill.style.width='0%';count.textContent='0 / '+urls.length;overlay.classList.add('open');
      preload(urls,token);
    });
    return result;
  };
  document.getElementById('topic-loader-retry').onclick=()=>{const urls=[...failed];actions.style.display='none';title.textContent=lang()?'Gambar sedang dimuat...':'Loading pictures...';detail.textContent=lang()?'Sila tunggu sebentar':'Please wait';preload(urls,generation)};
  document.getElementById('topic-loader-continue').onclick=close;
})();
