
/* KIDDORA Malay: prerecorded Yasmin audio, independent of installed device voices. */
(function(){
'use strict';
const bank=window.KiddoraMalayAudioBank;
const canonical=text=>String(text||'').normalize('NFC').toLowerCase().replace(/[+]/g,' tambah ').replace(/[=]/g,' sama dengan ').replace(/\s[-−]\s/g,' tolak ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const clips=new Map(),trie=Object.create(null);
for(const [text,mp3] of Object.entries(bank)){
 const key=canonical(text);if(!key||clips.has(key))continue;clips.set(key,mp3);
 let node=trie;for(const word of key.split(' '))node=node[word]||(node[word]=Object.create(null));node.$=key;
}
function resolve(text){
 const key=canonical(text);if(!key)return [];
 if(clips.has(key))return [key];
 const words=key.split(' '),parts=[];
 for(let i=0;i<words.length;){let node=trie,last=null,end=i;
  for(let j=i;j<words.length&&node[words[j]];j++){node=node[words[j]];if(node.$){last=node.$;end=j+1}}
  if(!last)return null;parts.push(last);i=end;
 }return parts;
}
if(typeof window.SpeechSynthesisUtterance==='undefined'){
 window.SpeechSynthesisUtterance=class extends EventTarget{constructor(text=''){super();this.text=text;this.lang='';this.rate=1;this.pitch=1;this.volume=1;for(const type of ['start','end','error','pause','resume'])this.addEventListener(type,e=>this['on'+type]?.(e));}};
}
if(!window.speechSynthesis){Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],speak(u){setTimeout(()=>u.onerror?.({error:'synthesis-unavailable'}),0)},cancel(){},pause(){},resume(){},addEventListener(){},removeEventListener(){}},configurable:true})}
const synth=window.speechSynthesis;
const native={};for(const k of ['speak','cancel','pause','resume','getVoices'])native[k]=synth[k].bind(synth);
const media=new Audio();media.preload='auto';media.setAttribute('playsinline','');
let queue=[],current=null,paused=false,serial=0,hasStarted=false,clipIndex=0,clipKeys=[],nativeCleanup=null;
function isMalay(u){return /^(ms|id)(-|_|$)/i.test(u.lang||u.voice?.lang||document.documentElement.lang)}
function fire(u,type,error){
 let event;try{event=new Event(type);Object.defineProperties(event,{utterance:{value:u},elapsedTime:{value:0},charIndex:{value:type==='end'?u.text.length:0},...(error?{error:{value:error}}:{})});u.dispatchEvent(event)}catch(e){console.warn('KIDDORA speech event',e)}
 // Some shims have callback properties without native event-handler plumbing.
 if(!(u instanceof EventTarget)||window.KiddoraVoiceTestShim)u['on'+type]?.(event||{type,error});
}
function clearMedia(){media.onplaying=null;media.onended=null;media.onerror=null;media.pause();media.removeAttribute('src');media.load()}
function finish(type,error){
 const job=current;if(!job)return;current=null;hasStarted=false;clipKeys=[];
 if(nativeCleanup){nativeCleanup();nativeCleanup=null}clearMedia();
 fire(job.u,type,error);drain();
}
function playClip(){
 if(!current||!current.malay||paused)return;
 if(clipIndex>=clipKeys.length){finish('end');return}
 const job=current,id=serial;
 media.src='data:audio/mpeg;base64,'+clips.get(clipKeys[clipIndex]);media.playbackRate=1;media.volume=Math.max(0,Math.min(1,Number(job.u.volume??1)));
 media.onplaying=()=>{if(current!==job||id!==serial||paused)return;if(!hasStarted){hasStarted=true;fire(job.u,'start')}};
 media.onended=()=>{if(current!==job||id!==serial)return;clipIndex++;playClip()};
 media.onerror=()=>{if(current===job&&id===serial)finish('error','audio-unavailable')};
 const p=media.play();if(p?.catch)p.catch(e=>{if(current===job&&id===serial&&e.name!=='AbortError')finish('error',e.name==='NotAllowedError'?'not-allowed':'audio-unavailable')});
}
function drain(){
 if(current||paused||!queue.length)return;current=queue.shift();hasStarted=false;
 if(!current.malay){
  const job=current;const ended=()=>{if(current===job){current=null;if(nativeCleanup){nativeCleanup();nativeCleanup=null}drain()}};
  job.u.addEventListener('end',ended);job.u.addEventListener('error',ended);
  nativeCleanup=()=>{job.u.removeEventListener('end',ended);job.u.removeEventListener('error',ended)};
  native.speak(job.u);return;
 }
 clipKeys=resolve(current.u.text);clipIndex=0;
 if(clipKeys===null){const job=current;console.warn('KIDDORA Malay clip missing:',current.u.text);setTimeout(()=>{if(current===job)finish('error','audio-unavailable')},0);return}
 if(!clipKeys.length){const job=current;queueMicrotask(()=>{if(current===job)finish('end')});return}playClip();
}
synth.speak=function(u){if(!u)return;queue.push({u,malay:isMalay(u)});drain()};
synth.cancel=function(){serial++;queue=[];current=null;hasStarted=false;paused=false;if(nativeCleanup){nativeCleanup();nativeCleanup=null}clearMedia();native.cancel()};
synth.pause=function(){paused=true;if(current?.malay){media.pause();fire(current.u,'pause')}else native.pause()};
synth.resume=function(){const wasPaused=paused;paused=false;if(current?.malay){if(wasPaused){const job=current,id=serial;media.play().catch(e=>{if(current===job&&serial===id&&e.name!=='AbortError')finish('error','not-allowed')});fire(job.u,'resume')}}else native.resume();drain()};
for(const [key,get]of Object.entries({speaking:()=>!!current,pending:()=>!!queue.length,paused:()=>paused})){
 try{Object.defineProperty(synth,key,{configurable:true,get})}catch(e){}
}
// Unlock this same media element during a real tap for mobile browsers.
const silent='audio/asset-b9ed3a70d0b20bde.wav';
function unlock(){if(current)return;media.src=silent;const id=serial;const p=media.play();p?.then(()=>{if(!current&&id===serial)media.pause()}).catch(()=>{})}
document.addEventListener('pointerdown',unlock,{capture:true});
window.KiddoraVoice=Object.assign(window.KiddoraVoice||{},{recordedMalay:true,resolveMalay:resolve,voiceName:'Yasmin — Bahasa Melayu (Malaysia)',clipCount:clips.size});
})();

