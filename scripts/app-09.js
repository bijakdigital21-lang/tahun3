
(function(){
'use strict';
const URLS=['SJ2gqVu','RDASQn4','fw6URGC','g4Q0iMt','z9s1tuc','PtPSiMn','UdFTV4y','Kucf6tM','l5dYLWi','5hUwpK9','t7sl5Vn','N9pbFrS','a6SzP0A','xSCejhU','gsN9t7B','r8RtGov','NAcipw0','XsVffaj','BJ7B5W4'].map(id=>'https://i.imgur.com/'+id+'.jpeg');
const NS='http://www.w3.org/2000/svg';
let session=0,round=0,order=[],timer=0,loadingTimer=0,pieces=[],selected=null,drag=null,done=0,busy=false,W=900,H=600,imageURL='';
const el=id=>document.getElementById(id);
const ms=()=>typeof currentGlobalLang!=='undefined'&&currentGlobalLang==='ms';
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function svg(tag,attrs={}){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;}
const screen=document.createElement('div');screen.id='puzzle-screen';screen.className='card';
screen.innerHTML='<div class="pz-top"><h2>ðŸ§© Puzzle</h2><span id="pz-progress"></span></div><p id="pz-instruction"></p><div id="pz-board"></div><div id="pz-tray"></div><p id="pz-status" role="status" aria-live="polite"></p><div id="pz-controls"><button id="pz-retry" class="action-btn" type="button" hidden></button><button id="pz-home" class="action-btn home-btn" type="button"></button></div>';
el('home-screen').parentNode.appendChild(screen);
// Capture taps before piece dragging prevents the browser click event.
function puzzleClickSound(){if(typeof playClickSound==='function')playClickSound();}
screen.addEventListener('pointerdown',e=>{if(e.isPrimary!==false&&e.button===0)puzzleClickSound();},true);
screen.addEventListener('click',e=>{if(e.detail===0)puzzleClickSound();},true);
screen.addEventListener('keydown',e=>{if(!e.repeat&&(e.key==='Enter'||e.key===' ')&&e.target.matches('.pz-target'))puzzleClickSound();},true);
function labels(){el('pz-instruction').textContent=ms()?'Seret kepingan ke tempatnya, atau tekan kepingan kemudian tekan ruang yang sepadan.':'Drag each piece into place, or tap a piece then its matching space.';el('pz-home').textContent=ms()?'Kembali ke Utama ðŸ ':'Back to Home ðŸ ';el('pz-retry').textContent=ms()?'Cuba lagi':'Try again';}
function status(){el('pz-status').textContent=done+' / 6 '+(ms()?'kepingan siap':'pieces placed');}
function cancelDrag(){if(drag){drag.ghost.remove();drag=null;}}
function stop(){if(screen.classList.contains('active'))window.speechSynthesis?.cancel();session++;clearTimeout(timer);clearTimeout(loadingTimer);cancelDrag();selected=null;busy=true;el('pz-pop').hidden=true;}
el('pz-home').onclick=()=>{stop();showScreen('home-screen');};
const priorShow=window.showScreen;
window.showScreen=function(id){if(id!=='puzzle-screen'&&screen.classList.contains('active'))stop();return priorShow.apply(this,arguments);};
new MutationObserver(()=>{if(!screen.classList.contains('active')&&!busy)stop();}).observe(screen,{attributes:true,attributeFilter:['class']});
window.openPuzzleModule=function(){stop();labels();round=0;order=shuffle(URLS).slice(0,10);showScreen('puzzle-screen');busy=false;loadRound();};
el('pz-retry').onclick=()=>loadRound();
function loadRound(){
 clearTimeout(timer);clearTimeout(loadingTimer);cancelDrag();selected=null;busy=true;done=0;pieces=[];
 el('pz-pop').hidden=true;el('pz-retry').hidden=true;el('pz-board').replaceChildren();el('pz-tray').replaceChildren();
 el('pz-progress').textContent=(round+1)+' / 10';el('pz-status').textContent=ms()?'Gambar sedang dimuatâ€¦':'Loading pictureâ€¦';
 const token=++session;let settled=false;const img=new Image();
 function fail(){if(token!==session||settled)return;settled=true;clearTimeout(loadingTimer);el('pz-status').textContent=ms()?'Gambar gagal dimuat. Semak internet dan tekan Cuba lagi.':'Picture could not load. Check your connection and try again.';el('pz-retry').hidden=false;}
 img.onload=()=>{if(token!==session||settled)return;if(!img.naturalWidth){fail();return;}settled=true;clearTimeout(loadingTimer);W=900;H=900*img.naturalHeight/img.naturalWidth;imageURL=order[round];build();busy=false;status();if(round<9){const next=new Image();next.src=order[round+1];}};
 img.onerror=fail;loadingTimer=setTimeout(fail,20000);img.src=order[round];
}
// Shared curved edges are reversed for adjacent pieces, so every tab fits its neighbour.
function edge(a,b,amp){
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
 const p=(t,k=0)=>[a[0]+t*dx+nx*amp*k,a[1]+t*dy+ny*amp*k];
 return [{a:a,b:p(.32),line:true},{a:p(.32),c:p(.46),d:p(.38,1),b:p(.44,1)},{a:p(.44,1),c:p(.48,1.4),d:p(.56,1.4),b:p(.60,1)},{a:p(.60,1),c:p(.67,1),d:p(.55),b:p(.68)},{a:p(.68),b:b,line:true}];
}
function commands(e,reverse){return (reverse?e.slice().reverse():e).map(q=>q.line?'L '+(reverse?q.a:q.b).join(' '):'C '+(reverse?[q.d,q.c,q.a]:[q.c,q.d,q.b]).map(p=>p.join(' ')).join(' ')).join(' ');}
function build(){
 const amp=Math.min(W/3,H/2)*.21;
 const v=Array.from({length:3},(_,r)=>Array.from({length:4},(_,c)=>[c===0?0:c===3?W:W*(c/3+(Math.random()-.5)*.09),r===0?0:r===2?H:H*(.5+(Math.random()-.5)*.14)]));
 const he=Array.from({length:3},(_,r)=>Array.from({length:3},(_,c)=>edge(v[r][c],v[r][c+1],r===1?amp*(c%2?1:-1):0)));
 const ve=Array.from({length:2},(_,r)=>Array.from({length:4},(_,c)=>edge(v[r][c],v[r+1][c],c>0&&c<3?amp*((r+c)%2?1:-1):0)));
 const board=svg('svg',{viewBox:`0 0 ${W} ${H}`,'aria-label':ms()?'Papan puzzle':'Puzzle board'}),defs=svg('defs');board.appendChild(defs);
 board.appendChild(svg('image',{href:imageURL,width:W,height:H,opacity:.16,preserveAspectRatio:'none'}));
 for(let r=0;r<2;r++)for(let c=0;c<3;c++){
  const id=r*3+c,vertices=[v[r][c],v[r][c+1],v[r+1][c+1],v[r+1][c]];
  const d='M '+v[r][c].join(' ')+' '+commands(he[r][c],false)+' '+commands(ve[r][c+1],false)+' '+commands(he[r+1][c],true)+' '+commands(ve[r][c],true)+' Z';
  const clipId='pz-clip-'+session+'-'+id,clip=svg('clipPath',{id:clipId});clip.appendChild(svg('path',{d}));defs.appendChild(clip);
  const placed=svg('image',{href:imageURL,width:W,height:H,'clip-path':`url(#${clipId})`,preserveAspectRatio:'none',visibility:'hidden','pointer-events':'none'});board.appendChild(placed);
  const target=svg('path',{d,class:'pz-target',role:'button',tabindex:0,'aria-label':(ms()?'Ruang ':'Space ')+(id+1)});board.appendChild(target);
  const pad=amp*1.6,minX=Math.max(0,Math.min(...vertices.map(v=>v[0]))-pad),minY=Math.max(0,Math.min(...vertices.map(v=>v[1]))-pad),maxX=Math.min(W,Math.max(...vertices.map(v=>v[0]))+pad),maxY=Math.min(H,Math.max(...vertices.map(v=>v[1]))+pad);
  const piece={id,d,clipId,placed,target,x:minX,y:minY,w:maxX-minX,h:maxY-minY,placedOK:false};pieces.push(piece);
  target.onclick=()=>{if(selected!==null)attempt(selected,id);};target.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();target.onclick();}};
 }
 el('pz-board').appendChild(board);
 shuffle(pieces).forEach(p=>{
  const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',(ms()?'Kepingan ':'Piece ')+(p.id+1));b.setAttribute('aria-pressed','false');
  const preview=svg('svg',{viewBox:`${p.x} ${p.y} ${p.w} ${p.h}`,'aria-hidden':'true'});
  const localDefs=svg('defs'),cl=svg('clipPath',{id:p.clipId+'-tray'});cl.appendChild(svg('path',{d:p.d}));localDefs.appendChild(cl);preview.appendChild(localDefs);
  preview.appendChild(svg('image',{href:imageURL,width:W,height:H,'clip-path':`url(#${p.clipId}-tray)`,preserveAspectRatio:'none'}));preview.appendChild(svg('path',{d:p.d,fill:'none',stroke:'#62439b','stroke-width':2}));b.appendChild(preview);p.button=b;
  b.onclick=()=>{if(!busy&&!p.placedOK)select(p.id);};
  b.onpointerdown=e=>startDrag(e,p);b.onpointermove=moveDrag;b.onpointerup=endDrag;b.onpointercancel=cancelDrag;b.onlostpointercapture=cancelDrag;
  el('pz-tray').appendChild(b);
 });
}
function select(id){selected=id;pieces.forEach(p=>{p.button.classList.toggle('pz-selected',p.id===id);p.button.setAttribute('aria-pressed',String(p.id===id));});}
function startDrag(e,p){
 if(busy||p.placedOK||(e.pointerType==='mouse'&&e.button!==0)||drag)return;e.preventDefault();select(p.id);
 const rect=el('pz-board').querySelector('svg').getBoundingClientRect(),scale=rect.width/W;
 const ghost=p.button.querySelector('svg').cloneNode(true);
 // Ghost IDs must be unique to avoid colliding with tray clipping paths.
 const clip=ghost.querySelector('clipPath'),gid=p.clipId+'-drag';clip.id=gid;ghost.querySelector('image').setAttribute('clip-path',`url(#${gid})`);
 ghost.classList.add('pz-drag');ghost.style.width=p.w*scale+'px';ghost.style.height=p.h*scale+'px';document.body.appendChild(ghost);
 drag={id:p.id,pointer:e.pointerId,ghost,w:p.w*scale,h:p.h*scale,startX:e.clientX,startY:e.clientY,moved:false};
 p.button.setPointerCapture(e.pointerId);positionGhost(e);
}
function positionGhost(e){if(!drag)return;drag.ghost.style.left=e.clientX-drag.w/2+'px';drag.ghost.style.top=e.clientY-drag.h/2+'px';}
function moveDrag(e){if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>7)drag.moved=true;positionGhost(e);}
function endDrag(e){
 if(!drag||e.pointerId!==drag.pointer)return;
 const state=drag;cancelDrag();if(!state.moved)return;
 const rect=el('pz-board').querySelector('svg').getBoundingClientRect(),p=pieces[state.id],x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;
 const tolerance=Math.min(W/3,H/2)*.43;
 if(Math.hypot(x-(p.x+p.w/2),y-(p.y+p.h/2))<tolerance)attempt(p.id,p.id);
 else el('pz-status').textContent=ms()?'Cuba ruang lain. Kamu boleh!':'Try another space. You can do it!';
}
function attempt(pieceId,spaceId){
 if(busy||selected===null)return;const p=pieces[pieceId];if(p.placedOK)return;
 if(pieceId!==spaceId){if(typeof playWrongSound==='function')playWrongSound();el('pz-status').textContent=ms()?'Cuba ruang lain. Kamu boleh!':'Try another space. You can do it!';return;}
 p.placedOK=true;p.placed.setAttribute('visibility','visible');p.target.style.display='none';p.button.disabled=true;p.button.classList.remove('pz-selected');p.button.setAttribute('aria-pressed','false');selected=null;done++;status();
 if(typeof playCorrectSound==='function')playCorrectSound();
 if(done===6)complete();
}
function sayExcellent(){speakAppFeedback('Excellent!');}
function popup(text){el('pz-pop-title').textContent=text;el('pz-pop').hidden=false;}
function complete(){
 busy=true;const token=session;popup('Excellent!');sayExcellent();
 timer=setTimeout(()=>{
  if(token!==session||!screen.classList.contains('active'))return;
  el('pz-pop').hidden=true;
  if(round<9){round++;loadRound();}
  else{popup('All Done!');announceAllDone();timer=setTimeout(()=>{if(token!==session||!screen.classList.contains('active'))return;stop();showScreen('home-screen');},2000);}
 },2000);
}
window.addEventListener('resize',cancelDrag);
})();
