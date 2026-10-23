
    (function(){
        if(!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance==='undefined') return;
        var synth=window.speechSynthesis, cache={}, voices=[];
        var QUALITY=/natural|neural|online|enhanced|premium|google|siri|wavenet/i;
        var FEMALE=/female|wanita|yasmin|amira|gadis|damayanti|samantha|zira|aria|jenny|ava|allison|susan|karen|moira|tessa|serena|libby|sonia|emma|michelle|hazel|catherine|kate|fiona/i;
        var MALE=/\bmale\b|lelaki|osman|ardi|david|mark|guy|daniel|alex|fred|ryan|thomas|george|james|rishi/i;
        var NOVELTY=/whisper|bad news|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|zarvox|albert|bahh|junior|ralph|wobble|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
        var PREF={ms:['ms-my','ms'], en:['en-us','en-gb','en-au','en']};
        function norm(l){return String(l||'').toLowerCase().replace('_','-');}
        function load(){voices=synth.getVoices()||[];cache={};}
        function pick(lang){
            if(!voices.length) load();
            if(cache[lang]!==undefined) return cache[lang];
            var want=PREF[lang], best=null, top=-1e9;
            voices.forEach(function(v){
                var l=norm(v.lang), n=v.name||'';
                var i=want.findIndex(function(w){return l===w||l.indexOf(w+'-')===0;});
                if(i<0||NOVELTY.test(n)) return;
                var sc=100-i*20;
                if(QUALITY.test(n)) sc+=30;
                if(FEMALE.test(n)) sc+=15;
                if(MALE.test(n)) sc-=10;
                if(v.localService) sc+=2;
                if(sc>top){top=sc;best=v;}
            });
            if(voices.length) cache[lang]=best;
            return best;
        }
        load();
        if(synth.addEventListener) synth.addEventListener('voiceschanged',load);
        else synth.onvoiceschanged=load;
        function langOf(u){
            var l=norm(u.lang)||norm(u.voice&&u.voice.lang)||norm(document.documentElement.lang);
            return (l.indexOf('ms')===0||l.indexOf('id')===0)?'ms':'en';
        }
        var nativeSpeak=synth.speak;
        synth.speak=function(u){
            try{
                if(u instanceof SpeechSynthesisUtterance){
                    var lang=langOf(u), v=pick(lang);
                    if(v){u.voice=v;u.lang=v.lang;}
                    else u.lang=lang==='ms'?'ms-MY':'en-US';
                    var r=Number(u.rate)||1;
                    u.rate=Math.min(0.92,Math.max(0.72,r));
                    u.pitch=1;
                    u.volume=1;
                }
            }catch(e){}
            if(synth.paused) synth.resume();
            return nativeSpeak.call(synth,u);
        };
        window.KiddoraVoice={pick:pick,reload:load};
    })();
    