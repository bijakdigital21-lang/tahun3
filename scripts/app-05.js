
        // Mobile browsers may suspend or interrupt Web Audio after a long pause.
        let audioCtx = null;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        function replaceSoundContext() {
            if (!AudioContextClass) return null;
            const previous = audioCtx;
            try { audioCtx = new AudioContextClass(); }
            catch (error) { audioCtx = null; return null; }
            if (previous && previous !== audioCtx && previous.state !== 'closed') {
                try { previous.close().catch(() => {}); } catch (error) {}
            }
            return audioCtx;
        }
        function getSoundContext() {
            if (!AudioContextClass) return null;
            if (!audioCtx || audioCtx.state === 'closed') return replaceSoundContext();
            return audioCtx;
        }
        function resumeSoundContext(ctx) {
            if (!ctx || ctx.state === 'running') return;
            // Resume must start during the tap itself for mobile autoplay rules.
            try { ctx.resume().catch(() => {}); } catch (error) {}
        }
        function playAppSound(draw) {
            let ctx = getSoundContext();
            if (!ctx) return;
            if (ctx.state === 'interrupted') ctx = replaceSoundContext();
            if (!ctx) return;
            if (ctx.state === 'running') {
                try { draw(ctx); } catch (error) { console.warn('Sound could not play:', error); }
                return;
            }
            // One tap can recover an interrupted context; a stalled resume cannot
            // block later taps indefinitely. Keep the original sound for this tap.
            let completed = false;
            const attempt = ctx;
            const finish = () => {
                if (completed || attempt !== audioCtx || attempt.state !== 'running') return;
                completed = true;
                try { draw(attempt); } catch (error) { console.warn('Sound could not play:', error); }
            };
            try { attempt.resume().then(finish, () => {}); } catch (error) {}
            const started = Date.now();
            const check = () => {
                if (completed || attempt !== audioCtx) return;
                if (attempt.state === 'running') { finish(); return; }
                if (Date.now() - started < 700) { setTimeout(check, 100); return; }
                ctx = replaceSoundContext();
                if (!ctx) return;
                // A new context is created while this tap is still being handled.
                try { ctx.resume().then(() => {
                    if (ctx === audioCtx && ctx.state === 'running' && !completed) {
                        completed = true;
                        draw(ctx);
                    }
                }, () => {}); } catch (error) {}
            };
            setTimeout(check, 100);
        }
        function wakeAppSound() {
            const ctx = getSoundContext();
            if (ctx && ctx.state === 'interrupted') {
                resumeSoundContext(replaceSoundContext());
            } else {
                resumeSoundContext(ctx);
            }
        }
        document.addEventListener('pointerdown', wakeAppSound, {passive: true});
        document.addEventListener('touchstart', wakeAppSound, {passive: true});
        document.addEventListener('keydown', wakeAppSound);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && audioCtx) wakeAppSound();
        });
        window.addEventListener('pageshow', () => { if (audioCtx) wakeAppSound(); });

        function playCompletionApplause() {
            return playAppSound((ctx) => {
                const duration=0.16, sampleRate=ctx.sampleRate;
                const buffer=ctx.createBuffer(1,Math.ceil(sampleRate*duration),sampleRate);
                const samples=buffer.getChannelData(0);
                for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1);
                const now=ctx.currentTime;
                for(const offset of [0,.11,.22,.34,.47,.60,.75,.91]){
                    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
                    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1100+(offset*420);
                    gain.gain.setValueAtTime(.001,now+offset);
                    gain.gain.exponentialRampToValueAtTime(.24,now+offset+.012);
                    gain.gain.exponentialRampToValueAtTime(.001,now+offset+duration);
                    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
                    source.start(now+offset);source.stop(now+offset+duration);
                }
            });
        }
        function speakAppFeedback(text) {
            if(!('speechSynthesis' in window))return;
            speechSynthesis.cancel();
            const ms=typeof currentGlobalLang!=='undefined'&&currentGlobalLang==='ms';
            const labels={'correct':'Betul!','all done':'Semua selesai!','excellent':'Bagus!'};
            const voice=new SpeechSynthesisUtterance(ms?(labels[String(text).toLowerCase().replace(/[!.]/g,'').trim()]||text):text);
            voice.lang=ms?'ms-MY':'en-US';voice.rate=.8;voice.pitch=1.05;
            window.appFeedbackVoice=voice;
            speechSynthesis.speak(voice);
        }
        function announceAllDone() {
            playCompletionApplause();
            speakAppFeedback('All done');
        }

        // Begin a silent audio stream during the actual Log in tap. Browsers can
        // otherwise block sound when the Firebase request finishes asynchronously.
        let loginWelcomeBufferPromise = null;
        let loginWelcomeSource = null;
        let loginWelcomeAudioToken = 0;
        let loginWelcomePendingGesture = false;
        function replayWelcomeOnGesture() {
            if (!loginWelcomePendingGesture) return;
            loginWelcomePendingGesture = false;
            window.playLoginWelcomeAudio();
        }
        document.addEventListener('pointerdown', replayWelcomeOnGesture, {capture: true});
        document.addEventListener('keydown', replayWelcomeOnGesture, {capture: true});
        // Background music starts only after the KIDDORA intro has finished.
        function onLoginWelcomeFinished() {
            if (window.startBgMusicAfterIntro) window.startBgMusicAfterIntro();
        }
        (function() {
            const introAudio = document.getElementById('login-welcome-audio');
            introAudio.addEventListener('ended', () => {
                if (!introAudio.loop) onLoginWelcomeFinished();
            });
        })();
        window.prepareLoginWelcomeAudio = function() {
            const audio = document.getElementById('login-welcome-audio');
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 0;
            audio.loop = true;
            audio.play().catch(() => {});

            // The click sound already unlocks this context; keep it as a fallback.
            const ctx = getSoundContext();
            if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
            if (!loginWelcomeBufferPromise && ctx) {
                loginWelcomeBufferPromise = fetch(audio.src)
                    .then(response => response.arrayBuffer())
                    .then(bytes => ctx.decodeAudioData(bytes))
                    .catch(error => { loginWelcomeBufferPromise = null; throw error; });
            }
        };
        window.stopLoginWelcomeAudio = function() {
            if (window.resetBgMusicForIntro) window.resetBgMusicForIntro();
            loginWelcomeAudioToken++;
            loginWelcomePendingGesture = false;
            if (loginWelcomeSource) {
                try { loginWelcomeSource.stop(); } catch (error) {}
                loginWelcomeSource = null;
            }
            const audio = document.getElementById('login-welcome-audio');
            audio.pause();
            audio.loop = false;
            audio.currentTime = 0;
            audio.volume = 1;
        };
        window.playLoginWelcomeAudio = async function() {
            const token = ++loginWelcomeAudioToken;
            loginWelcomePendingGesture = false;
            const audio = document.getElementById('login-welcome-audio');
            audio.currentTime = 0;
            audio.loop = false;
            audio.volume = 1;
            if (!audio.paused) return; // The silent stream is now audible.
            try {
                await audio.play();
                return;
            } catch (error) { console.warn('Welcome media playback was blocked:', error); }
            // Recover with the audio context unlocked by the Log in tap.
            try {
                const buffer = await loginWelcomeBufferPromise;
                if (token !== loginWelcomeAudioToken) return;
                const ctx = getSoundContext();
                if (buffer && ctx && ctx.state === 'running') {
                    if (loginWelcomeSource) loginWelcomeSource.stop();
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(ctx.destination);
                    source.onended = () => {
                        if (loginWelcomeSource === source) {
                            loginWelcomeSource = null;
                            if (token === loginWelcomeAudioToken) onLoginWelcomeFinished();
                        }
                    };
                    loginWelcomeSource = source;
                    source.start();
                    return;
                }
            } catch (error) { console.warn('Welcome audio could not play:', error); }
            // A restored session after refresh has no fresh user gesture. Retry on first tap.
            if (token === loginWelcomeAudioToken) loginWelcomePendingGesture = true;
        };

        function playClickSound() {
            return playAppSound((audioCtx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
            });
        }

        function playCorrectSound() {
            return playAppSound((audioCtx) => {
            const now = audioCtx.currentTime;
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(523.25, now); 
            gain1.gain.setValueAtTime(0.3, now);
            gain1.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(659.25, now + 0.1); 
            gain2.gain.setValueAtTime(0.3, now + 0.1);
            gain2.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.1);
            osc2.stop(now + 0.3);
            });
        }

        function playWrongSound() {
            return playAppSound((audioCtx) => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(130, now + 0.25);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.25);
            });
        }

        let currentGlobalLang = 'en';

        function setGlobalLanguage(lang) {
            currentGlobalLang = (lang === 'ms' ? 'ms' : 'en');
            if(typeof updateCompleteAnimalLanguage === 'function') updateCompleteAnimalLanguage();
            document.documentElement.lang = currentGlobalLang === 'ms' ? 'ms' : 'en';
            document.getElementById('forgot-password-btn').textContent = currentGlobalLang === 'ms' ? 'Lupa kata laluan?' : 'Forgot password?';
            setTimeout(()=>{ if(typeof updateColourLanguage === 'function') updateColourLanguage(); if(typeof updateBodyLanguage === 'function') updateBodyLanguage(); if(typeof updateShapeLanguage === 'function') updateShapeLanguage(); if(typeof updateTransportLanguage === 'function') updateTransportLanguage(); if(typeof updateFoodLanguage === 'function') updateFoodLanguage(); if(typeof updateJobsLanguage === 'function') updateJobsLanguage(); if(typeof updateInstallTutorialLanguage === 'function') updateInstallTutorialLanguage(); if(typeof updateBijakSukuKataLanguage === 'function') updateBijakSukuKataLanguage(); },0);
            
            document.getElementById("lang-btn-en").classList.remove("active");
            document.getElementById("lang-btn-ms").classList.remove("active");

            if(lang === 'en') {
                document.getElementById("lang-btn-en").classList.add("active");
                
                document.getElementById("nav-home-text").innerHTML = "📚 Home";
                document.getElementById("nav-profile-text").innerHTML = "👤 Profiles";
                document.getElementById("nav-scores-text").innerHTML = "🏆 Scores";
                document.getElementById("nav-install-text").innerHTML = "📲 Add this app to home screen";
                document.getElementById("nav-logout-text").innerHTML = "🚪 Logout";

                const curName = window.activeProfile || "-";
                document.getElementById("home-greeting").innerText = `Hi ${curName}! 👋`;
                const switchProfileBtnEn = document.getElementById("switch-profile-text-btn");
                if (switchProfileBtnEn) switchProfileBtnEn.innerText = "Switch 🔄";
                document.getElementById("home-subtitle-text").innerText = "Pick a fun module below to start learning!";

                document.getElementById("abc-menu-title").innerText = "ABC Modules 🔤";
                document.getElementById("abc-menu-desc").innerText = "Choose your preferred activity to learn the alphabet!";
                document.getElementById("abc-main-icon").innerText = "🇬🇧";
                document.getElementById("abc-dynamic-btn-text").innerText = "Learn ABC";
                document.getElementById("match-letters-menu-text").innerText = "Match the Letters";
                document.getElementById("find-letter-menu-text").innerText = "Find the Letter";
                document.getElementById("abc-back-home-btn").innerText = "Back to Home 🏠";

                document.getElementById("animal-menu-title").innerText = "Animal Module 🦁";
                document.getElementById("animal-menu-desc").innerText = "Choose an activity to explore the animal kingdom!";
                document.getElementById("learn-animal-btn-text").innerText = "1) Learn Animal";
                document.getElementById("match-animal-btn-text").innerText = "2) Match the Animal";
                document.getElementById("find-animal-btn-text").innerText = "3) Find the Animal";

                document.getElementById("match-count-title").innerText = "Match the Letters 🔠";
                document.getElementById("match-count-desc").innerText = "Select how many pages/sets you want to play:";
                document.getElementById("set-5-text").innerText = "5";
                document.getElementById("set-10-text").innerText = "10";
                document.getElementById("set-15-text").innerText = "15";
                document.getElementById("match-count-back-btn").innerText = "Back ↩️";

                document.getElementById("match-header-title").innerText = "Match Letters";
                document.getElementById("match-page-label").innerText = "Page";
                document.getElementById("match-score-label").innerText = "Score";
                document.getElementById("match-instruction-desc").innerText = "Drag a line to match the lowercase letter on the left with the uppercase letter on the right!";
                document.getElementById("match-next-page-text").innerText = "Next Page ➔";
                document.getElementById("match-home-btn").innerText = "Home 🏠";

                document.getElementById("find-header-title").innerText = "Find the Letter 🍎";
                document.getElementById("find-round-label").innerText = "Round";
                document.getElementById("find-score-label").innerText = "Score";
                if(document.getElementById("basket-label-text")) document.getElementById("basket-label-text").innerText = "Basket 🧺";
                document.getElementById("find-next-round-text").innerText = "Next Round ➔";
                document.getElementById("find-back-btn").innerText = "Back ↩️";

                document.getElementById("abc-screen-title").innerText = "Learn ABC";
                document.getElementById("abc-sound-btn").innerHTML = "🔊 Listen";
                document.getElementById("prev-abc-btn").innerText = "⬅ Prev";
                document.getElementById("abc-flash-back-btn").innerText = "Back ↩️";
                document.getElementById("next-abc-btn").innerText = "Next ➡";

                document.getElementById("lesson-main-title").innerText = "Lesson Time! 📖";
                document.getElementById("lesson-examples-label").innerText = "Examples:";
                document.getElementById("lesson-choose-q-btn").innerText = "Choose Questions 🚀";
                document.getElementById("lesson-home-btn").innerText = "Home 🏠";

                document.getElementById("count-sel-title").innerText = "Select Question Count 📝";
                document.getElementById("count-sel-desc").innerText = "How many questions would you like to answer?";
                document.getElementById("q-5-text").innerText = "5 Questions";
                document.getElementById("q-10-text").innerText = "10 Questions";
                document.getElementById("count-sel-back-btn").innerText = "Back ↩️";

                document.getElementById("profile-acc-title").innerText = "Account & Profiles 👤";
                document.getElementById("acc-email-label").innerText = "Account Email:";
                document.getElementById("active-kid-label").innerText = "Active Kid Profile:";
                document.getElementById("switch-add-prof-btn").innerText = "Switch / Add Profiles 🔄";
                document.getElementById("manage-prof-title").innerText = "✏️ Manage Profiles (Edit / Delete)";
                document.getElementById("change-pass-title").innerText = "🔐 Change Password";
                document.getElementById("curr-pass-label").innerText = "Current Password";
                document.getElementById("new-pass-label").innerText = "New Password (Min. 6 characters)";
                document.getElementById("update-pass-btn").innerText = "Update Password 🔑";
                document.getElementById("profile-home-btn").innerText = "Back to Home 🏠";

                document.getElementById("scores-history-title").innerText = "🏆 Quiz Attempt History";
                document.getElementById("scores-history-desc").innerText = "Records of every quiz session completed!";
                document.getElementById("th-no").innerText = "No.";
                document.getElementById("th-module").innerText = "Module";
                document.getElementById("th-score").innerText = "Score (%)";
                document.getElementById("th-date").innerText = "Date & Time";
                document.getElementById("scores-home-btn").innerText = "Back to Home 🏠";
                document.getElementById("clear-history-btn").innerText = "Clear History 🗑️";

                document.getElementById("quiz-q-label").innerText = "Question";
                document.getElementById("quiz-score-label").innerText = "Score";
                document.getElementById("quiz-next-btn-text").innerText = "Next Question ➔";
                document.getElementById("quiz-home-btn").innerText = "Home 🏠";

                document.getElementById("result-title").innerText = "Awesome Job! 🎉";
                document.getElementById("result-desc").innerText = "You have completed the quiz!";
                document.getElementById("result-menu-btn").innerText = "Back to Menu 🏠";

            } else {
                document.getElementById("lang-btn-ms").classList.add("active");
                
                document.getElementById("nav-home-text").innerHTML = "📚 Utama";
                document.getElementById("nav-profile-text").innerHTML = "👤 Profil";
                document.getElementById("nav-scores-text").innerHTML = "🏆 Skor";
                document.getElementById("nav-install-text").innerHTML = "📲 Tambah aplikasi ke skrin utama";
                document.getElementById("nav-logout-text").innerHTML = "🚪 Keluar";

                const curName = window.activeProfile || "-";
                document.getElementById("home-greeting").innerText = `Hai ${curName}! 👋`;
                const switchProfileBtnMs = document.getElementById("switch-profile-text-btn");
                if (switchProfileBtnMs) switchProfileBtnMs.innerText = "Tukar 🔄";
                document.getElementById("home-subtitle-text").innerText = "Pilih modul menarik di bawah untuk mula belajar!";

                document.getElementById("abc-menu-title").innerText = "Modul ABC 🔤";
                document.getElementById("abc-menu-desc").innerText = "Pilih aktiviti kegemaran anda untuk belajar abjad!";
                document.getElementById("abc-main-icon").innerText = "🇲🇾";
                document.getElementById("abc-dynamic-btn-text").innerText = "Belajar ABC";
                document.getElementById("match-letters-menu-text").innerText = "Suaikan Huruf";
                document.getElementById("find-letter-menu-text").innerText = "Cari Huruf";
                document.getElementById("abc-back-home-btn").innerText = "Back to Home 🏠";

                document.getElementById("animal-menu-title").innerText = "Modul Haiwan 🦁";
                document.getElementById("animal-menu-desc").innerText = "Pilih aktiviti untuk meneroka alam haiwan!";
                document.getElementById("learn-animal-btn-text").innerText = "1) Belajar Haiwan";
                document.getElementById("match-animal-btn-text").innerText = "2) Suaikan Haiwan";
                document.getElementById("find-animal-btn-text").innerText = "3) Cari Haiwan";

                document.getElementById("match-count-title").innerText = "Suaikan Huruf 🔠";
                document.getElementById("match-count-desc").innerText = "Pilih berapa banyak set yang anda mahu mainkan:";
                document.getElementById("set-5-text").innerText = "5 Set";
                document.getElementById("set-10-text").innerText = "10 Set";
                document.getElementById("set-15-text").innerText = "15 Set";
                document.getElementById("match-count-back-btn").innerText = "Back ↩️";

                document.getElementById("match-header-title").innerText = "Suaikan Huruf";
                document.getElementById("match-page-label").innerText = "Halaman";
                document.getElementById("match-score-label").innerText = "Skor";
                document.getElementById("match-instruction-desc").innerText = "Tarik garis (drag) untuk menyesuaikan huruf kecil di sebelah kiri dengan huruf besar di sebelah kanan!";
                document.getElementById("match-next-page-text").innerText = "Next Page ➔";
                document.getElementById("match-home-btn").innerText = "Utama 🏠";

                document.getElementById("find-header-title").innerText = "Cari Huruf 🍎";
                document.getElementById("find-round-label").innerText = "Pusingan";
                document.getElementById("find-score-label").innerText = "Skor";
                if(document.getElementById("basket-label-text")) document.getElementById("basket-label-text").innerText = "Bakul 🧺";
                document.getElementById("find-next-round-text").innerText = "Next ➔";
                document.getElementById("find-back-btn").innerText = "Back ↩️";

                document.getElementById("abc-screen-title").innerText = "Belajar ABC";
                document.getElementById("abc-sound-btn").innerHTML = "🔊 Dengar";
                document.getElementById("prev-abc-btn").innerText = "⬅ Prev";
                document.getElementById("abc-flash-back-btn").innerText = "Back ↩️";
                document.getElementById("next-abc-btn").innerText = "Next ➡";

                document.getElementById("lesson-main-title").innerText = "Masa Pembelajaran! 📖";
                document.getElementById("lesson-examples-label").innerText = "Contoh:";
                document.getElementById("lesson-choose-q-btn").innerText = "Pilih Soalan 🚀";
                document.getElementById("lesson-home-btn").innerText = "Utama 🏠";

                document.getElementById("count-sel-title").innerText = "Pilih Bilangan Soalan 📝";
                document.getElementById("count-sel-desc").innerText = "Berapa banyak soalan yang anda ingin jawab?";
                document.getElementById("q-5-text").innerText = "5 Soalan";
                document.getElementById("q-10-text").innerText = "10 Soalan";
                document.getElementById("count-sel-back-btn").innerText = "Back ↩️";

                document.getElementById("profile-acc-title").innerText = "Akaun & Profil 👤";
                document.getElementById("acc-email-label").innerText = "Emel Akaun:";
                document.getElementById("active-kid-label").innerText = "Profil Aktif:";
                document.getElementById("switch-add-prof-btn").innerText = "Tukar / Tambah Profil 🔄";
                document.getElementById("manage-prof-title").innerText = "✏️ Urus Profil (Sunting / Padam)";
                document.getElementById("change-pass-title").innerText = "🔐 Tukar Kata Laluan";
                document.getElementById("curr-pass-label").innerText = "Kata Laluan Semasa";
                document.getElementById("new-pass-label").innerText = "Kata Laluan Baharu (Min. 6 aksara)";
                document.getElementById("update-pass-btn").innerText = "Kemaskini Kata Laluan 🔑";
                document.getElementById("profile-home-btn").innerText = "Back to Home 🏠";

                document.getElementById("scores-history-title").innerText = "🏆 Sejarah Percubaan Kuiz";
                document.getElementById("scores-history-desc").innerText = "Rekod bagi setiap sesi kuiz yang telah diselesaikan!";
                document.getElementById("th-no").innerText = "No.";
                document.getElementById("th-module").innerText = "Modul";
                document.getElementById("th-score").innerText = "Skor (%)";
                document.getElementById("th-date").innerText = "Tarikh & Masa";
                document.getElementById("scores-home-btn").innerText = "Back to Home 🏠";
                document.getElementById("clear-history-btn").innerText = "Kosongkan Sejarah 🗑️";

                document.getElementById("quiz-q-label").innerText = "Soalan";
                document.getElementById("quiz-score-label").innerText = "Skor";
                document.getElementById("quiz-next-btn-text").innerText = "Next Question ➔";
                document.getElementById("quiz-home-btn").innerText = "Utama 🏠";

                document.getElementById("result-title").innerText = "Syabas, Hebat! 🎉";
                document.getElementById("result-desc").innerText = "Anda telah menyiapkan kuiz ini!";
                document.getElementById("result-menu-btn").innerText = "Back to Menu 🏠";
            }

            // Pastikan Modul Number/123 turut mengikut pilihan bahasa global.
            updateNumberLanguage();

            if(document.getElementById("find-letter-screen").classList.contains("active")) {
                const targetLetter = document.getElementById("find-instruction-text").innerText.slice(-1);
                const instructionText = currentGlobalLang === 'en' ? `Find and put letter ${targetLetter} into the basket` : `Tolong masukkan huruf ${targetLetter} ke dalam bakul`;
                document.getElementById("find-instruction-text").innerText = instructionText;
            }
            if (document.getElementById("learn-animal-cat-screen")?.classList.contains("active")) {
                try { openLearnAnimalCategoryScreen(); } catch(e) {}
            }
            try { refreshCurrentLanguageView(); } catch(e) { console.warn("Language refresh", e); }
        }


        // =========================================================
        // GLOBAL BILINGUAL SAFETY LAYER
        // - prevents one missing element from breaking language switching
        // - keeps Prev / Next / Back navigation in English for BOTH languages
        // - refreshes currently visible dynamic module after language changes
        // =========================================================
        function enforceEnglishNavigationLabels(root=document) {
            const exactMap = new Map([
                ['⬅ Sebelum','⬅ Prev'], ['⬅ Sebelumnya','⬅ Prev'], ['Sebelum','Prev'],
                ['Seterusnya ➡','Next ➡'], ['Seterusnya','Next'],
                ['Halaman Seterusnya ➔','Next Page ➔'], ['Soalan Seterusnya ➔','Next Question ➔'],
                ['Set Seterusnya ➡','Next Set ➡'], ['Pusingan Seterusnya ➔','Next Round ➔'],
                ['Kembali ↩️','Back ↩️'], ['Kembali','Back'],
                ['Kembali ke Utama 🏠','Back to Home 🏠'], ['Kembali ke Menu 🏠','Back to Menu 🏠'],
                ['Kembali ke Bentuk 🔷','Back to Shape 🔷']
            ]);
            const nodes = root.querySelectorAll ? root.querySelectorAll('button, a.action-btn, .action-btn') : [];
            nodes.forEach(el => {
                const t = (el.textContent || '').trim();
                if (exactMap.has(t)) el.textContent = exactMap.get(t);
            });
        }

        function refreshCurrentLanguageView() {
            // Module-specific refreshers are written defensively so a missing module cannot break the rest.
            const refreshers = ['updateNumberLanguage','updateColourLanguage','updateBodyLanguage','updateShapeLanguage','updateTransportLanguage'];
            refreshers.forEach(name => {
                try { if (typeof window[name] === 'function') window[name](); } catch(e) { console.warn(name, e); }
            });

            // Animal module has several dynamic views.
            try {
                if (document.getElementById('learn-animal-cat-screen')?.classList.contains('active') && typeof openLearnAnimalCategoryScreen === 'function') openLearnAnimalCategoryScreen();
            } catch(e) {}
            try {
                if (document.getElementById('learn-animal-screen')?.classList.contains('active') && typeof renderAnimalFlashcard === 'function') renderAnimalFlashcard();
            } catch(e) {}
            try {
                if (document.getElementById('find-animal-game-screen')?.classList.contains('active') && typeof renderFindAnimalQuestion === 'function') renderFindAnimalQuestion();
            } catch(e) {}

            // ABC dynamic views.
            try {
                if (document.getElementById('abc-flashcard-screen')?.classList.contains('active') && typeof updateABCFlashcard === 'function') updateABCFlashcard();
            } catch(e) {}

            enforceEnglishNavigationLabels();
        }

        // Keep dynamically rendered navigation labels in English too.
        const navLanguageObserver = new MutationObserver(() => enforceEnglishNavigationLabels());
        window.addEventListener('DOMContentLoaded', () => {
            try { navLanguageObserver.observe(document.body, {subtree:true, childList:true, characterData:true}); } catch(e) {}
            setTimeout(() => {
                try { setGlobalLanguage('en'); } catch(e) { console.error('Language init error:', e); }
            }, 0);
        });

        // --- ANIMAL MODULE DATA & LOGIC ---
        const animalMasterDatabase = [
            //1. Haiwan Ladang
            { bm: "Lembu", en: "Cow", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStslX4G-_9xCjQdnEJMMl7S153DXd6KkbKvggysRzFQA&s=10" },
            { bm: "Kambing", en: "Goat", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQYqYtocmpyCqLUl7ncsCDrqy-oNWmr9pEhy2mZRhzwWw&s=10" },
            { bm: "Biri-biri", en: "Sheep", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTj7o2W8WwUs4DPKjn7KGlMm0efIyiAiS6_PUexp9_Oag&s=10" },
            { bm: "Kuda", en: "Horse", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7Bot7-5A6kUT917jcVFGGymrH29K_3d90zmuwW-nsTA&s=10" },
            { bm: "Ayam", en: "Chicken", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkZk1f9khOvtp5w2M9iQ2Wh_dilo8nYVfOi_vr-wIDHQ&s=10" },
            { bm: "Itik", en: "Duck", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4tmGR0ZdEiU8_gs4ocMIhemNwmMIWzOA-lrOPfv7QSA&s=10" },
            { bm: "Angsa", en: "Goose", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTA-G1lwa454tCJeUhgd-M061nfUmRMkwEJw1C6h7XnOg&s=10" },
            { bm: "Arnab", en: "Rabbit", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSU3DCZnyH0y2PBTDZrKiO-0sIue3AaAYqMX1WrP0i7VQ&s=10" },
            { bm: "Babi", en: "Pig", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR8NovQ0-gOm3GRldZD9MbSCLMqWUz34DtYkgz0ibN_8Q&s=10" },
            { bm: "Kerbau", en: "Buffalo", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP7jVXT9OyFN12eLb6kiwdAtRTTe5nDDYlWJ7d_8zqZA&s=10" },
            { bm: "Keldai", en: "Donkey", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCLA0ToNE6XZnnGch_yYHc6swLupsow-nrQPDm-Y-vow&s=10" },
            { bm: "Ayam belanda", en: "Turkey", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ44kr-_lb_I31qK0U8KxS4P0fCUQdtMWVf4GDQnWxYDA&s=10" },
            { bm: "Alpaka", en: "Alpaca", cat: "Haiwan Ladang", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRO8hwTNRrOOhNqrXbDg7XEt3sHTPKPAwpmyDEhb1RtAA&s=10" },

            // 2. Haiwan Liar
            { bm: "Singa", en: "Lion", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTh22WYqsoPgSA1BW_WAdLps2MEdAjkf0FDh9IO5xUYPg&s=10" },
            { bm: "Harimau", en: "Tiger", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQyIDwwLCUXX7xbqMqbQrV_llvOSpKLblLtwhdNaDt_iA&s=10" },
            { bm: "Gajah", en: "Elephant", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQy2Sug6PhZJAHDR7cHQQBEYsV6mjPscqKCmYa3Fak7Dg&s=10" },
            { bm: "Zirafah", en: "Giraffe", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSi-DYB1Saa-dvMfeHz396pOyKNjwfxWly--okUiyWrA&s=10" },
            { bm: "Badak sumbu", en: "Rhinoceros", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwtYrjPDOYbXl7ZfFtUPmtIQGrmpKrCWgvheV1WMN16w&s=10" },
            { bm: "Kuda belang", en: "Zebra", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTTJNABGcOQYEWBaB11FKOxFA9KzaMzmWU3Dl4kLJyZ3g&s=10" },
            { bm: "Beruang", en: "Bear", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSjOPsbzhd2qgHz3YXAQ_q4e3sbcgtTmWa2t-c5Qyme7Q&s=10" },
            { bm: "Serigala", en: "Wolf", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkcsX4Gyzl1bvUoXGYcMOkXiwjw5VGrqMqfc_DEb_V1w&s=10" },
            { bm: "Musang", en: "Fox", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSlRK1NYlDSNHMyBZbxqQDKaBQIHIobBbgP-Lw3JWCPg&s=10" },
            { bm: "Rusa", en: "Deer", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTRtpKEvdJPgXMpkwa0oXL3LoHyanAHkjNs_t5aiuqmw&s=10" },
            { bm: "Kanggaru", en: "Kangaroo", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTywE0Ww3bVL5FyUKj029-3YtzsdHZ2oRVdjKPodRlSWg&s=10" },
            { bm: "Panda", en: "Panda", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQKHstdvEePqce-j1-RYydquKOd2SYP90ePbi375qVFMw&s=10" },
            { bm: "Koala", en: "Koala", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGMMcifZ0U7fo5FaRkM1k-c_MK5pU6BdL65uHo0W77iQ&s=10" },
            { bm: "Gorila", en: "Gorilla", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRdi28wWZOPZha1EIO74H-7Fs9fpuiXfI7_vjaTE3i17w&s=10" },
            { bm: "Cheetah", en: "Cheetah", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSaPk1YUceRcZJN-w0s3wYtU3afVOidW0GtvxRFtmBDOA&s=10" },
            { bm: "Leopard", en: "Leopard", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSXoCPo6KiX2-bpIoPDTps3uhUGufbox1kxywYmS5GdGA&s=10" },
            { bm: "Hyena", en: "Hyena", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQkk1NMJLpcJPyD0W_U_-7q-1Xtyd0HTHne7dBXKkRqDA&s=10" },
            { bm: "Unta", en: "Camel", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSet3QB29joGa0DKZC4rujOsyhrivsHCIVFoxHLm0B8SQ&s=10" },
            { bm: "Yak", en: "Yak", cat: "Haiwan Liar", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhYu9kNwK4Yr3wUDEXFsAAouedYnBz0iLfhdYFfJhdRw&s=10" },

            // 3. Haiwan Hutan
            { bm: "Monyet", en: "Monkey", cat: "Haiwan Hutan", img: "https://th.bing.com/th/id/OIP.B3DBNWn0u1xLZkLsLE6PywHaF7?w=240&h=192&c=7&r=0&o=7&pid=1.7&rm=3" },
            { bm: "Orang utan", en: "Orangutan", cat: "Haiwan Hutan", img: "images/asset-741da69692699730.webp" },
            { bm: "Cimpanzi", en: "Chimpanzee", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJeCC6J-Dk6CMasBp48vC8WQqvHv24lebfbcLbXGs9jA&s=10" },
            { bm: "Jaguar", en: "Jaguar", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8oe0ci3qkG52oDDQ7CVXQJHN6NKmmvZ-lSxv36Py0TA&s=10" },
            { bm: "Sloth", en: "Sloth", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTg_z4VIsTMTBqJcGLrHPriDO7fYPueFKcnSp3--F_PfA&s=10" },
            { bm: "Tapir", en: "Tapir", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSVAgwLkZ_nJt8yvufgBLMUeazBFg5gWvVL_eq86lxlww&s=10" },
            { bm: "Lemur", en: "Lemur", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTb1Jq3KMX4yWSidUvxU4CLBS4Xw8JYcBqL2tMPKMgDdQ&s=10" },
            { bm: "Panda merah", en: "Red Panda", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ-zAKp1KZp_o4bPnr3E1fdtghih816K_gbroKLhbxSGA&s=10" },
            { bm: "Tupai", en: "Squirrel", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJh9VmN0rB9zneJF2D7QaKAh8DrZE0oWEIykSpW0RiMg&s=10" },
            { bm: "Landak", en: "Porcupine", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRXRcXFXAIQQXmrGyVtDF4E-T793Swl84Dsew54_7AbLg&s=10" },
            { bm: "Kelawar", en: "Bat", cat: "Haiwan Hutan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRg0nj868ib7qgb__Fqjd25nPm6eS5rzFo9avsakHFU1w&s=10" },

            // 4. Haiwan Laut & Air
            { bm: "Ikan", en: "Fish", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqHStMH6A2CYnNaGF9t313zq12DR0li-nIs71790kfdg&s=10" },
            { bm: "Jerung", en: "Shark", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS0mPT3cd6x5EkciZ3G1r8sDNjHKVRmhHzsvtrPngnaBA&s=10" },
            { bm: "Ikan paus", en: "Whale", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTTrN2jsSD3I1lxpcFvTYACFzUN_-vdlQ4ntg2V5NcNwQ&s=10" },
            { bm: "Lumba-lumba", en: "Dolphin", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQak2Yx80r273UbxEMKBp7HadQWLhH51lXXS3PAKHMFqQ&s=10" },
            { bm: "Sotong", en: "Squid", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmt-ajqTdQILrofMIl0n-NrEx-SF7plGYNU9VARPQVsA&s=10" },
            { bm: "Kurita", en: "Octopus", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQJa-hd9KSvQRXqlnU3v9i6oKwqDF9zUum_NK-SGytd5w&s=10" },
            { bm: "Ketam", en: "Crab", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSj5zFXgFJxwJ4fTXRJ9gbnTGvwhRtDhNTFaY3Jo3W5uA&s=10" },
            { bm: "Udang", en: "Shrimp", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTA_8mp6qwBIBhrV6CjVf4AA4xn0QcMslqkhDyj5-YWCg&s=10" },
            { bm: "Lobster", en: "Lobster", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhnJSYDPHt9LsklkQglBZsrcaJEFdCfaNvbX1rrRm_DQ&s=10" },
            { bm: "Obor-obor", en: "Jellyfish", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTCNZ-82Ze1vYJG5VwtGNUx0ImwkVCdv6kTryRWFl6r0g&s=10" },
            { bm: "Tapak sulaiman", en: "Starfish", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSQvHQANvqbez2-Ds5Q61k1uis_Kaq-kLlb_0ekH5UsHA&s=10" },
            { bm: "Kuda laut", en: "Seahorse", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7dWM6hgg0Cpl7wD7IvOftczlmESVEd9oS0YuVrnTDqA&s=10" },
            { bm: "Pari", en: "Stingray", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-eL15sBDWWvZ266CuNwXRl35m9gtFECfPinoAx2EBIg&s=10" },
            { bm: "Belut", en: "Eel", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRKvmAxFNb3JkdIW0HhA-gaO-vbwT5h5kFHa-HGvoi-Dw&s=10" },
            { bm: "Kerang", en: "Clam", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSy5_AfhOhfDQgYPwnEqSzAwhwFJYscSAuDk89UKqfdOA&s=10" },
            { bm: "Tiram", en: "Oyster", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSbTxNKfRWt4KCFcvSxFVc3w1c_mmJT6pXXRYpviIgNoQ&s=10" },
            { bm: "Anjing laut", en: "Seal", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQbhPqyefdiAIkx1DA-8cj4Mjv6g2I7PCJqslz3eALJRg&s=10" },
            { bm: "Walrus", en: "Walrus", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSyUJyIgfwR2NirKb8kbVpytEIluY781rsYPlezc_w5hw&s=10" },
            { bm: "Penguin", en: "Penguin", cat: "Haiwan Laut & Air", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHSU7WKgKTYzccEqsJiFDsZeYSa9_fGfjqXJuwVoZ3A&s=10" },

            // 5. Reptilia
            { bm: "Ular", en: "Snake", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQipO50lzcmVKZKvRBoY2r8q7886a7Gzwsvp8dmbSNhJA&s=10" },
            { bm: "Buaya", en: "Crocodile", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfDMyWprSmGGw-TvDrj0KBKzGLF0SAD6dz3IcpmJx9sw&s=10" },
            { bm: "Cicak", en: "Lizard", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDu_DOFeLIPE9LY7gRE6HrFwMCdJwtJ8r1SOnBxft14w&s=10" },
            { bm: "Iguana", en: "Iguana", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIub8Op0iyPqRGiNm9cNCGW0qZxm5m3wJ_6F0LoYspMg&s=10" },
            { bm: "Kura-kura", en: "Tortoise", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSb0JVsZwdonX17tX9ENLKe5FgoBtQSicWHTiRGzvtN_g&s=10" },
            { bm: "Penyu", en: "Turtle", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSFc883nfgp8YbNBVjw3cMMXwXQMZM9OL9JAjZcgLneAw&s=10" },
            { bm: "Komodo", en: "Komodo Dragon", cat: "Reptilia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTDYhSMdQHmEuPWyRjULjDJ9Th8-NjnrtbZtaPBEC_WiA&s=10" },

            // 6. Serangga
            { bm: "Semut", en: "Ant", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRpfqBUIndN_tpMM3c1aKscz0pbHLDB-9jW3p84U0XdMg&s=10" },
            { bm: "Lebah", en: "Bee", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQQ7GmA0bUgDZWJ9VwIuBFGbNQwLyqS0brFS8OER1zGxg&s=10" },
            { bm: "Rama-rama", en: "Butterfly", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQgSzZGJu7eVD0bF9DsNuVY_VeOyQXCWlKmqUmkf_cWWw&s=10" },
            { bm: "Kupu-kupu malam", en: "Moth", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTf5ZNBSMIgLRCfBplGM1mNCuxA-KEWBdr4tX7OauJr3g&s=10" },
            { bm: "Belalang", en: "Grasshopper", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4j0GjLT5NzleTtRNY98ZOT3qzZbPtjeWtI41s2PvLFw&s=10" },
            { bm: "Jangkrik", en: "Cricket", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSB2mMwXSBdqy_3Gl3cfQEzpwvBQJuWV80vy1ga3S2DlA&s=10" },
            { bm: "Pepatung", en: "Dragonfly", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIZ0fol4HCPOI6mKNQbCUS6iDaytOL_79VLVvVnGrx5A&s=10" },
            { bm: "Nyamuk", en: "Mosquito", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR9cLCJ4S4mHx339viK9F6N1jUL-jUjj703Q8XPmHXRDg&s=10" },
            { bm: "Lalat", en: "Fly", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRw-30Ix0MZQsGoQqddlkm48jNHiPbZ9sK8mL1tsHQ6-Q&s=10" },
            { bm: "Lipas", en: "Cockroach", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqJd6Qqa33iZ29FV0Cs-aHUtFsTlVKeDgWJx2hh8UMXg&s=10" },
            { bm: "Kumbang", en: "Beetle", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsbo-m-00GUocxmAgrHN8sqJOHpWzqxdH7RFUj9G3uwA&s=10" },
            { bm: "Kumbang kura-kura", en: "Ladybug", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSySpX2RY_xlj2P9b0W2Ncz4HxZRmU3bmPkrgPK9UVvjQ&s=10" },
            { bm: "Ulat", en: "Caterpillar", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRuZB0dDQrTLLN3PloC5TCs7sY2CsjEHRN1hE0a1FcnNg&s=10" },
            { bm: "Labah-labah", en: "Spider", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSStvMkoQilPoKY88T5CoXT2uvilOKAM2KRnYimFFovcg&s=10" },
            { bm: "Kala jengking", en: "Scorpion", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQn6qP2Kw9hP4LfgOSTKQzHCAbxu3x5q6H0nxhNsVIOQ&s=10" },
            { bm: "Cacing", en: "Worm", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRjjnpfjrRYu6ivVppKSGAmVobLfRdmIWy9abagDr9GIw&s=10" },
            { bm: "Anai-anai", en: "Termite", cat: "Serangga", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSFAIOMc-sAXwJ1Qzf06uMRpO09k-AOZG0z8linMP_Z7w&s=10" },
            

            // 7. Burung
            { bm: "Burung helang", en: "Eagle", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSC5591pNxGN1z6QFTPP6ik_L-U4-X8nLFcs2sersL-dA&s=10" },
            { bm: "Burung hantu", en: "Owl", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQwrtm9swXhEXIG05dzXGil-ab0gJLi4Svi8ZDyJ5Nk9g&s=10" },
            { bm: "Burung kakak tua", en: "Parrot", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS-gyMxrL-GXCkQxl95ObkDQK8LROj8o0UIN1562QauTg&s=10" },
            { bm: "Burung merpati", en: "Pigeon", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5zMKhCUOAEld7wxb91WuGMAys_LRV2hCyPBKsmsDHbg&s=10" },
            { bm: "Burung gagak", en: "Crow", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSLQ22LjjarUxUck9GIfNTOUbD2TUIouQ7yi59uFI2S9w&s=10" },
            { bm: "Burung pipit", en: "Sparrow", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSH8H6FEYt31hwlknOiO1UrlyN88_FHMcuqd8j7qCOVJQ&s=10" },
            { bm: "Burung flamingo", en: "Flamingo", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTHfpagPrhr6hht5D3L1LGWgh7DKB9HQ12nGjfxlH2kpA&s=10" },
            { bm: "Burung merak", en: "Peacock", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT7oOC0leokAPqY90JfE59IZen6j_eYs_09faCOUzveKA&s=10" },
            { bm: "Burung unta", en: "Ostrich", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRD8VSZti8OBw2PmjKAO2lvhx1ncba6kt0ONfs1t39jFQ&s=10" },
            { bm: "Burung kenari", en: "Canary", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTbML50UtqPkVgMWlNZsML2CT64_e6hMyCJ_mM_oyTj4Q&s=10" },
            { bm: "Burung bangau", en: "Stork", cat: "Burung", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3v3vd1vixqtKrJI0WNt_gL_b67jZ-GEXFjIHEEg642A&s" },

            // 8. Amfibia
            { bm: "Katak", en: "Frog", cat: "Amfibia", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7zsKe6f6gwvhH27dACSUYfEiS6uAty-odT1_J8M28dw&s=10" },
        

            // 9. Haiwan Peliharaan
            { bm: "Kucing", en: "Cat", cat: "Haiwan Peliharaan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR2NLea_FEibuAgLe6qhf4ulIh-9J_wsTMS0qqToQ8jNA&s=10" },
            { bm: "Anjing", en: "Dog", cat: "Haiwan Peliharaan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQNq0KV-_JxhxwRW5q7mIAC8JY4fjKiGcmauhW79TdadQ&s=10" },
            { bm: "Hamster", en: "Hamster", cat: "Haiwan Peliharaan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSDlWo-XBhJEH5_gP5iP57g3uN6fr6NMljDCvFFb74uxg&s=10" },
            { bm: "Ikan emas", en: "Goldfish", cat: "Haiwan Peliharaan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiDGoFhBw9o418UsenWjY9hzErp9wtsG4xylcLl-RiMw&s=10" },
            { bm: "Guinea pig", en: "Guinea Pig", cat: "Haiwan Peliharaan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWhy25JwzE9Z4Fdr80XQZt0zggJ5SEml63VKp9f_IE9A&s=10" },
            { bm: "Ferret", en: "Ferret", cat: "Haiwan Peliharaan", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsHl_jiB2heuXqvefpsowT346vtI8ORvr900up30GTGg&s=10" },

            // 10. Haiwan Unik / Menarik
            { bm: "Platipus", en: "Platypus", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ2KGUmNWb2xCakor5_oISVlgfPhzOPv0XP_i1beGG3pA&s=10" },
            { bm: "Tenggiling", en: "Pangolin", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRGWqwZSSaBo_8OvlVzxfKvIfIARtwTDrX_Fc86Drc7qQ&s=10" },
            { bm: "Anteater", en: "Anteater", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsAuwMeGm0MGSYjnGL23V1btbuXZ7CPc3hnoHur58UvQ&s=10" },
            { bm: "Meerkat", en: "Meerkat", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTv1Fbr8TOXFhmymfcvfbGd1uEkonPUG0tUPakypk0P1g&s=10" },
            { bm: "Narwhal", en: "Narwhal", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQM9eWv_SguCKTcnMpr-WA69SwR8d2PoehjKkvfTGRS5A&s=10" },
            { bm: "Capybara", en: "Capybara", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSrJchxaNn9oevCiBFBqKr3CnWMIBGiJB46DK0zV3NJKg&s=10" },
            { bm: "Wombat", en: "Wombat", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRVR5l378srsr5VispqO54inpfkcKIspd0KIAfJ3W09xw&s=10" },
            { bm: "Echidna", en: "Echidna", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS6QRt7mF-nsg9qoIYaLu_Oq9ytS7OtMKQ0aX4TTqIUZA&s=10" },
            { bm: "Armadillo", en: "Armadillo", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHeFjYyM2reb2TXPCiib0nfuGECNLgDAO4vmmRIDc1sQ&s=10" },
            { bm: "Aye-aye", en: "Aye-aye", cat: "Haiwan Unik / Menarik", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR3EkVfNWfZFURoZBX1Dov-BYlitexoyJP3eg-X9LCvSw&s=10" }
        ];

        const animalCategories = [
            { id: "Haiwan Ladang", label: "🐮 Haiwan Ladang", label_en: "🐮 Farm Animals" },
    { id: "Haiwan Liar", label: "🦁 Haiwan Liar", label_en: "🦁 Wild Animals" },
    { id: "Haiwan Hutan", label: "🐒 Haiwan Hutan", label_en: "🐒 Jungle Animals" },
    { id: "Haiwan Laut & Air", label: "🐠 Haiwan Laut & Air", label_en: "🐠 Sea & Water Animals" },
    { id: "Reptilia", label: "🐊 Reptilia", label_en: "🐊 Reptiles" },
    { id: "Serangga", label: "🦋 Serangga", label_en: "🦋 Insects" },
    { id: "Burung", label: "🦅 Burung", label_en: "🦅 Birds" },
    { id: "Amfibia", label: "🐸 Amfibia", label_en: "🐸 Amphibians" },
    { id: "Haiwan Peliharaan", label: "🐕 Haiwan Peliharaan", label_en: "🐕 Pets" },
    { id: "Haiwan Unik / Menarik", label: "Haiwan Unik", label_en: "Unique Animals" }
];

        function openAnimalMenu() {
            showScreen('animal-menu-screen');
        }

        // 1. LEARN ANIMAL LOGIC
        let currentLearnAnimalList = [];
        let currentLearnAnimalIdx = 0;
        let currentCategoryTitle = "";

       function openLearnAnimalCategoryScreen() {
    const container = document.getElementById("animal-categories-container");
    container.innerHTML = "";

    animalCategories.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "animal-cat-btn";
        
        // Pilihan label mengikut bahasa yang dipilih (en atau ms)
        btn.innerText = (currentGlobalLang === 'en') ? cat.label_en : cat.label;
        
        btn.onclick = () => {
            playClickSound();
            startLearnAnimalCategory(cat.id);
        };
        container.appendChild(btn);
    });

    showScreen("learn-animal-cat-screen");
}


        function startLearnAnimalCategory(catId, catLabel) {
            currentCategoryTitle = catLabel;
            currentLearnAnimalList = animalMasterDatabase.filter(a => a.cat === catId);
            currentLearnAnimalIdx = 0;
            showScreen('learn-animal-flash-screen');
            renderAnimalFlashcard();
        }

        function renderAnimalFlashcard() {
            const item = currentLearnAnimalList[currentLearnAnimalIdx];
            document.getElementById("animal-cat-display-title").innerText = currentCategoryTitle;
            document.getElementById("animal-flash-progress").innerText = `Animal ${currentLearnAnimalIdx + 1} of ${currentLearnAnimalList.length}`;
            document.getElementById("animal-flash-image").src = item.img;
            document.getElementById("animal-flash-name-bm").innerText = item.bm;
            document.getElementById("animal-flash-name-en").innerText = item.en;

            document.getElementById("prev-animal-btn").style.display = currentLearnAnimalIdx === 0 ? "none" : "inline-block";
            document.getElementById("next-animal-btn").innerText = currentLearnAnimalIdx === currentLearnAnimalList.length - 1 ? (currentGlobalLang === 'en' ? "Finish 🏁" : "Tamat 🏁") : "Next ➡";
            
            playAnimalFlashSound();
        }

        function playAnimalFlashSound() {
            const item = currentLearnAnimalList[currentLearnAnimalIdx];
            const textToSpeak = currentGlobalLang === 'en' ? item.en : item.bm;
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = currentGlobalLang === 'en' ? 'en-US' : 'ms-MY';
                utterance.rate = 0.4;
                window.speechSynthesis.speak(utterance);
            }
        }

        function nextAnimalFlash() {
            if (currentLearnAnimalIdx < currentLearnAnimalList.length - 1) {
                currentLearnAnimalIdx++;
                renderAnimalFlashcard();
            } else {
                alert(currentGlobalLang === 'en' ? "Great job completing this category! 🎉" : "Syabas! Anda telah melengkapkan kategori ini! 🎉");
                openLearnAnimalCategoryScreen();
            }
        }

        function prevAnimalFlash() {
            if (currentLearnAnimalIdx > 0) {
                currentLearnAnimalIdx--;
                renderAnimalFlashcard();
            }
        }

        // 2. MATCH THE ANIMAL LOGIC
        let matchAnimalPagesCount = 5;
        let currentMatchAnimalPageIdx = 0;
        let matchAnimalGameData = [];
        let matchAnimalScoreCount = 0;

        let activeDragAnimal = null;
        let isDraggingAnimal = false;
        let dragAnimalX = 0;
        let dragAnimalY = 0;
        let completedAnimalLines = [];
        let matchedAnimalPairsInPage = 0;

        function openMatchAnimalCountScreen() {
            showScreen('match-animal-count-screen');
        }

        function startMatchAnimal(setCount) {
            matchAnimalPagesCount = setCount;
            currentMatchAnimalPageIdx = 0;
            matchAnimalScoreCount = 0;

            let shuffledList = [...animalMasterDatabase].sort(() => 0.5 - Math.random());
            matchAnimalGameData = [];

            let totalItemsNeeded = setCount * 4; // 4 items per match page
            let selectedSubset = shuffledList.slice(0, totalItemsNeeded);

            for (let i = 0; i < setCount; i++) {
                let pageItems = selectedSubset.slice(i * 4, (i + 1) * 4);
                matchAnimalGameData.push(pageItems);
            }

            showScreen('match-animal-game-screen');
            setTimeout(initMatchAnimalEvents, 100);
            loadMatchAnimalPage();
        }

        function resizeAnimalCanvas() {
            const canvas = document.getElementById("match-animal-canvas");
            const wrapper = document.getElementById("match-animal-wrapper");
            if (canvas && wrapper) {
                canvas.width = wrapper.clientWidth;
                canvas.height = wrapper.clientHeight;
                redrawAnimalCanvas();
            }
        }

        window.addEventListener("resize", resizeAnimalCanvas);

        function initMatchAnimalEvents() {
            const wrapper = document.getElementById("match-animal-wrapper");
            if (!wrapper) return;

            wrapper.addEventListener("pointerdown", handleAnimalPointerDown, {passive:false});
            wrapper.addEventListener("pointermove", handleAnimalPointerMove);
            wrapper.addEventListener("pointerup", handleAnimalPointerUp);
            wrapper.addEventListener("pointercancel", handleAnimalPointerUp);
            resizeAnimalCanvas();
        }

        function loadMatchAnimalPage() {
            matchedAnimalPairsInPage = 0;
            completedAnimalLines = [];
            activeDragAnimal = null;
            isDraggingAnimal = false;

            document.getElementById("match-animal-current-page").innerText = currentMatchAnimalPageIdx + 1;
            document.getElementById("match-animal-total-pages").innerText = matchAnimalPagesCount;
            document.getElementById("match-animal-score").innerText = matchAnimalScoreCount;
            document.getElementById("match-animal-next-btn").style.display = "none";

            const currentItems = matchAnimalGameData[currentMatchAnimalPageIdx];
            
            const leftCol = document.getElementById("match-animal-left-column");
            const rightCol = document.getElementById("match-animal-right-column");
            leftCol.innerHTML = "";
            rightCol.innerHTML = "";

            let randomizedLeft = [...currentItems].sort(() => 0.5 - Math.random());
            let randomizedRight = [...currentItems].sort(() => 0.5 - Math.random());

            // KIRI: perkataan + audio (bahagian yang boleh mula drag)
            randomizedLeft.forEach(item => {
                const div = document.createElement("div");
                div.className = "match-item";
                const animalName = currentGlobalLang === 'en' ? item.en : item.bm;
                div.innerHTML = `
                    <span class="match-animal-name">${animalName}</span>
                    <button type="button" class="match-animal-audio-btn" aria-label="Listen to ${animalName}" title="Listen / Dengar">🔊</button>
                `;
                div.dataset.id = item.bm;
                div.dataset.side = "left";

                const audioBtn = div.querySelector('.match-animal-audio-btn');
                bindMatchingAudio(audioBtn,()=>playMatchAnimalNameAudio(item));

                leftCol.appendChild(div);
            });

            // KANAN: gambar haiwan (sasaran matching)
            randomizedRight.forEach(item => {
                const div = document.createElement("div");
                div.className = "match-item";
                div.innerHTML = `<img src="${item.img}" alt="${item.bm}">`;
                div.dataset.id = item.bm;
                div.dataset.side = "right";
                rightCol.appendChild(div);
            });

            setTimeout(resizeAnimalCanvas, 50);
        }

        function playMatchAnimalNameAudio(item) {
            if (!item || !('speechSynthesis' in window)) return;

            const textToSpeak = currentGlobalLang === 'en' ? item.en : item.bm;
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = currentGlobalLang === 'en' ? 'en-US' : 'ms-MY';
            utterance.rate = 0.4;
            window.speechSynthesis.speak(utterance);
        }

        function handleAnimalPointerDown(e) {
            if (e.target.closest('.match-animal-audio-btn')) return;
            const target = matchItemAtPointer(e, document.getElementById('match-animal-wrapper'), '.match-item[data-side]');
            if (!target || target.classList.contains("matched")) return;

            {
                beginMatchTouch(e);
                playClickSound();
                activeDragAnimal = target;
                isDraggingAnimal = true;
                target.classList.add("selected");
                
                const wrapper = document.getElementById("match-animal-wrapper").getBoundingClientRect();
                dragAnimalX = e.clientX - wrapper.left;
                dragAnimalY = e.clientY - wrapper.top;
                
                redrawAnimalCanvas();
            }
        }

        function handleAnimalPointerMove(e) {
            if (!isDraggingAnimal || !activeDragAnimal) return;
            e.preventDefault();

            const wrapper = document.getElementById("match-animal-wrapper").getBoundingClientRect();
            dragAnimalX = e.clientX - wrapper.left;
            dragAnimalY = e.clientY - wrapper.top;

            redrawAnimalCanvas();
        }

        function handleAnimalPointerUp(e) {
            if (!isDraggingAnimal || !activeDragAnimal) return;

            const targetRightItem = matchItemAtPointer(e, document.getElementById('match-animal-wrapper'), '.match-item[data-side]', true);

            activeDragAnimal.classList.remove("selected");

            if (targetRightItem && targetRightItem.dataset.side !== activeDragAnimal.dataset.side && !targetRightItem.classList.contains("matched")) {
                const leftId = activeDragAnimal.dataset.id;
                const rightId = targetRightItem.dataset.id;

                if (leftId === rightId) {
                    playCorrectSound();
                    matchAnimalScoreCount += 10;
                    document.getElementById("match-animal-score").innerText = matchAnimalScoreCount;

                    activeDragAnimal.classList.add("matched");
                    targetRightItem.classList.add("matched");

                    completedAnimalLines.push({
                        from: activeDragAnimal.dataset.side === "left" ? activeDragAnimal : targetRightItem,
                        to: activeDragAnimal.dataset.side === "right" ? activeDragAnimal : targetRightItem
                    });

                    matchedAnimalPairsInPage++;

                    if (matchedAnimalPairsInPage === 4) {
                        if (currentMatchAnimalPageIdx < matchAnimalPagesCount - 1) {
                            // Auto terus ke set soalan seterusnya selepas semua 4 padanan betul.
                            // Sedikit delay supaya pengguna sempat nampak padanan terakhir yang betul.
                            setTimeout(() => {
                                nextMatchAnimalPage();
                            }, 700);
                        } else {
                            setTimeout(() => {
                                const finalPercent = 100;
                                window.saveScoreToFirebase("Match Animal", finalPercent);
                                alert(currentGlobalLang === 'en' ? "🌟 Amazing! You completed all animal match sets!" : "🌟 Hebat! Anda telah melengkapkan semua set padanan haiwan!");
                                openAnimalMenu();
                            }, 500);
                        }
                    }
                } else {
                    playWrongSound();
                    targetRightItem.style.backgroundColor = "#FF6B6B";
                    setTimeout(() => {
                        targetRightItem.style.backgroundColor = "white";
                    }, 400);
                }
            }

            activeDragAnimal = null;
            isDraggingAnimal = false;
            redrawAnimalCanvas();
        }

        // Gelang mengikut tepi sebenar gambar dan papan walaupun saiz skrin berubah.
        function matchingVisual(item) {
            return item.dataset.side==='right' && item.classList.contains('match-item')
                ? item.querySelector('img, .match-colour-paint-can') || item : item;
        }
        function matchingEdgeX(item, visual, direction) {
            // Badan tong cat bermula lebih ke dalam daripada tepi kanvas SVG.
            if(item.dataset.side==='right' && item.querySelector('.match-colour-paint-can'))
                return direction>0 ? visual.left+visual.width*.18 : visual.right-visual.width*.18;
            return direction>0 ? visual.left-1 : visual.right+1;
        }
        // Terima sentuhan di seluruh kad dan sedikit di luar tepinya.
        function matchItemAtPointer(e, wrapper, selector, useHitElement=false) {
            if(!wrapper)return null;
            const hit=useHitElement?document.elementFromPoint(e.clientX,e.clientY):e.target;
            const direct=hit?.closest?.(selector);
            if(direct&&wrapper.contains(direct))return direct;
            let nearest=null,nearestDistance=Infinity;
            wrapper.querySelectorAll(selector).forEach(item=>{
                const r=item.getBoundingClientRect(),v=matchingVisual(item).getBoundingClientRect();
                const left=Math.min(r.left,v.left)-16,right=Math.max(r.right,v.right)+16;
                const top=Math.min(r.top,v.top)-12,bottom=Math.max(r.bottom,v.bottom)+12;
                if(e.clientX<left||e.clientX>right||e.clientY<top||e.clientY>bottom)return;
                const dx=Math.max(r.left-e.clientX,0,e.clientX-r.right);
                const dy=Math.max(r.top-e.clientY,0,e.clientY-r.bottom);
                const d=dx*dx+dy*dy;
                if(d<nearestDistance){nearest=item;nearestDistance=d}
            });
            return nearest;
        }
        function captureMatchPointer(e) {
            if(e.currentTarget?.setPointerCapture)try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}
        }
        function beginMatchTouch(e) {
            // Elak pelayar menganggap gerakan pertama sebagai scroll atau drag gambar.
            if(e.cancelable)e.preventDefault();
            captureMatchPointer(e);
        }
        function bindMatchingAudio(button, speak) {
            let lastTouchAudio=0;
            button.addEventListener('pointerdown',e=>{
                // The speaker is separate from the matching gesture.
                e.stopPropagation();
            });
            button.addEventListener('pointerup',e=>e.stopPropagation());
            button.addEventListener('pointercancel',e=>e.stopPropagation());
            button.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
            button.addEventListener('touchend',e=>{
                e.stopPropagation();
                e.preventDefault();
                lastTouchAudio=Date.now();
                if(window.speechSynthesis?.paused)window.speechSynthesis.resume();
                speak();
            },{passive:false});
            button.addEventListener('click',e=>{
                e.preventDefault();e.stopPropagation();
                // Touchend already spoke on phones; click handles mouse and keyboard.
                if(Date.now()-lastTouchAudio<700)return;
                if(window.speechSynthesis?.paused)window.speechSynthesis.resume();
                speak();
            });
        }
        function syncMatchingEyelets(wrapper) {
            if(!wrapper)return;
            const items=wrapper.querySelectorAll('.match-item[data-side], .shape-match-item[data-side]');
            const size=wrapper.clientWidth+'x'+wrapper.clientHeight;
            if(items.length&&wrapper._matchingEyeletSize===size&&
               items[0].querySelector(':scope > .matching-eyelet'))return;
            items.forEach(item=>{
                let eyelet=item.querySelector(':scope > .matching-eyelet');
                if(!eyelet){eyelet=document.createElement('span');eyelet.className='matching-eyelet';eyelet.setAttribute('aria-hidden','true');item.appendChild(eyelet)}
                const visual=matchingVisual(item).getBoundingClientRect(),box=item.getBoundingClientRect();
                const x=item.dataset.side==='left'?visual.right-box.left+1:matchingEdgeX(item,visual,1)-box.left;
                eyelet.style.left=(x-10.5)+'px';
                eyelet.style.top=(visual.top-box.top+visual.height/2)+'px';
            });
            wrapper._matchingEyeletSize=size;
        }

        // Tali kapas berpilin yang nipis, digunakan oleh semua aktiviti Match.
        function drawMatchingRope(ctx, start, end, startItem, endItem) {
            const a={...start}, b={...end};
            const direction=b.x>=a.x?1:-1;
            if(startItem){
                const item=startItem.getBoundingClientRect(),visual=matchingVisual(startItem).getBoundingClientRect();
                a.x+=(direction>0?visual.right:visual.left)-item.left-item.width/2+direction;
                a.y+=visual.top+visual.height/2-item.top-item.height/2;
            }
            if(endItem){
                const item=endItem.getBoundingClientRect(),visual=matchingVisual(endItem).getBoundingClientRect();
                b.x+=matchingEdgeX(endItem,visual,direction)-item.left-item.width/2;
                b.y+=visual.top+visual.height/2-item.top-item.height/2;
            }
            const distance=Math.hypot(b.x-a.x,b.y-a.y);
            if(distance<2)return;
            const sag=Math.min(13,distance*.055);
            const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2+sag;
            function at(t){const u=1-t;return{x:u*u*a.x+2*u*t*cx+t*t*b.x,y:u*u*a.y+2*u*t*cy+t*t*b.y}}
            function tangent(t){const x=2*((1-t)*(cx-a.x)+t*(b.x-cx)),y=2*((1-t)*(cy-a.y)+t*(b.y-cy));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d,nx:-y/d,ny:x/d}}
            function path(){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cx,cy,b.x,b.y)}
            ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
            // Bayang lembut, sisi gelap dan teras warna kapas yang lebih nipis.
            ctx.shadowColor='rgba(62,37,17,.35)';ctx.shadowBlur=2.4;ctx.shadowOffsetY=1.5;
            path();ctx.strokeStyle='#684b32';ctx.lineWidth=7.5;ctx.stroke();
            ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
            path();ctx.strokeStyle='#a67a4e';ctx.lineWidth=6.3;ctx.stroke();
            path();ctx.strokeStyle='#d1a66b';ctx.lineWidth=4.8;ctx.stroke();
            // Jalur silang rapat mengikuti arah setiap lengkungan tali.
            const coils=Math.max(1,Math.floor(distance/5.5));
            for(let i=1;i<coils;i++){
                const t=i/coils,p=at(t),v=tangent(t);
                const shade=i%2?'rgba(104,66,36,.79)':'rgba(130,83,45,.72)';
                ctx.beginPath();
                ctx.moveTo(p.x-v.nx*2.55-v.x*1.35,p.y-v.ny*2.55-v.y*1.35);
                ctx.lineTo(p.x+v.nx*2.55+v.x*1.35,p.y+v.ny*2.55+v.y*1.35);
                ctx.strokeStyle=shade;ctx.lineWidth=1.2;ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(p.x-v.nx*2+v.x*.2,p.y-v.ny*2+v.y*.2);
                ctx.lineTo(p.x+v.nx*1.5+v.x*1.35,p.y+v.ny*1.5+v.y*1.35);
                ctx.strokeStyle='rgba(255,229,183,.83)';ctx.lineWidth=.72;ctx.stroke();
            }
            // Benang halus yang berselang seli antara lilitan.
            for(let strand=0;strand<2;strand++){
                ctx.beginPath();
                const steps=Math.min(120,Math.max(8,Math.ceil(distance/3)));
                for(let i=0;i<=steps;i++){
                    const t=i/steps,p=at(t),v=tangent(t);
                    const offset=Math.sin(t*coils*Math.PI*2+strand*Math.PI)*.92;
                    const x=p.x+v.nx*offset,y=p.y+v.ny*offset;
                    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
                }
                ctx.strokeStyle=strand?'rgba(98,65,37,.32)':'rgba(255,240,211,.56)';
                ctx.lineWidth=.56;ctx.stroke();
            }
            ctx.restore();
        }

        function redrawAnimalCanvas() {
            const canvas = document.getElementById("match-animal-canvas");
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            syncMatchingEyelets(document.getElementById("match-animal-wrapper"));

            completedAnimalLines.forEach(line => {
                const p1 = getItemCenter(line.from);
                const p2 = getItemCenter(line.to);

                drawMatchingRope(ctx, p1, p2, line.from, line.to);
            });

            if (isDraggingAnimal && activeDragAnimal) {
                const p1 = getItemCenter(activeDragAnimal);

                drawMatchingRope(ctx, p1, {x:dragAnimalX, y:dragAnimalY}, activeDragAnimal, null);
            }
        }

        function nextMatchAnimalPage() {
            currentMatchAnimalPageIdx++;
            loadMatchAnimalPage();
        }

        // COMPLETE THE ANIMAL: 22 distinct animal pictures in five sets, without repeats.
        const completeAnimalPool = [
            ['https://i.imgur.com/jTkBzz0.jpeg','Gajah','Elephant'],['https://i.imgur.com/IlhGsG9.jpeg','Singa','Lion'],
            ['https://i.imgur.com/dAZIwpy.jpeg','Buaya','Crocodile'],['https://i.imgur.com/9enfbES.jpeg','Rusa','Deer'],
            ['https://i.imgur.com/nXphQfl.jpeg','Itik','Duck'],['https://i.imgur.com/zVHl4Va.jpeg','Serigala','Wolf'],
            ['https://i.imgur.com/qCUfVpX.jpeg','Musang','Fox'],['https://i.imgur.com/CsHd8Wn.jpeg','Ayam','Chicken'],
            ['https://i.imgur.com/1H24FEp.jpeg','Kucing','Cat'],['https://i.imgur.com/pr9ssPZ.jpeg','Arnab','Rabbit'],
            ['https://i.imgur.com/Eh3EPk3.jpeg','Alpaka','Alpaca'],['https://i.imgur.com/nejHB5D.jpeg','Kalkun','Turkey'],
            ['https://i.imgur.com/78AP1UQ.jpeg','Keldai','Donkey'],['https://i.imgur.com/xgKATBA.jpeg','Kuda','Horse'],
            ['https://i.imgur.com/6mf6Gmf.jpeg','Lembu','Cow'],['https://i.imgur.com/4IJ1370.jpeg','Kuda belang','Zebra'],
            ['https://i.imgur.com/qnx5EoG.jpeg','Biri-biri','Sheep'],['https://i.imgur.com/f5MK4tg.jpeg','Kambing','Goat'],
            ['https://i.imgur.com/n6PfcRQ.jpeg','Badak air','Hippopotamus'],['https://i.imgur.com/kE6Ov4J.jpeg','Badak sumbu','Rhinoceros'],
            ['https://i.imgur.com/L7wt2jv.jpeg','Zirafah','Giraffe'],['https://i.imgur.com/Brh8bMo.jpeg','Harimau','Tiger'],
            ['https://i.imgur.com/431hdp1.jpeg','Panda','Panda'],['https://i.imgur.com/pXeGtVp.jpeg','Kanggaru','Kangaroo'],
            ['https://i.imgur.com/zl1fXsb.jpeg','Gorila','Gorilla']
            
        ];
        let completeAnimalQuestions = [], completeAnimalSet = 0, completeAnimalMatched = new Set();
        let completeAnimalDrag = null, completeAnimalTimer = null, completeAnimalSession = 0;
        let completeAnimalSpeechWatchdog = null, completeAnimalUtterance = null;
        function shuffleCompleteAnimal(items) {
            const a = [...items];
            for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
            return a;
        }
        function updateCompleteAnimalLanguage(){
            const ms=currentGlobalLang==='ms';
            document.getElementById('complete-animal-title').textContent=ms?'Lengkapkan Haiwan 🐾':'Complete the Animal 🐾';
            document.getElementById('complete-animal-instruction').textContent=ms?'Seret bahagian kanan untuk melengkapkan haiwan di sebelah kiri.':'Drag the right half to complete the animal on the left.';
            document.getElementById('complete-animal-set-label').textContent=ms?'Set':'Set';
            document.getElementById('complete-animal-back').textContent=ms?'Kembali ↩️':'Back ↩️';
            document.getElementById('complete-animal-btn-text').textContent=ms?'4) Lengkapkan Haiwan':'4) Complete the Animal';
        }
        // Decode each picture once; later sets reuse the browser's decoded image cache.
        const completeAnimalImageCache = new Map();
        function preloadCompleteAnimal(animal) {
            const url = animal[0];
            if (!completeAnimalImageCache.has(url)) {
                const img = new Image();
                img.decoding = 'async';
                img.src = url;
                const ready = (img.decode ? img.decode() : new Promise((resolve, reject) => {
                    img.onload = resolve; img.onerror = reject;
                })).catch(() => undefined);
                completeAnimalImageCache.set(url, ready);
            }
            return completeAnimalImageCache.get(url);
        }
        async function showCompleteAnimalSet(session) {
            const screen = document.getElementById('complete-animal-screen');
            const group = completeAnimalQuestions.slice(completeAnimalSet * 5, completeAnimalSet * 5 + 5);
            const board = screen.querySelector('.complete-animal-board');
            board.style.visibility = 'hidden';
            let indicator = document.getElementById('complete-animal-loading');
            if (!indicator) {
                indicator = document.createElement('p');
                indicator.id = 'complete-animal-loading';
                indicator.style.cssText = 'text-align:center;font-weight:bold;color:#5E17EB';
                board.before(indicator);
            }
            indicator.textContent = currentGlobalLang === 'ms' ? 'Sedang menyediakan gambar haiwan…' : 'Preparing animal pictures…';
            indicator.hidden = false;
            await Promise.all(group.map(preloadCompleteAnimal));
            if (session !== completeAnimalSession || !screen.classList.contains('active')) return;
            renderCompleteAnimal();
            board.style.visibility = '';
            indicator.hidden = true;
            // Fetch and decode the remaining pictures while the child works on this set.
            const rest = completeAnimalQuestions.slice((completeAnimalSet + 1) * 5);
            for (let i = 0; i < rest.length; i += 5) {
                if (session !== completeAnimalSession) break;
                await Promise.all(rest.slice(i, i + 5).map(preloadCompleteAnimal));
            }
        }
        function startCompleteAnimal(){
            completeAnimalSession++;
            clearTimeout(completeAnimalTimer);
            clearTimeout(completeAnimalSpeechWatchdog);
            completeAnimalUtterance=null;
            document.querySelector('.complete-animal-pop')?.remove();
            completeAnimalQuestions=shuffleCompleteAnimal(completeAnimalPool);
            completeAnimalSet=0;
            showScreen('complete-animal-screen');
            updateCompleteAnimalLanguage();
            showCompleteAnimalSet(completeAnimalSession);
        }
        function leaveCompleteAnimal(){
            completeAnimalSession++;
            clearTimeout(completeAnimalTimer);
            completeAnimalDrag?.ghost?.remove();
            completeAnimalDrag=null;
            document.querySelector('.complete-animal-pop')?.remove();
            openAnimalMenu();
        }
        function completeAnimalHalf(animal,index,side){
            const half=document.createElement('div');
            half.className='complete-animal-half';
            half.dataset.animal=String(index);
            half.dataset.side=side;
            half.setAttribute('aria-label',(currentGlobalLang==='ms'?'Bahagian ':'Half ')+(side==='left'?'kiri':'kanan'));
            const art=document.createElement('img');
            art.className='complete-animal-art';
            art.src=animal[0];
            art.alt='';
            art.draggable=false;
            half.append(art);
            if(side==='right')half.addEventListener('pointerdown',completeAnimalPointerDown);
            return half;
        }
        function renderCompleteAnimal(){
            completeAnimalMatched=new Set();
            document.getElementById('complete-animal-set').textContent=completeAnimalSet+1;
            document.getElementById('complete-animal-matched').textContent='0';
            const left=document.getElementById('complete-animal-left'), right=document.getElementById('complete-animal-right');
            left.replaceChildren(); right.replaceChildren();
            const group=completeAnimalQuestions.slice(completeAnimalSet*5,completeAnimalSet*5+5);
            document.getElementById('complete-animal-set-size').textContent=group.length;
            group.forEach((animal,i)=>{const row=document.createElement('div');row.className='complete-animal-row complete-animal-left';row.append(completeAnimalHalf(animal,completeAnimalSet*5+i,'left'));left.append(row)});
            shuffleCompleteAnimal(group.map((_,i)=>completeAnimalSet*5+i)).forEach(i=>{
                const row=document.createElement('div');row.className='complete-animal-row complete-animal-right';row.append(completeAnimalHalf(completeAnimalQuestions[i],i,'right'));right.append(row)
            });
        }
        function completeAnimalPointerDown(e){
            const source=e.currentTarget;
            if(completeAnimalDrag || completeAnimalMatched.has(source.dataset.animal))return;
            e.preventDefault(); playClickSound();
            const ghost=source.cloneNode(true);
            ghost.classList.add('complete-animal-ghost');
            ghost.style.width=source.offsetWidth+'px';ghost.style.height=source.offsetHeight+'px';
            document.body.append(ghost);
            source.classList.add('dragging');
            completeAnimalDrag={source,ghost,id:e.pointerId};
            moveCompleteAnimalGhost(e);
            source.setPointerCapture(e.pointerId);
        }
        function moveCompleteAnimalGhost(e){
            if(!completeAnimalDrag || e.pointerId!==completeAnimalDrag.id)return;
            completeAnimalDrag.ghost.style.left=e.clientX+'px';
            completeAnimalDrag.ghost.style.top=e.clientY+'px';
        }
        function finishCompleteAnimalDrag(e){
            const drag=completeAnimalDrag;
            if(!drag || e.pointerId!==drag.id)return;
            const point=document.elementFromPoint(e.clientX,e.clientY);
            let target=point?.closest('.complete-animal-left .complete-animal-half');
            // Accept a drop directly next to the cut edge so the pieces visibly join.
            if(!target){
                target=[...document.querySelectorAll('#complete-animal-left .complete-animal-half:not(.matched)')].find(half=>{
                    const r=half.getBoundingClientRect();
                    return e.clientX>=r.left && e.clientX<=r.right+r.width && e.clientY>=r.top && e.clientY<=r.bottom;
                });
            }
            drag.ghost.remove();drag.source.classList.remove('dragging');completeAnimalDrag=null;
            if(!target || !document.getElementById('complete-animal-screen').classList.contains('active') || completeAnimalMatched.has(target.dataset.animal))return;
            if(target.dataset.animal!==drag.source.dataset.animal){
                playWrongSound(); target.classList.add('wrong');
                setTimeout(()=>target.classList.remove('wrong'),450);return;
            }
            const index=Number(target.dataset.animal),animal=completeAnimalQuestions[index];
            completeAnimalMatched.add(String(index));
            target.classList.add('matched');drag.source.classList.add('matched');
            // Move the right half beside its matching left half; keep the completed picture there.
            drag.source.removeEventListener('pointerdown',completeAnimalPointerDown);
            target.parentElement.classList.add('complete-animal-combined');
            target.parentElement.append(drag.source);
            drag.source.style.pointerEvents='none';
            document.getElementById('complete-animal-matched').textContent=completeAnimalMatched.size;
            playCorrectSound();
            const pop=document.createElement('div');pop.className='complete-animal-pop';
            const card=document.createElement('div');card.className='complete-animal-pop-card';
            const picture=document.createElement('div');picture.className='complete-animal-pop-art';
            const fullImage=document.createElement('img');fullImage.src=animal[0];fullImage.alt=currentGlobalLang==='ms'?animal[1]:animal[2];picture.append(fullImage);
            const name=document.createElement('div');name.className='complete-animal-pop-name';name.textContent=currentGlobalLang==='ms'?animal[1]:animal[2];
            card.append(picture,name);pop.append(card);document.body.append(pop);
            // Keep the popup visible until the animal name has been spoken.
            const session=completeAnimalSession;
            const openedAt=Date.now();
            let speechAttempt=0, speechStarted=false, popupClosed=false;
            const finishPopup=()=>{
                if(popupClosed || session!==completeAnimalSession || !pop.isConnected)return;
                popupClosed=true;
                clearTimeout(completeAnimalTimer);
                clearTimeout(completeAnimalSpeechWatchdog);
                completeAnimalUtterance=null;
                pop.remove();
                if(completeAnimalMatched.size!==Math.min(5,completeAnimalQuestions.length-completeAnimalSet*5))return;
                completeAnimalSet++;
                if(completeAnimalSet<Math.ceil(completeAnimalQuestions.length/5)){showCompleteAnimalSet(completeAnimalSession);return;}
                if(window.saveScoreToFirebase)window.saveScoreToFirebase('Complete the Animal',100);
                alert(currentGlobalLang==='ms'?'Tahniah! Semua haiwan berjaya dilengkapkan! 🎉':'Great job! You completed all the animals! 🎉');
                leaveCompleteAnimal();
            };
            const scheduleFinish=(delay)=>{
                clearTimeout(completeAnimalTimer);
                completeAnimalTimer=setTimeout(finishPopup,Math.max(delay,1850-(Date.now()-openedAt)));
            };
            const speakName=()=>{
                if(popupClosed || session!==completeAnimalSession)return;
                clearTimeout(completeAnimalTimer);
                clearTimeout(completeAnimalSpeechWatchdog);
                const attempt=++speechAttempt;
                speechStarted=false;
                if(!('speechSynthesis' in window)){
                    scheduleFinish(2700);
                    return;
                }
                try{
                    const synth=window.speechSynthesis;
                    synth.cancel();
                    const utterance=new SpeechSynthesisUtterance(name.textContent);
                    completeAnimalUtterance=utterance; // Retain until the voice ends.
                    utterance.lang=currentGlobalLang==='ms'?'ms-MY':'en-US';
                    utterance.rate=.82;
                    utterance.volume=1;
                    const voices=synth.getVoices();
                    const voice=voices.find(v=>v.lang.toLowerCase()===utterance.lang.toLowerCase())
                        || voices.find(v=>v.lang.toLowerCase().startsWith(currentGlobalLang==='ms'?'ms':'en'));
                    if(voice)utterance.voice=voice;
                    utterance.onstart=()=>{
                        if(attempt!==speechAttempt || popupClosed)return;
                        speechStarted=true;
                        clearTimeout(completeAnimalSpeechWatchdog);
                    };
                    utterance.onend=()=>{
                        if(attempt!==speechAttempt || popupClosed)return;
                        clearTimeout(completeAnimalSpeechWatchdog);
                        scheduleFinish(550);
                    };
                    utterance.onerror=()=>{
                        if(attempt!==speechAttempt || popupClosed)return;
                        if(attempt<3){clearTimeout(completeAnimalSpeechWatchdog);completeAnimalSpeechWatchdog=setTimeout(speakName,150);}
                        else scheduleFinish(2800);
                    };
                    if(synth.paused)synth.resume();
                    synth.speak(utterance);
                    // Some browsers silently drop a queued utterance after cancel().
                    completeAnimalSpeechWatchdog=setTimeout(()=>{
                        if(attempt!==speechAttempt || popupClosed || speechStarted)return;
                        if(attempt<3)speakName();
                        else scheduleFinish(2800);
                    },1000);
                    // A browser without onend must still let the child continue.
                    completeAnimalTimer=setTimeout(finishPopup,6500);
                }catch(err){console.warn('Animal name audio:',err);scheduleFinish(2800);}
            };
            const replay=document.createElement('button');
            replay.type='button';replay.className='sound-btn';
            replay.textContent=currentGlobalLang==='ms'?'🔊 Dengar lagi':'🔊 Listen again';
            replay.setAttribute('aria-label',currentGlobalLang==='ms'?'Sebut nama haiwan':'Say the animal name');
            replay.addEventListener('click',e=>{e.stopPropagation();speakName()});
            card.append(replay);
            speakName();
        }
        document.addEventListener('pointermove',moveCompleteAnimalGhost);
        document.addEventListener('pointerup',finishCompleteAnimalDrag);
        document.addEventListener('pointercancel',e=>{
            if(completeAnimalDrag?.id!==e.pointerId)return;
            completeAnimalDrag.ghost.remove();completeAnimalDrag.source.classList.remove('dragging');completeAnimalDrag=null;
        });

        // 3. FIND THE ANIMAL LOGIC (NO REPEAT QUESTIONS)
        let findAnimalTotalQuestions = 5;
        let findAnimalCurrentIdx = 0;
        let findAnimalScoreCount = 0;
        let findAnimalQuestionsList = [];

        function openFindAnimalCountScreen() {
            showScreen('find-animal-count-screen');
        }

        function startFindAnimal(qCount) {
            findAnimalTotalQuestions = qCount;
            findAnimalCurrentIdx = 0;
            findAnimalScoreCount = 0;

            // Ensure distinct target animals for the chosen session
            let shuffledMaster = [...animalMasterDatabase].sort(() => 0.5 - Math.random());
            findAnimalQuestionsList = [];

            for (let i = 0; i < qCount; i++) {
                let targetAnimal = shuffledMaster[i];
                let otherAnimalsPool = animalMasterDatabase.filter(a => a.bm !== targetAnimal.bm);
                let distractorAnimals = [...otherAnimalsPool].sort(() => 0.5 - Math.random()).slice(0, 3);
                
                let options = [targetAnimal, ...distractorAnimals].sort(() => 0.5 - Math.random());

                findAnimalQuestionsList.push({
                    target: targetAnimal,
                    options: options
                });
            }

            showScreen('find-animal-game-screen');
            loadFindAnimalQuestion();
        }

        function loadFindAnimalQuestion() {
            const currentQ = findAnimalQuestionsList[findAnimalCurrentIdx];

            document.getElementById("find-animal-q-num").innerText = findAnimalCurrentIdx + 1;
            document.getElementById("find-animal-total-q").innerText = findAnimalTotalQuestions;
            document.getElementById("find-animal-score").innerText = findAnimalScoreCount;
            document.getElementById("find-animal-next-btn").style.display = "none";

            const animalName = currentGlobalLang === 'en' ? currentQ.target.en : currentQ.target.bm;
            const qText = currentGlobalLang === 'en' ? `Which one is the ${animalName}?` : `Yang mana satu ${animalName}?`;
            document.getElementById("find-animal-question-text").innerText = qText;

            playFindAnimalQuestionAudio();

            const cardsContainer = document.getElementById("find-animal-cards-container");
            cardsContainer.innerHTML = "";

            currentQ.options.forEach(item => {
                const card = document.createElement("div");
                card.className = "animal-img-card";
                card.innerHTML = `<img src="${item.img}" alt="${item.bm}">`;
                card.onclick = () => handleFindAnimalClick(card, item, currentQ.target);
                cardsContainer.appendChild(card);
            });
        }

        function playFindAnimalQuestionAudio() {
            const textToSpeak = document.getElementById("find-animal-question-text").innerText;
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = currentGlobalLang === 'en' ? 'en-US' : 'ms-MY';
                utterance.rate = 0.4;
                window.speechSynthesis.speak(utterance);
            }
        }

        function finishOrAdvanceFindAnimal(delay = 0) {
            setTimeout(() => {
                if (findAnimalCurrentIdx < findAnimalTotalQuestions - 1) {
                    findAnimalCurrentIdx++;
                    loadFindAnimalQuestion();
                } else {
                    const finalPercent = Math.round((findAnimalScoreCount / (findAnimalTotalQuestions * 10)) * 100);
                    window.saveScoreToFirebase("Find Animal", finalPercent);
                    alert(currentGlobalLang === 'en'
                        ? `🎉 Quiz finished! Score: ${finalPercent}%`
                        : `🎉 Kuiz tamat! Skor anda: ${finalPercent}%`);
                    openAnimalMenu();
                }
            }, delay);
        }

        function showFindAnimalCorrectPopup(targetItem) {
            // Buang popup lama sekiranya masih ada
            const oldPopup = document.getElementById('find-animal-correct-popup');
            if (oldPopup) oldPopup.remove();

            const popup = document.createElement('div');
            popup.id = 'find-animal-correct-popup';
            popup.className = 'find-animal-correct-popup';

            const animalName = currentGlobalLang === 'en' ? targetItem.en : targetItem.bm;
            popup.innerHTML = `
                <div class="find-animal-popup-card">
                    <div class="find-animal-popup-title">${currentGlobalLang === 'en' ? 'Correct answer' : 'Jawapan betul'}</div>
                    <img src="${targetItem.img}" alt="${targetItem.bm}">
                    <div class="find-animal-popup-name">${animalName}</div>
                </div>
            `;

            document.body.appendChild(popup);
            requestAnimationFrame(() => popup.classList.add('show'));

            setTimeout(() => {
                popup.classList.remove('show');
                setTimeout(() => popup.remove(), 220);
            }, 2800);
        }

        function handleFindAnimalClick(cardElement, selectedItem, targetItem) {
            const cards = document.querySelectorAll('#find-animal-game-screen .animal-img-card');
            cards.forEach(c => c.style.pointerEvents = "none");

            // Butang Next tidak lagi diperlukan untuk aktiviti ini
            const nextBtn = document.getElementById("find-animal-next-btn");
            if (nextBtn) nextBtn.style.display = "none";

            if (selectedItem.bm === targetItem.bm) {
                playCorrectSound();
                cardElement.style.borderColor = "#4CAF50";
                cardElement.style.boxShadow = "0 0 0 5px rgba(76,175,80,.20), 0 10px 24px rgba(0,0,0,.16)";
                findAnimalScoreCount += 10;
                document.getElementById("find-animal-score").innerText = findAnimalScoreCount;

                // Jawapan betul: terus ke soalan seterusnya secara automatik
                finishOrAdvanceFindAnimal(650);
            } else {
                playWrongSound();
                cardElement.style.borderColor = "#E53935";
                cardElement.style.boxShadow = "0 0 0 5px rgba(229,57,53,.18), 0 10px 24px rgba(0,0,0,.16)";

                // Tunjukkan juga border hijau pada jawapan sebenar di grid
                cards.forEach(c => {
                    const img = c.querySelector('img');
                    if (img && img.alt === targetItem.bm) {
                        c.style.borderColor = "#4CAF50";
                    }
                });

                // Jawapan salah: gambar jawapan betul pop-out di tengah selama 3 saat
                showFindAnimalCorrectPopup(targetItem);
                finishOrAdvanceFindAnimal(3000);
            }
        }

        // Dikekalkan untuk compatibility, tetapi aktiviti kini auto-next
        function nextFindAnimalQuestion() {
            if (findAnimalCurrentIdx < findAnimalTotalQuestions - 1) {
                findAnimalCurrentIdx++;
                loadFindAnimalQuestion();
            }
        }

        // --- SISTEM MATCH THE LETTER (DRAG & SUAUKAN LINE DENGAN CANVAS) ---
        const alphabetList = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
        let matchPagesCount = 5;
        let currentMatchPageIdx = 0;
        let matchGameData = [];
        let matchScoreCount = 0;

        let activeDragItem = null;
        let isDragging = false;
        let dragCurrentX = 0;
        let dragCurrentY = 0;
        let completedLines = []; 
        let matchedPairsInCurrentPage = 0;

        function openMatchLettersCountScreen() {
            showScreen('match-count-screen');
        }

        function startMatchLetters(setCount) {
            matchPagesCount = setCount;
            currentMatchPageIdx = 0;
            matchScoreCount = 0;

            let shuffledAlphabet = [...alphabetList].sort(() => 0.5 - Math.random());
            matchGameData = [];

            let totalLettersNeeded = setCount * 5;
            let selectedSubset = shuffledAlphabet.slice(0, totalLettersNeeded);

            for (let i = 0; i < setCount; i++) {
                let pageLetters = selectedSubset.slice(i * 5, (i + 1) * 5);
                matchGameData.push(pageLetters);
            }

            showScreen('match-game-screen');
            setTimeout(initMatchEvents, 100);
            loadMatchPage();
        }

        function resizeCanvas() {
            const canvas = document.getElementById("match-canvas");
            const wrapper = document.getElementById("match-wrapper");
            if (canvas && wrapper) {
                canvas.width = wrapper.clientWidth;
                canvas.height = wrapper.clientHeight;
                redrawCanvas();
            }
        }

        window.addEventListener("resize", resizeCanvas);

        function initMatchEvents() {
            const wrapper = document.getElementById("match-wrapper");
            if (!wrapper) return;

            wrapper.addEventListener("pointerdown", handlePointerDown, {passive:false});
            wrapper.addEventListener("pointermove", handlePointerMove);
            wrapper.addEventListener("pointerup", handlePointerUp);
            wrapper.addEventListener("pointercancel", () => {
                if (activeDragItem) activeDragItem.classList.remove("selected");
                activeDragItem = null; isDragging = false; redrawCanvas();
            });
            resizeCanvas();
        }

        function getItemCenter(element) {
            const wrapper = element.closest('.match-wrapper').getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2 - wrapper.left,
                y: rect.top + rect.height / 2 - wrapper.top
            };
        }

        function loadMatchPage() {
            matchedPairsInCurrentPage = 0;
            completedLines = [];
            activeDragItem = null;
            isDragging = false;

            document.getElementById("match-current-page").innerText = currentMatchPageIdx + 1;
            document.getElementById("match-total-pages").innerText = matchPagesCount;
            document.getElementById("match-score").innerText = matchScoreCount;
            document.getElementById("match-next-btn").style.display = "none";

            const currentLetters = matchGameData[currentMatchPageIdx];
            
            const leftCol = document.getElementById("match-left-column");
            const rightCol = document.getElementById("match-right-column");
            leftCol.innerHTML = "";
            rightCol.innerHTML = "";

            let randomizedLowercase = [...currentLetters].sort(() => 0.5 - Math.random());
            let randomizedUppercase = [...currentLetters].sort(() => 0.5 - Math.random());

            randomizedLowercase.forEach(letter => {
                const div = document.createElement("div");
                div.className = "match-item";
                div.dataset.letter = letter;
                div.dataset.side = "left";

                const letterSpan = document.createElement("span");
                letterSpan.className = "match-letter";
                letterSpan.innerText = letter.toLowerCase();
                div.appendChild(letterSpan);

                leftCol.appendChild(div);
            });

            randomizedUppercase.forEach(letter => {
                const div = document.createElement("div");
                div.className = "match-item";
                div.dataset.letter = letter;
                div.dataset.side = "right";

                const letterSpan = document.createElement("span");
                letterSpan.className = "match-letter";
                letterSpan.innerText = letter;
                div.appendChild(letterSpan);

                rightCol.appendChild(div);
            });

            setTimeout(resizeCanvas, 50);
        }

        function handlePointerDown(e) {
            const target = matchItemAtPointer(e, document.getElementById('match-wrapper'), '.match-item[data-side]');
            if (!target || target.classList.contains("matched")) return;

            {
                beginMatchTouch(e);
                playClickSound();
                activeDragItem = target;
                isDragging = true;
                
                target.classList.add("selected");
                
                const wrapper = document.getElementById("match-wrapper").getBoundingClientRect();
                dragCurrentX = e.clientX - wrapper.left;
                dragCurrentY = e.clientY - wrapper.top;
                
                redrawCanvas();
            }
        }

        function handlePointerMove(e) {
            if (!isDragging || !activeDragItem) return;
            e.preventDefault();

            const wrapper = document.getElementById("match-wrapper").getBoundingClientRect();
            dragCurrentX = e.clientX - wrapper.left;
            dragCurrentY = e.clientY - wrapper.top;

            redrawCanvas();
        }

        function handlePointerUp(e) {
            if (!isDragging || !activeDragItem) return;

            const targetRightItem = matchItemAtPointer(e, document.getElementById('match-wrapper'), '.match-item[data-side]', true);

            activeDragItem.classList.remove("selected");

            if (targetRightItem && targetRightItem.dataset.side !== activeDragItem.dataset.side && !targetRightItem.classList.contains("matched")) {
                const leftLetter = activeDragItem.dataset.letter;
                const rightLetter = targetRightItem.dataset.letter;

                if (leftLetter === rightLetter) {
                    playCorrectSound();
                    matchScoreCount++;
                    document.getElementById("match-score").innerText = matchScoreCount;

                    activeDragItem.classList.add("matched");
                    targetRightItem.classList.add("matched");

                    completedLines.push({
                        from: activeDragItem.dataset.side === "left" ? activeDragItem : targetRightItem,
                        to: activeDragItem.dataset.side === "right" ? activeDragItem : targetRightItem
                    });

                    matchedPairsInCurrentPage++;

                    if (matchedPairsInCurrentPage === 5) {
                        if (currentMatchPageIdx < matchPagesCount - 1) {
                            document.getElementById("match-next-btn").style.display = "inline-block";
                        } else {
                            setTimeout(() => {
                                alert(currentGlobalLang === 'en' ? "🌟 Amazing! You have completed all match sets!" : "🌟 Hebat! Anda telah melengkapkan semua set padanan!");
                                navigateTo('home-screen');
                            }, 500);
                        }
                    }
                } else {
                    playWrongSound();
                    targetRightItem.style.backgroundColor = "#FF6B6B";
                    setTimeout(() => {
                        targetRightItem.style.backgroundColor = "white";
                    }, 400);
                }
            }

            activeDragItem = null;
            isDragging = false;
            redrawCanvas();
        }

        function redrawCanvas() {
            const canvas = document.getElementById("match-canvas");
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            completedLines.forEach(line => {
                const p1 = getItemCenter(line.from);
                const p2 = getItemCenter(line.to);
                ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);
                ctx.strokeStyle='#7ED957';ctx.lineWidth=6;ctx.lineCap='round';ctx.stroke();
            });

            if (isDragging && activeDragItem) {
                const p1 = getItemCenter(activeDragItem);

                ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(dragCurrentX,dragCurrentY);
                ctx.strokeStyle='#FF66C4';ctx.lineWidth=5;ctx.lineCap='round';
                ctx.setLineDash([8,6]);ctx.stroke();ctx.setLineDash([]);
            }
        }

        function nextMatchPage() {
            currentMatchPageIdx++;
            loadMatchPage();
        }

        // --- GAME FIND THE LETTER (APPLE TREE) ---
        let findCurrentRound = 1;
        let totalFindRounds = 5;
        let findScoreCount = 0;
        let targetFindLetter = "A";
        let targetApplesRemaining = 0;
        let findAdvanceTimer = null;
        let findRoundCompleting = false;

        function startFindLetterModule() {
            findCurrentRound = 1;
            findScoreCount = 0;
            showScreen('find-letter-screen');
            loadFindRound();
        }

        function loadFindRound() {
            clearTimeout(findAdvanceTimer);
            document.querySelector('#find-letter-screen .find-complete-overlay')?.remove();
            findRoundCompleting = false;
            let randomIdx = Math.floor(Math.random() * alphabetList.length);
            targetFindLetter = alphabetList[randomIdx];

            document.getElementById("find-round-num").innerText = findCurrentRound;
            document.getElementById("find-score").innerText = findScoreCount;
            document.getElementById("find-next-round-btn").style.display = "none";

            const instructionText = currentGlobalLang === 'en' ? `Find and put letter ${targetFindLetter} into the basket` : `Tolong masukkan huruf ${targetFindLetter} ke dalam bakul`;
            document.getElementById("find-instruction-text").innerText = instructionText;
            
            playFindInstructionAudio();

            let applesContainer = document.getElementById("apples-grid-container");
            let basketContainer = document.getElementById("basket-area-container");
            applesContainer.innerHTML = "";
            basketContainer.innerHTML = "";

            targetApplesRemaining = Math.floor(Math.random() * 3) + 3; 

            let otherLetters = alphabetList.filter(l => l !== targetFindLetter);

            let roundLetters = [];
            for (let i = 0; i < targetApplesRemaining; i++) {
                roundLetters.push(targetFindLetter);
            }
            while (roundLetters.length < 17) {
                let randomOther = otherLetters[Math.floor(Math.random() * otherLetters.length)];
                roundLetters.push(randomOther);
            }

            roundLetters.sort(() => 0.5 - Math.random());

            // Centers of the 17 scattered apples, in image percentages.
            const photoAppleCenters = [
                [24,16.5], [46.7,14.3], [81.5,18.5],
                [36.1,26.3], [60.8,23.9], [16.5,30.5], [88.7,31.5],
                [49,35.2], [71.3,37.7], [22.5,40],
                [13.4,48.8], [41.2,47.1], [90.4,47.4], [59.5,52.1],
                [27.3,58.3], [76.9,58.5], [47.6,63]
            ];
            roundLetters.forEach((letter, index) => {
                let apple = document.createElement("button");
                apple.type = "button";
                apple.className = "apple-item";
                apple.innerText = letter;
                apple.setAttribute("aria-label", letter);
                apple.style.left = photoAppleCenters[index][0] + "%";
                apple.style.top = photoAppleCenters[index][1] + "%";
                apple.addEventListener('pointerdown', event => startFindAppleDrag(event, apple, letter));
                applesContainer.appendChild(apple);
            });
        }

        function playFindInstructionAudio() {
            const textToSpeak = document.getElementById("find-instruction-text").innerText;
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = currentGlobalLang === 'en' ? 'en-US' : 'ms-MY';
                utterance.rate = 0.72;
                utterance.pitch = 1.1;
                window.speechSynthesis.speak(utterance);
            }
        }

        function startFindAppleDrag(event, apple, letter) {
            if (findRoundCompleting || apple.classList.contains('collected')) return;
            event.preventDefault();
            apple.setPointerCapture(event.pointerId);
            const rect = apple.getBoundingClientRect();
            const ghost = apple.cloneNode(true);
            ghost.classList.add('find-apple-drag');
            ghost.style.backgroundImage = getComputedStyle(apple).backgroundImage;
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            document.body.appendChild(ghost);
            const basket = document.getElementById('basket-area-container');
            let active = true;
            const move = e => {
                if (!active) return;
                ghost.style.left = (e.clientX - rect.width / 2) + 'px';
                ghost.style.top = (e.clientY - rect.height / 2) + 'px';
                basket.classList.toggle('find-drop-ready', isFindBasketDrop(e.clientX, e.clientY));
            };
            const end = e => {
                if (!active) return;
                active = false;
                apple.removeEventListener('pointermove', move);
                apple.removeEventListener('pointerup', end);
                apple.removeEventListener('pointercancel', cancel);
                basket.classList.remove('find-drop-ready');
                ghost.remove();
                if (e.type === 'pointerup' && isFindBasketDrop(e.clientX, e.clientY)) {
                    handleAppleClick(apple, letter);
                }
            };
            const cancel = e => end(e);
            apple.addEventListener('pointermove', move);
            apple.addEventListener('pointerup', end);
            apple.addEventListener('pointercancel', cancel);
            move(event);
        }

        function isFindBasketDrop(x, y) {
            const tree = document.querySelector('#find-letter-screen .apple-tree-container').getBoundingClientRect();
            const relativeX = (x - tree.left) / tree.width;
            const relativeY = (y - tree.top) / tree.height;
            return relativeX >= .12 && relativeX <= .46 && relativeY >= .77 && relativeY <= .96;
        }

        function showFindRoundComplete() {
            if (findRoundCompleting) return;
            findRoundCompleting = true;
            const overlay = document.createElement('div');
            overlay.className = 'find-complete-overlay';
            overlay.innerHTML = '<div class="find-complete-message" role="status"></div>';
            const praise = currentGlobalLang === 'en' ? 'Great job!' : 'Hebat!';
            overlay.firstElementChild.textContent = '🌟 ' + praise + ' 🍎';
            document.getElementById('find-letter-screen').appendChild(overlay);
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(praise);
                utterance.lang = currentGlobalLang === 'en' ? 'en-US' : 'ms-MY';
                utterance.rate = .85;
                window.speechSynthesis.speak(utterance);
            }
            findAdvanceTimer = setTimeout(() => {
                overlay.remove();
                if (!document.getElementById('find-letter-screen').classList.contains('active')) return;
                if (findCurrentRound < totalFindRounds) nextFindRound();
                else openABCMenu();
            }, 2000);
        }

        function handleAppleClick(appleElement, letter) {
            if (findRoundCompleting || appleElement.classList.contains("collected")) return;

            if (letter === targetFindLetter) {
                playCorrectSound();
                findScoreCount += 10;
                document.getElementById("find-score").innerText = findScoreCount;

                appleElement.classList.add("collected");

                let basketContainer = document.getElementById("basket-area-container");
                let basketApple = document.createElement("div");
                basketApple.className = "basket-apple";
                basketApple.innerText = "";
                basketContainer.appendChild(basketApple);

                targetApplesRemaining--;

                if (targetApplesRemaining === 0) showFindRoundComplete();
            } else {
                playWrongSound();
                appleElement.style.filter = "grayscale(1) brightness(.6)";
                setTimeout(() => { appleElement.style.filter = ""; }, 400);
            }
        }

        function nextFindRound() {
            findCurrentRound++;
            loadFindRound();
        }

      const abcDataEn = [
            { letter: "A", word: "Apple", image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&q=80" },
            { letter: "B", word: "Ball", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzqqP1XNEY7BWJfEGAvXCveg3uEB4nRlKTpVrTp2p9-Q&s=10" },
            { letter: "C", word: "Cat", image: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80" },
            { letter: "D", word: "Dog", image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80" },
            { letter: "E", word: "Elephant", image: "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=400&q=80" },
            { letter: "F", word: "Fish", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqHStMH6A2CYnNaGF9t313zq12DR0li-nIs71790kfdg&s=10" },
            { letter: "G", word: "Giraffe", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSi-DYB1Saa-dvMfeHz396pOyKNjwfxWly--okUiyWrA&s=10" },
            { letter: "H", word: "Horse", image: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=400&q=80" },
            { letter: "I", word: "Ice Cream", image: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=400&q=80" },
            { letter: "J", word: "Jacket", image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&q=80" },
            { letter: "K", word: "Kite", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6L4x73lHVAoFfE-lCtKZwUbIy_6BqLQdppMxBJ_ueMw&s=10" },
            { letter: "L", word: "Lion", image: "https://cdn.britannica.com/29/150929-050-547070A1/lion-Kenya-Masai-Mara-National-Reserve.jpg" },
            { letter: "M", word: "Monkey", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRfQySG_NXWKVrUKpGwBHPLcJepC9tpqwHptZPED2sZ9Q&s=10" },
            { letter: "N", word: "Nest", image: "https://th.bing.com/th/id/OIP.jm7sWf4LPgnLseu0aVbYzQHaEK?w=297&h=180&c=7&r=0&o=7&pid=1.7&rm=3" },
            { letter: "O", word: "Orange", image: "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400&q=80" },
            { letter: "P", word: "Pen", image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400&q=80" },
            { letter: "Q", word: "Queen", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0FELO3LnPMWUBmdPjMoadJD_IvaShvUwdB9Uuog0uaw&s=10" },
            { letter: "R", word: "Rabbit", image: "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=400&q=80" },
            { letter: "S", word: "Sun", image: "https://www.astronomytrek.com/wp-content/uploads/2015/10/melissa-van-niekerk-x4NfG61O4B4-unsplash-678x381.jpg" },
            { letter: "T", word: "Tree", image: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400&q=80" },
            { letter: "U", word: "Umbrella", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTpzYmB6ekurha1Jx418E31t9vbtMsrA4utEFB3I4Bwzw&s=10" },
            { letter: "V", word: "Violin", image: "https://images.unsplash.com/photo-1612225330812-01a9c6b355ec?w=400&q=80" },
            { letter: "W", word: "Watch", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS6G-EfCj_rcaR8BIN6Ck10KUy6RpY2XR1esbtZyqP4yA&s=10" },
            { letter: "X", word: "Xylophone", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjhBAzI0iBxFtTuDqdepDYaHx8OEwdJCqbq5D_ZZYd2Q&s=10" },
            { letter: "Y", word: "Yacht", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTc-7ZXL6L-nCMB8t8j8kQOFIL_q7TXnWy7SoBeVXuXXA&s=10" },
            { letter: "Z", word: "Zebra", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHLc7lKNJcaeuPAz0Mjt57WKweWtOrG94uZiW8x-Juhw&s=10" }
        ];

        const abcDataMs = [
            { letter: "A", word: "Ayam", image: "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400&q=80" },
            { letter: "B", word: "Bola", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzqqP1XNEY7BWJfEGAvXCveg3uEB4nRlKTpVrTp2p9-Q&s=10" },
            { letter: "C", word: "Cicak", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTbBGJe6EG0JRKjpIf5BwwnFV4oEYvqC9ISwNGUR0TGrw&s=10" },
            { letter: "D", word: "Daun", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwUixR05-eA4VS-bTN8Nm3CbDvu8NePFz8-e1m50Y2Uw&s=10" },
            { letter: "E", word: "Epal", image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&q=80" },
            { letter: "F", word: "Feri", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSI9MHiiRA2DHdslVcB0XOcV3yT1YuJAg_qQlaCq_guzg&s=10" },
            { letter: "G", word: "Gajah", image: "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=400&q=80" },
            { letter: "H", word: "Harimau", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTRrTjSS7Pg6BQMN-vuU3IkRZNsVF7Nt0pFce_9Y6M5nQ&s=10" },
            { letter: "I", word: "Ikan", image: "https://images.unsplash.com/photo-1524704654690-b56c05c78a00?w=400&q=80" },
            { letter: "J", word: "Jam", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSjtuxNpYsntoC6QH6rjs-FrTrXYF6ioEzk7Ox0fd8sEQ&s" },
            { letter: "K", word: "Kucing", image: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80" },
            { letter: "L", word: "Lembu", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRD80OY9-tSFWY63bgbZ4Np2H9_wz7vfc0-aonwgpttdA&s=10" },
            { letter: "M", word: "Monyet", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQp-6uNXDqeZZXN1Ze0rG-_29OMjE9wqcVW-Wi8X4oQ1w&s=10" },
            { letter: "N", word: "Nenas", image: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=400&q=80" },
            { letter: "O", word: "Oren", image: "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400&q=80" },
            { letter: "P", word: "Paku", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTPqNymyKdO69ZaHi434W_n2F2lRV5yStu1zLLMuIza9g&s" },
            { letter: "Q", word: "Quran", image: "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=400&q=80" },
            { letter: "R", word: "Rusa", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTP-4ElYYboy4ouKgmYaBWorZHmY1Kfp7muaG1edLzB4Q&s=10" },
            { letter: "S", word: "Susu", image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80" },
            { letter: "T", word: "Topi", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWSgTDG6SYKebRC_Ghg7FeRBzgOewZMDd7SgZgo4BZjQ&s=10" },
            { letter: "U", word: "Ular", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQQwpAuxfw1cf2J-I4bXcGWErwwoqcpm6jEoLzdI6YsNA&s=10" },
            { letter: "V", word: "Van", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUe_PL0q1WDP_qdYc3vdWTBGwfIvCt5mCMxJAZYsObLg&s=10" },
            { letter: "W", word: "Wisel", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSpjXyyOzNNLUnfhrjOAtNMBa3wArG_GvMD6qlFGgV_zw&s=10" },
            { letter: "X", word: "X-ray", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRRldYR5r3iTYDnmdITJUUS6Uyy7cgXenayt-ygXZYFog&s=10" },
            { letter: "Y", word: "Yoyo", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQeyVfC2DMsRrnjJyI4FouJ23EylFztN1JSkG9geWOAWg&s=10" },
            { letter: "Z", word: "Zirafah", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQFURJfb3h9KeTQ2tnK9z0yPJkf6J130IaHY5UNN4-J-g&s=10" }
        ];


        let currentABCIndex = 0;

        function openABCMenu() {
            showScreen('abc-menu-screen');
        }

        function startABC() {
            currentABCIndex = 0;
            showScreen('abc-flashcard-screen');
            renderABCFlashcard();
            playABCSound();
        }

        function renderABCFlashcard() {
            const list = currentGlobalLang === 'en' ? abcDataEn : abcDataMs;
            const item = list[currentABCIndex];
            
            document.getElementById("abc-screen-title").innerText = currentGlobalLang === 'en' ? "Learn ABC" : "Belajar ABC";
            document.getElementById("abc-progress-indicator").innerText = `${currentGlobalLang === 'en' ? 'Letter' : 'Huruf'} ${item.letter} of Z (${currentABCIndex + 1} / ${list.length})`;
            document.getElementById("abc-letter").innerText = item.letter;
            document.getElementById("abc-image").src = item.image;
            
            const caption = currentGlobalLang === 'en' ? `${item.letter} is for ${item.word}` : `${item.letter} untuk ${item.word}`;
            document.getElementById("abc-caption").innerText = caption;

            document.getElementById("prev-abc-btn").style.display = currentABCIndex === 0 ? "none" : "inline-block";
            document.getElementById("next-abc-btn").innerText = currentABCIndex === list.length - 1 ? (currentGlobalLang === 'en' ? "Finish 🏁" : "Tamat 🏁") : (currentGlobalLang === 'en' ? "Next ➡" : "Next ➡");
        }

        function nextABCLetter() {
            const list = currentGlobalLang === 'en' ? abcDataEn : abcDataMs;
            if (currentABCIndex < list.length - 1) {
                currentABCIndex++;
                renderABCFlashcard();
                playABCSound();
            } else {
                alert(currentGlobalLang === 'en' ? "Great job completing Learn ABC! 🎉" : "Tahniah! Anda telah tamat Belajar ABC! 🎉");
                navigateTo('home-screen');
            }
        }

        function prevABCLetter() {
            if (currentABCIndex > 0) {
                currentABCIndex--;
                renderABCFlashcard();
                playABCSound();
            }
        }

        function playABCSound() {
            const list = currentGlobalLang === 'en' ? abcDataEn : abcDataMs;
            const item = list[currentABCIndex];
            const textToSpeak = currentGlobalLang === 'en' ? `${item.letter} is for ${item.word}` : `${item.letter} untuk ${item.word}`;
            
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = currentGlobalLang === 'en' ? 'en-US' : 'ms-MY';
                utterance.rate = 0.3;
                utterance.pitch = 1.1;
                window.speechSynthesis.speak(utterance);
            }
        }



        /* =========================================================
           JAVASCRIPT MODUL 123
        ========================================================== */

        // Column arithmetic has its own session state; other Number activities are untouched.
        let columnMode='addition', columnQuestions=[], columnIndex=0, columnScore=0, columnLocked=false, columnTimer=null;
        const columnCopy={
            en:{addition:'Addition ➕',subtraction:'Subtraction ➖',choose:'Choose the number of questions',back:'Back ↩️',question:'Question',instruction:'Start with the ones on the right, then answer the tens on the left.',carry:'Carry',ones:'Enter the ones result first.',tens:'Now enter the tens digit.',check:'Check ✅',fill:'Complete both answer boxes first.',well:'Correct! ✅',wrong:'The correct answer is',correct:'Make a correction 🔄',next:'Next ➡',done:'All done! 🎉',score:'Score',home:'Back to Home 🏠',backNumber:'Back to Number 🔢'},
            ms:{addition:'Tambah ➕',subtraction:'Tolak ➖',choose:'Pilih bilangan soalan',back:'Kembali ↩️',question:'Soalan',instruction:'Jawab nilai sa di sebelah kanan dahulu, kemudian nilai puluh di sebelah kiri.',carry:'Bawa',ones:'Isi hasil nilai sa dahulu.',tens:'Sekarang isi digit nilai puluh.',check:'Semak ✅',fill:'Lengkapkan kedua-dua kotak jawapan dahulu.',well:'Correct! ✅',wrong:'Jawapan yang betul ialah',correct:'Buat pembetulan 🔄',next:'Seterusnya ➡',done:'Selesai! 🎉',score:'Skor',home:'Kembali ke Home 🏠',backNumber:'Kembali ke Number 🔢'}
        };
        const columnText=()=>columnCopy[getNum123Lang()];
        function updateColumnLanguage(){
            const t=columnText(), title=t[columnMode];
            for(const id of ['column-count-title','column-math-title']) document.getElementById(id).textContent=title;
            document.getElementById('column-count-prompt').textContent=t.choose;
            document.getElementById('column-count-back').textContent=t.back;
            document.getElementById('column-back').textContent=t.back;
            document.getElementById('column-instruction').textContent=t.instruction;
            document.getElementById('column-check').textContent=t.check;
            if(columnQuestions.length) document.getElementById('column-progress').textContent=`${t.question} ${columnIndex+1} / ${columnQuestions.length} · ⭐ ${columnScore}`;
        }
        function openColumnMath(mode){
            clearTimeout(columnTimer);document.getElementById('column-modal').hidden=true;
            columnMode=mode;columnQuestions=[];updateColumnLanguage();showScreen('column-count-screen');
        }
        function startColumnMath(count){
            const bank=[];
            if(columnMode==='addition'){
                for(let a=10;a<=99;a++)for(let b=10;b<=99;b++)if(a%10+b%10<=9 && Math.floor(a/10)+Math.floor(b/10)<=9)bank.push({a,b});
            }else{
                for(let a=10;a<=99;a++)for(let b=1;b<=9;b++)if(a%10>=b)bank.push({a,b});
            }
            for(let i=bank.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bank[i],bank[j]]=[bank[j],bank[i]];}
            columnQuestions=bank.slice(0,count);columnIndex=0;columnScore=0;
            showScreen('column-math-screen');renderColumnMath();
        }
        function renderColumnMath(){
            columnLocked=false;document.getElementById('column-modal').hidden=true;
            const {a,b}=columnQuestions[columnIndex],t=columnText();
            updateColumnLanguage();
            document.getElementById('column-top-ten').textContent=Math.floor(a/10);
            document.getElementById('column-top-one').textContent=a%10;
            document.getElementById('column-bottom-ten').textContent=b>=10?Math.floor(b/10):'';
            document.getElementById('column-bottom-one').textContent=b%10;
            document.getElementById('column-sign').textContent=columnMode==='addition'?'+':'−';
            const ones=document.getElementById('column-ones'),tens=document.getElementById('column-tens');
            ones.textContent='';tens.textContent='';ones.disabled=false;tens.disabled=true;selectColumnDigit('ones');
            document.getElementById('column-hint').textContent=t.ones;
            document.getElementById('column-check').disabled=false;
            document.getElementById('column-math-screen').scrollIntoView({block:'start'});
        }
        let columnActiveDigit='ones';
        function selectColumnDigit(which){
            const ones=document.getElementById('column-ones'),tens=document.getElementById('column-tens');
            if(columnLocked || (which==='tens' && tens.disabled))return;
            columnActiveDigit=which;
            ones.classList.toggle('active',which==='ones');tens.classList.toggle('active',which==='tens');
            document.getElementById('column-hint').textContent=which==='ones'?columnText().ones:columnText().tens;
        }
        function enterColumnDigit(n){
            if(columnLocked)return;
            const target=document.getElementById(columnActiveDigit==='ones'?'column-ones':'column-tens');
            target.textContent=String(n);
            if(columnActiveDigit==='ones'){
                document.getElementById('column-tens').disabled=false;
                selectColumnDigit('tens');
            }
        }
        function setupColumnBoard(){
            const board=document.getElementById('column-number-board');
            for(let n=0;n<=9;n++){
                const button=document.createElement('button');button.type='button';button.textContent=String(n);
                button.onclick=()=>{if(typeof playClickSound==='function')playClickSound();enterColumnDigit(n)};
                board.appendChild(button);
            }
        }
        setupColumnBoard();
        function checkColumnMath(){
            if(columnLocked)return;
            const t=columnText(),ones=document.getElementById('column-ones'),tens=document.getElementById('column-tens');
            if(!/^\d$/.test(ones.textContent) || !/^\d$/.test(tens.textContent)){
                document.getElementById('column-hint').textContent=t.fill;return;
            }
            const {a,b}=columnQuestions[columnIndex],expected=columnMode==='addition'?a+b:a-b;
            const entered=Number(tens.textContent)*10+Number(ones.textContent);
            const correct=entered===expected;
            columnLocked=true;document.getElementById('column-check').disabled=true;
            if(correct){columnScore++;showColumnModal(t.well,'',[]);columnTimer=setTimeout(nextColumnMath,1200);}
            else showColumnModal('❌ '+t.wrong,`${a} ${columnMode==='addition'?'+':'−'} ${b} = ${expected}`,[[t.correct,retryColumnMath],[t.next,nextColumnMath]]);
        }
        function showColumnModal(title,answer,actions){
            document.getElementById('column-modal-title').textContent=title;
            document.getElementById('column-modal-answer').textContent=answer;
            const box=document.getElementById('column-modal-actions');box.replaceChildren();
            actions.forEach(([label,action])=>{const btn=document.createElement('button');btn.className='action-btn';btn.textContent=label;btn.onclick=action;box.appendChild(btn)});
            document.getElementById('column-modal').hidden=false;
            // Read the feedback aloud in the currently selected language.
            if(title===columnText().done) announceAllDone();
            else {
                const spoken=answer ? `${title.replace(/[❌🎉]/g,'')}. ${answer}` : title.replace(/[🎉✅]/g,'');
                speakText123(spoken,.8);
            }
        }
        function retryColumnMath(){renderColumnMath();}
        function returnFromColumnToNumber(){
            clearTimeout(columnTimer);
            document.getElementById('column-modal').hidden=true;
            const universal=document.getElementById('universal-completion-pop');
            if(universal){universal.classList.remove('show');universal.style.pointerEvents='none';universal.setAttribute('aria-hidden','true');}
            if(window.speechSynthesis)window.speechSynthesis.cancel();
            // Go straight to Number activities after the final question.
            showScreen('num123-menu-screen');
            updateNumberLanguage();
        }
        function nextColumnMath(){
            if(window.speechSynthesis)window.speechSynthesis.cancel();
            clearTimeout(columnTimer);document.getElementById('column-modal').hidden=true;
            if(++columnIndex<columnQuestions.length){renderColumnMath();return;}
            const t=columnText(),percent=Math.round(columnScore/columnQuestions.length*100);
            if(window.saveScoreToFirebase)window.saveScoreToFirebase(columnMode==='addition'?'Addition':'Subtraction',percent);
            showColumnModal(t.done,`${t.score}: ${columnScore}/${columnQuestions.length}`,[[t.backNumber,returnFromColumnToNumber]]);
        }
        const numberWords123 = {
            en: ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen','Twenty'],
            ms: ['Sifar','Satu','Dua','Tiga','Empat','Lima','Enam','Tujuh','Lapan','Sembilan','Sepuluh','Sebelas','Dua belas','Tiga belas','Empat belas','Lima belas','Enam belas','Tujuh belas','Lapan belas','Sembilan belas','Dua puluh']
        };
        const num123Text = {
            en: {
                menuTitle:'123 Module 🔢', menuDesc:'Choose a fun number activity!', home:'Back to Home 🏠',
                learnTitle:'Learn 123 🔢', number:'Number', listen:'🔊 Listen', prev:'⬅ Prev', back:'Back ↩️', next:'Next ➡', finish:'Finish 🏁',
                matchTitle:'Match the Number 🔢', question:'Question', matchTip:'Tap the objects to hear counting, then drag the object box to the correct number.',
                countTitle:"Let's Count 🍎", countInstruction:'Drag the apples into each box. Then choose the answer!',
                dragApple:n=>`Drag ${n} apple${n>1?'s':''} here`, fill:'Fill both boxes first.', reset:'↻ Reset Apples',
                ready:'Great! Now choose the answer below. ✅', firstSecond:(x,a,y,b)=>`First box: ${x}/${a}   •   Second box: ${y}/${b}`,
                exact:(a,b)=>`Drag exactly ${a} apple${a>1?'s':''} and ${b} apple${b>1?'s':''} first. 🍎`,
                boxFull:'This box is full', choose:'Great. Now choose the answer.', dragFirst:'Drag the apples first', tryAgain:'Try again', correct:'Correct!',
                findTitle:'Find the Number 🔎', findListen:'🔊 Listen', findQuestion:n=>`Which one is number ${numberWords123.en[n].toLowerCase()}?`, findDone:s=>`Amazing! You completed Find the Number! Score: ${s}/20 🎉`,
                learnDone:'Great job! You learned numbers 1 to 20! 🎉', matchDone:'Excellent! You completed 5 matching questions! 🎉', score:s=>`Great job! Your score is ${s}/100 🎉`
            },
            ms: {
                menuTitle:'Modul 123 🔢', menuDesc:'Pilih aktiviti nombor yang menyeronokkan!', home:'Back to Home 🏠',
                learnTitle:'Belajar 123 🔢', number:'Nombor', listen:'🔊 Dengar', prev:'⬅ Prev', back:'Back ↩️', next:'Next ➡', finish:'Selesai 🏁',
                matchTitle:'Suaikan Nombor 🔢', question:'Soalan', matchTip:'Tekan objek untuk dengar kiraan, kemudian seret kotak objek ke nombor yang betul.',
                countTitle:'Mari Mengira 🍎', countInstruction:'Seret epal ke dalam setiap kotak. Kemudian pilih jawapan!',
                dragApple:n=>`Seret ${n} biji epal ke sini`, fill:'Isi kedua-dua kotak dahulu.', reset:'↻ Susun Semula Epal',
                ready:'Bagus! Sekarang pilih jawapan di bawah. ✅', firstSecond:(x,a,y,b)=>`Kotak pertama: ${x}/${a}   •   Kotak kedua: ${y}/${b}`,
                exact:(a,b)=>`Seret tepat ${a} biji epal dan ${b} biji epal dahulu. 🍎`,
                boxFull:'Kotak ini sudah penuh', choose:'Bagus. Sekarang pilih jawapan.', dragFirst:'Seret epal dahulu', tryAgain:'Cuba lagi', correct:'Betul!',
                findTitle:'Cari Nombor 🔎', findListen:'🔊 Dengar', findQuestion:n=>`Yang mana satu nombor ${numberWords123.ms[n].toLowerCase()}?`, findDone:s=>`Hebat! Anda sudah tamat Cari Nombor! Skor: ${s}/20 🎉`,
                learnDone:'Syabas! Anda sudah belajar nombor 1 hingga 20! 🎉', matchDone:'Hebat! Anda sudah melengkapkan 5 soalan suaian nombor! 🎉', score:s=>`Syabas! Skor anda ialah ${s}/100 🎉`
            }
        };
        const getNum123Lang = () => currentGlobalLang === 'ms' ? 'ms' : 'en';
        const getNum123Words = () => numberWords123[getNum123Lang()];
        const getNum123Text = () => num123Text[getNum123Lang()];
        let learn123Index = 1;

        function updateNumberLanguage(){
            const t=getNum123Text();
            const set=(id,val)=>{const el=document.getElementById(id); if(el)el.textContent=val;};
            set('num123-menu-title',t.menuTitle); set('num123-menu-desc',t.menuDesc); set('num123-home-btn',t.home);
            set('learn123-title',t.learnTitle); set('learn123-listen-btn',t.listen); set('learn123-prev',t.prev); set('learn123-back-btn',t.back);
            set('match123-title',t.matchTitle); set('match123-tip',t.matchTip); set('match123-back-btn',t.back);
            set('count123-title',t.countTitle); set('count123-instruction',t.countInstruction); set('count123-reset-btn',t.reset); set('count123-back-btn',t.back);
            set('find123-title',t.findTitle); set('find123-listen-btn',t.findListen); set('find123-back-btn',t.back);
            if(document.getElementById('learn123-screen')?.classList.contains('active')) renderLearn123();
            if(document.getElementById('match123-screen')?.classList.contains('active') && match123Questions.length) renderMatch123();
            if(document.getElementById('lets-count-screen')?.classList.contains('active') && count123Questions.length) renderCount123();
            if(document.getElementById('add-them-up-screen')?.classList.contains('active') && addUpSets.length) renderAddUpSet();
            if(document.getElementById('choo123-screen')?.classList.contains('active')) updateChoo123Language();
            if(document.getElementById('chooabc-screen')?.classList.contains('active')) updateChooABCLanguage();
            if(document.getElementById('taking-away-count-screen')?.classList.contains('active')) openTakingAwayCountScreen();
            if(document.getElementById('taking-away-screen')?.classList.contains('active') && takeAwaySession.length) renderTakeAwayQuestion();
            if(document.getElementById('find123-screen')?.classList.contains('active') && find123Questions.length) renderFind123();
            if(document.getElementById('column-count-screen')?.classList.contains('active') || document.getElementById('column-math-screen')?.classList.contains('active')) updateColumnLanguage();
        }

        function open123Menu(){ window.speechSynthesis && window.speechSynthesis.cancel(); updateNumberLanguage(); showScreen('num123-menu-screen'); }
        function startLearn123(){ learn123Index=1; showScreen('learn123-screen'); renderLearn123(); speakLearn123(); }
        function renderLearn123(){
            const t=getNum123Text(), words=getNum123Words();
            document.getElementById('learn123-number').textContent=learn123Index;
            document.getElementById('learn123-word').textContent=words[learn123Index];
            document.getElementById('learn123-progress').textContent=`${t.number} ${learn123Index} / 20`;
            const dots=document.getElementById('learn123-dots'); dots.innerHTML='';
            for(let i=0;i<learn123Index;i++){ const d=document.createElement('span'); d.className='learn123-dot'; dots.appendChild(d); }
            document.getElementById('learn123-prev').style.visibility=learn123Index===1?'hidden':'visible';
            document.getElementById('learn123-prev').textContent=t.prev;
            document.getElementById('learn123-next').textContent=learn123Index===20?t.finish:t.next;
            document.getElementById('learn123-listen-btn').textContent=t.listen;
            document.getElementById('learn123-back-btn').textContent=t.back;
        }
        function speakText123(text, rate=.65){ if(!('speechSynthesis' in window))return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang=getNum123Lang()==='ms'?'ms-MY':'en-US'; u.rate=rate; u.pitch=1.08; speechSynthesis.speak(u); }
        function speakLearn123(){ const words=getNum123Words(); speakText123(`${learn123Index}. ${words[learn123Index]}`,.55); }
        function nextLearn123(){ const t=getNum123Text(); if(learn123Index<20){learn123Index++;renderLearn123();speakLearn123();}else{alert(t.learnDone);open123Menu();} }
        function prevLearn123(){ if(learn123Index>1){learn123Index--;renderLearn123();speakLearn123();} }

        let find123Questions=[], find123Index=0, find123Score=0, find123Locked=false;
        function buildFind123Questions(){ return shuffle123(Array.from({length:20},(_,i)=>i+1)); }
        function startFindNumber(){
            find123Questions=buildFind123Questions(); find123Index=0; find123Score=0; find123Locked=false;
            showScreen('find123-screen'); renderFind123(); setTimeout(speakFind123Question,220);
        }
        function buildFind123Options(answer){
            const others=shuffle123(Array.from({length:20},(_,i)=>i+1).filter(n=>n!==answer)).slice(0,3);
            return shuffle123([answer,...others]);
        }
        function renderFind123(){
            if(!find123Questions.length)return;
            find123Locked=false;
            const t=getNum123Text(), answer=find123Questions[find123Index];
            document.getElementById('find123-title').textContent=t.findTitle;
            document.getElementById('find123-listen-btn').textContent=t.findListen;
            document.getElementById('find123-back-btn').textContent=t.back;
            document.getElementById('find123-progress').textContent=`${t.question} ${find123Index+1} / ${find123Questions.length}`;
            document.getElementById('find123-score').textContent=find123Score;
            document.getElementById('find123-question').textContent=t.findQuestion(answer);
            const wrap=document.getElementById('find123-options'); wrap.innerHTML='';
            buildFind123Options(answer).forEach(n=>{
                const b=document.createElement('button'); b.className='find123-option'; b.type='button'; b.textContent=n; b.dataset.number=n;
                b.onclick=()=>checkFind123Answer(b,n); wrap.appendChild(b);
            });
        }
        function speakFind123Question(){
            if(!find123Questions.length)return;
            const answer=find123Questions[find123Index], t=getNum123Text();
            speakText123(t.findQuestion(answer),.58);
        }
        function checkFind123Answer(btn,n){
            if(find123Locked)return;
            const answer=find123Questions[find123Index], t=getNum123Text();
            if(n===answer){
                find123Locked=true; btn.classList.add('correct'); find123Score++;
                document.getElementById('find123-score').textContent=find123Score;
                speakText123(getNum123Lang()==='en'?'Correct!':'Betul!',.62);
                setTimeout(()=>{
                    if(find123Index<find123Questions.length-1){ find123Index++; renderFind123(); setTimeout(speakFind123Question,180); }
                    else {
                        if(window.saveScoreToFirebase) window.saveScoreToFirebase(getNum123Lang()==='ms'?'Cari Nombor':'Find the Number', Math.round(find123Score/20*100));
                        alert(t.findDone(find123Score)); open123Menu();
                    }
                },700);
            }else{
                btn.classList.add('wrong'); speakText123(getNum123Lang()==='en'?'Try again':'Cuba lagi',.62);
                setTimeout(()=>btn.classList.remove('wrong'),520);
            }
        }

        const match123Objects=[
            {emoji:'🐱',name:'cats'},{emoji:'🐶',name:'dogs'},{emoji:'🐰',name:'rabbits'},{emoji:'🐥',name:'chicks'},
            {emoji:'🐸',name:'frogs'},{emoji:'🐼',name:'pandas'},{emoji:'🦋',name:'butterflies'},{emoji:'🐟',name:'fish'},
            {emoji:'🍓',name:'strawberries'},{emoji:'⭐',name:'stars'},{emoji:'🚗',name:'cars'},{emoji:'🎈',name:'balloons'}
        ];
        let match123Questions=[],match123Index=0,match123Score=0,match123Locked=false,match123Drag=null,match123Float=null;
        function shuffle123(a){ return [...a].sort(()=>Math.random()-.5); }
        function buildMatch123Questions(){ const counts=shuffle123([1,2,3,4,5,6,7,8,9,10]).slice(0,5); const objs=shuffle123(match123Objects).slice(0,5); return counts.map((count,i)=>({count,...objs[i]})); }
        function startMatchNumber(){ match123Questions=buildMatch123Questions(); match123Index=0; match123Score=0; showScreen('match123-screen'); renderMatch123(); }
        function renderMatch123(){
            match123Locked=false; const q=match123Questions[match123Index], t=getNum123Text(), words=getNum123Words();
            document.getElementById('match123-progress').textContent=`${t.question} ${match123Index+1} / 5`;
            document.getElementById('match123-score').textContent=match123Score;
            document.getElementById('match123-title').textContent=t.matchTitle; document.getElementById('match123-tip').textContent=t.matchTip; document.getElementById('match123-back-btn').textContent=t.back;
            const box=document.getElementById('match123-object-box'); box.innerHTML=''; box.classList.remove('dragging'); box.dataset.answer=q.count;
            for(let i=1;i<=q.count;i++){
                const e=document.createElement('span'); e.className='match123-emoji'; e.textContent=q.emoji; e.title=`${i}`;
                e.onclick=(ev)=>{ ev.stopPropagation(); e.classList.remove('counting-move'); void e.offsetWidth; e.classList.add('counting-move'); e.addEventListener('animationend',()=>e.classList.remove('counting-move'),{once:true}); speakText123(words[i],.5); };
                box.appendChild(e);
            }
            const pool=shuffle123([1,2,3,4,5,6,7,8,9,10].filter(n=>n!==q.count)).slice(0,3);
            const opts=shuffle123([q.count,...pool]); const list=document.getElementById('match123-number-list'); list.innerHTML='';
            opts.forEach(n=>{ const b=document.createElement('div');b.className='match123-number-target';b.dataset.number=n;b.textContent=n;b.onclick=()=>checkMatch123Target(b);list.appendChild(b); });
            installMatch123Drag();
        }
        function speakMatch123Sequence(){ const q=match123Questions[match123Index],words=getNum123Words(); const seq=Array.from({length:q.count},(_,i)=>words[i+1]).join(', '); speakText123(seq,.48); }
        function checkMatch123Target(target){
            if(match123Locked)return; const correct=+document.getElementById('match123-object-box').dataset.answer,t=getNum123Text();
            if(+target.dataset.number===correct){match123Locked=true;target.classList.add('correct');match123Score+=10;document.getElementById('match123-score').textContent=match123Score;speakText123(`${correct}. ${t.correct}`,.6);setTimeout(()=>{if(match123Index<4){match123Index++;renderMatch123();}else{if(window.saveScoreToFirebase)window.saveScoreToFirebase(getNum123Lang()==='ms'?'Suaikan Nombor':'Match the Number',100);alert(t.matchDone);open123Menu();}},850)}
            else{target.classList.add('wrong');speakText123(t.tryAgain,.7);setTimeout(()=>target.classList.remove('wrong'),550)}
        }
        function installMatch123Drag(){
            const box=document.getElementById('match123-object-box'); box.onpointerdown=(e)=>{
                if(match123Locked || e.target.classList.contains('match123-emoji'))return;
                e.preventDefault(); match123Drag={pointerId:e.pointerId}; box.setPointerCapture?.(e.pointerId); box.classList.add('dragging'); speakMatch123Sequence();
                match123Float=document.createElement('div');match123Float.className='num123-floating';match123Float.textContent=match123Questions[match123Index].emoji;document.body.appendChild(match123Float);moveMatchFloat(e);
            };
            box.onpointermove=(e)=>{if(!match123Drag)return; e.preventDefault();moveMatchFloat(e); highlightMatchTarget(e.clientX,e.clientY)};
            box.onpointerup=box.onpointercancel=(e)=>{if(!match123Drag)return;e.preventDefault(); const t=document.elementFromPoint(e.clientX,e.clientY)?.closest('.match123-number-target'); cleanupMatchDrag(); if(t)checkMatch123Target(t);};
        }
        function moveMatchFloat(e){if(match123Float){match123Float.style.left=e.clientX+'px';match123Float.style.top=e.clientY+'px';}}
        function highlightMatchTarget(x,y){document.querySelectorAll('.match123-number-target').forEach(x=>x.classList.remove('hovered'));const t=document.elementFromPoint(x,y)?.closest('.match123-number-target');if(t)t.classList.add('hovered');}
        function cleanupMatchDrag(){match123Drag=null;document.getElementById('match123-object-box')?.classList.remove('dragging');document.querySelectorAll('.match123-number-target').forEach(x=>x.classList.remove('hovered'));match123Float?.remove();match123Float=null;}

        const count123QuestionBank=[
            [1,1],[1,2],[2,1],[2,2],[2,3],[3,1],[3,2],[3,3],[4,1],[4,2],[4,3],[4,4],[5,1],[5,2],[5,3],[5,4],[5,5],[6,1],[6,2],[6,3],[6,4],[7,1],[7,2],[7,3],[8,1],[8,2],[9,1]
        ].filter(x=>x[0]+x[1]<=10);
        let count123Questions=[],count123Index=0,count123Score=0,count123Placed={a:0,b:0},count123DragApple=null,count123FloatApple=null,count123Answered=false;
        function startLetsCount(){count123Questions=shuffle123(count123QuestionBank).slice(0,10);count123Index=0;count123Score=0;showScreen('lets-count-screen');renderCount123();}
        function renderCount123(){
            count123Placed={a:0,b:0};count123Answered=false; const [a,b]=count123Questions[count123Index],t=getNum123Text();
            document.getElementById('count123-progress').textContent=`${t.question} ${count123Index+1} / 10`;document.getElementById('count123-score').textContent=count123Score;document.getElementById('count123-equation').textContent=`${a} + ${b} = ?`;
            document.getElementById('count123-title').textContent=t.countTitle; document.getElementById('count123-instruction').textContent=t.countInstruction; document.getElementById('count123-reset-btn').textContent=t.reset; document.getElementById('count123-back-btn').textContent=t.back;
            document.getElementById('count123-label-a').textContent=t.dragApple(a);document.getElementById('count123-label-b').textContent=t.dragApple(b);
            document.getElementById('count123-status').textContent=t.fill;
            ['count123-zone-a','count123-zone-b'].forEach(id=>{const z=document.getElementById(id);z.querySelectorAll('.count123-placed').forEach(x=>x.remove());z.classList.remove('hovered')});
            const bank=document.getElementById('count123-bank');bank.innerHTML='';
            for(let i=0;i<10;i++){const ap=document.createElement('span');ap.className='count123-apple';ap.textContent='🍎';ap.dataset.apple=i;bank.appendChild(ap);installCountAppleDrag(ap);}
            renderCount123Answers();
        }
        function renderCount123Answers(){const [a,b]=count123Questions[count123Index],ans=a+b;let pool=shuffle123([1,2,3,4,5,6,7,8,9,10].filter(n=>n!==ans)).slice(0,3);let opts=shuffle123([ans,...pool]);const wrap=document.getElementById('count123-answers');wrap.innerHTML='';opts.forEach(n=>{const btn=document.createElement('button');btn.className='count123-answer';btn.textContent=n;btn.onclick=()=>answerCount123(btn,n);wrap.appendChild(btn);});}
        function installCountAppleDrag(ap){
            ap.onpointerdown=e=>{if(ap.classList.contains('used')||count123Answered)return;e.preventDefault();count123DragApple=ap;ap.setPointerCapture?.(e.pointerId);count123FloatApple=document.createElement('div');count123FloatApple.className='num123-floating';count123FloatApple.textContent='🍎';document.body.appendChild(count123FloatApple);moveCountFloat(e)};
            ap.onpointermove=e=>{if(count123DragApple!==ap)return;e.preventDefault();moveCountFloat(e);highlightCountZone(e.clientX,e.clientY)};
            ap.onpointerup=ap.onpointercancel=e=>{if(count123DragApple!==ap)return;e.preventDefault();const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('.count123-dropzone');cleanupCountDrag();if(zone)dropCountApple(ap,zone.dataset.zone)};
        }
        function moveCountFloat(e){if(count123FloatApple){count123FloatApple.style.left=e.clientX+'px';count123FloatApple.style.top=e.clientY+'px'}}
        function highlightCountZone(x,y){document.querySelectorAll('.count123-dropzone').forEach(z=>z.classList.remove('hovered'));const z=document.elementFromPoint(x,y)?.closest('.count123-dropzone');if(z)z.classList.add('hovered')}
        function cleanupCountDrag(){count123DragApple=null;count123FloatApple?.remove();count123FloatApple=null;document.querySelectorAll('.count123-dropzone').forEach(z=>z.classList.remove('hovered'))}
        function dropCountApple(ap,zoneKey){
            const [a,b]=count123Questions[count123Index],limit=zoneKey==='a'?a:b,t=getNum123Text();if(count123Placed[zoneKey]>=limit){speakText123(t.boxFull,.7);return;}
            count123Placed[zoneKey]++;ap.classList.add('used');const p=document.createElement('span');p.className='count123-placed';p.textContent='🍎';document.getElementById(`count123-zone-${zoneKey}`).appendChild(p);speakText123(getNum123Words()[count123Placed[zoneKey]],.52);updateCount123Status();
        }
        function updateCount123Status(){const [a,b]=count123Questions[count123Index],t=getNum123Text();const ready=count123Placed.a===a&&count123Placed.b===b;document.getElementById('count123-status').textContent=ready?t.ready:t.firstSecond(count123Placed.a,a,count123Placed.b,b);if(ready)speakText123(t.choose,.72)}
        function resetCount123Drag(){if(count123Answered)return;const t=getNum123Text();count123Placed={a:0,b:0};document.querySelectorAll('.count123-apple').forEach(x=>x.classList.remove('used'));document.querySelectorAll('.count123-placed').forEach(x=>x.remove());document.getElementById('count123-status').textContent=t.fill;}
        function answerCount123(btn,n){
            if(count123Answered)return;const [a,b]=count123Questions[count123Index],t=getNum123Text();if(count123Placed.a!==a||count123Placed.b!==b){document.getElementById('count123-status').textContent=t.exact(a,b);speakText123(t.dragFirst,.7);return;}
            const ans=a+b;if(n===ans){count123Answered=true;btn.classList.add('correct');count123Score+=10;document.getElementById('count123-score').textContent=count123Score;speakText123(getNum123Lang()==='ms'?`${a} tambah ${b} sama dengan ${ans}. ${t.correct}`:`${a} plus ${b} equals ${ans}. ${t.correct}`,.58);setTimeout(()=>{if(count123Index<count123Questions.length-1){count123Index++;renderCount123();}else{if(window.saveScoreToFirebase)window.saveScoreToFirebase(getNum123Lang()==='ms'?'Mari Mengira':"Let's Count",Math.round(count123Score/10)*10);alert(t.score(count123Score));open123Menu();}},950)}else{btn.classList.add('wrong');speakText123(t.tryAgain,.7);setTimeout(()=>btn.classList.remove('wrong'),550)}
        }





        // =========================================================
        // ADD THEM UP - 5 sets x 4 questions, total never above 10
        // =========================================================
        const addUpPairBank = [];
        for(let a=1;a<=9;a++) for(let b=1;b<=9;b++) if(a+b<=10) addUpPairBank.push([a,b]);
        const addUpFruits=['🍎','🍊','🍓','🍐','🍇','🍒','🥝','🍋','🍑','🫐'];
        let addUpSets=[],addUpSetIndex=0,addUpScore=0,addUpAnswers={},addUpCountState={},addUpDrag=null,addUpFloat=null,addUpAdvancing=false;

        function addUpText(){
            const ms=getNum123Lang()==='ms';
            return ms ? {
                title:'Tambah Semuanya! ➕', set:'Set', instruction:'Kira semua objek. Tarik nombor yang betul ke dalam setiap kotak jawapan.',
                back:'Back ↩️', correct:'Betul!', wrong:'Cuba lagi.', done:'Hebat! Anda sudah lengkapkan semua 5 set!', fill:'Isi semua 4 kotak jawapan.',
                score:s=>`Hebat! Skor anda ${s}/100 🎉`
            } : {
                title:'Add Them Up! ➕', set:'Set', instruction:'Count all the objects. Drag the correct number into each answer box.',
                back:'Back ↩️', correct:'Correct!', wrong:'Try again.', done:'Amazing! You completed all 5 sets!', fill:'Fill all 4 answer boxes.',
                score:s=>`Great job! Your score is ${s}/100 🎉`
            };
        }
        function buildAddUpSets(){
            const pool=shuffle123(addUpPairBank);
            const sets=[]; const used=new Set();
            for(let s=0;s<5;s++){
                const set=[], totals=new Set();
                for(const pair of pool){
                    const key=pair.join('+'), total=pair[0]+pair[1];
                    if(used.has(key)||totals.has(total)) continue;
                    set.push(pair); used.add(key); totals.add(total);
                    if(set.length===4) break;
                }
                // Defensive fallback; normal bank always supplies enough unique questions.
                if(set.length<4){
                    for(const pair of shuffle123(addUpPairBank)){
                        const key=pair.join('+'), total=pair[0]+pair[1];
                        if(!used.has(key)&&!totals.has(total)){set.push(pair);used.add(key);totals.add(total);if(set.length===4)break;}
                    }
                }
                sets.push(shuffle123(set));
            }
            return sets;
        }
        function startAddThemUp(){
            window.speechSynthesis && window.speechSynthesis.cancel();
            addUpSets=buildAddUpSets(); addUpSetIndex=0; addUpScore=0; addUpAnswers={}; addUpCountState={}; addUpAdvancing=false;
            showScreen('add-them-up-screen'); renderAddUpSet();
        }
        function renderAddUpSet(){
            if(!addUpSets.length) return;
            const t=addUpText(), set=addUpSets[addUpSetIndex]; addUpAnswers={}; addUpCountState={}; addUpAdvancing=false;
            document.getElementById('addup-title').textContent=t.title;
            document.getElementById('addup-progress').textContent=`${t.set} ${addUpSetIndex+1} / 5`;
            document.getElementById('addup-score').textContent=addUpScore;
            document.getElementById('addup-instruction').textContent=t.instruction;
            document.getElementById('addup-back-btn').textContent=t.back;
            document.getElementById('addup-status').textContent=t.fill;
            const wrap=document.getElementById('addup-questions'); wrap.innerHTML='';
            set.forEach((pair,i)=>{
                const [a,b]=pair, fruit=addUpFruits[(addUpSetIndex*4+i)%addUpFruits.length]; addUpCountState[i]=0;
                const row=document.createElement('div'); row.className='addup-row'; row.dataset.q=i;
                row.innerHTML=`<div class="addup-object-box" data-group="a"></div><div class="addup-symbol">+</div><div class="addup-object-box" data-group="b"></div><div class="addup-symbol">=</div><div class="addup-answer-zone" data-q="${i}" data-answer="${a+b}"></div>`;
                const boxes=row.querySelectorAll('.addup-object-box');
                for(let n=0;n<a;n++) boxes[0].appendChild(makeAddUpObject(fruit,i));
                for(let n=0;n<b;n++) boxes[1].appendChild(makeAddUpObject(fruit,i));
                wrap.appendChild(row);
            });
            const totals=set.map(x=>x[0]+x[1]);
            const bank=document.getElementById('addup-answer-bank'); bank.innerHTML='';

            // ADD THEM UP sahaja: rawakkan susunan pilihan jawapan setiap kali set dipaparkan.
            // Fisher-Yates digunakan supaya setiap nombor mempunyai peluang kedudukan yang seimbang.
            const shuffledAnswers=[...totals];
            for(let i=shuffledAnswers.length-1;i>0;i--){
                const j=Math.floor(Math.random()*(i+1));
                [shuffledAnswers[i],shuffledAnswers[j]]=[shuffledAnswers[j],shuffledAnswers[i]];
            }
            shuffledAnswers.forEach((n,i)=>{const tile=document.createElement('div');tile.className='addup-answer-tile';tile.textContent=n;tile.dataset.value=n;tile.dataset.tile=i;installAddUpTileDrag(tile);bank.appendChild(tile);});
        }
        function makeAddUpObject(fruit,q){
            const el=document.createElement('span'); el.className='addup-object'; el.textContent=fruit; el.dataset.q=q;
            el.onclick=()=>{
                if(el.classList.contains('counted')) return;
                el.classList.add('counted');
                const total=addUpSets[addUpSetIndex][q][0]+addUpSets[addUpSetIndex][q][1];
                addUpCountState[q]=((addUpCountState[q]||0)%total)+1;
                speakText123(getNum123Words()[addUpCountState[q]] || String(addUpCountState[q]),.55);
                setTimeout(()=>el.classList.remove('counted'),260);
            };
            return el;
        }
        function installAddUpTileDrag(tile){
            tile.onpointerdown=e=>{
                if(tile.classList.contains('used')||addUpAdvancing)return; e.preventDefault();
                addUpDrag={tile,pointerId:e.pointerId}; tile.setPointerCapture?.(e.pointerId); tile.classList.add('dragging');
                addUpFloat=document.createElement('div'); addUpFloat.className='addup-floating'; addUpFloat.textContent=tile.dataset.value; document.body.appendChild(addUpFloat); moveAddUpFloat(e);
            };
            tile.onpointermove=e=>{if(addUpDrag?.tile!==tile)return;e.preventDefault();moveAddUpFloat(e);highlightAddUpZone(e.clientX,e.clientY)};
            tile.onpointerup=tile.onpointercancel=e=>{
                if(addUpDrag?.tile!==tile)return;e.preventDefault();
                const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('.addup-answer-zone'); cleanupAddUpDrag(); if(zone)dropAddUpAnswer(tile,zone);
            };
        }
        function moveAddUpFloat(e){if(addUpFloat){addUpFloat.style.left=e.clientX+'px';addUpFloat.style.top=e.clientY+'px';}}
        function highlightAddUpZone(x,y){document.querySelectorAll('.addup-answer-zone').forEach(z=>z.classList.remove('hovered'));const z=document.elementFromPoint(x,y)?.closest('.addup-answer-zone');if(z&&!z.classList.contains('correct'))z.classList.add('hovered');}
        function cleanupAddUpDrag(){if(addUpDrag?.tile)addUpDrag.tile.classList.remove('dragging');addUpDrag=null;addUpFloat?.remove();addUpFloat=null;document.querySelectorAll('.addup-answer-zone').forEach(z=>z.classList.remove('hovered'));}
        function dropAddUpAnswer(tile,zone){
            if(zone.classList.contains('correct')||tile.classList.contains('used')) return;
            const t=addUpText(), val=+tile.dataset.value, ans=+zone.dataset.answer, q=+zone.dataset.q;
            if(val===ans){
                zone.textContent=val; zone.classList.remove('wrong'); zone.classList.add('correct'); tile.classList.add('used'); addUpAnswers[q]=val;
                addUpScore+=5; document.getElementById('addup-score').textContent=addUpScore; speakText123(`${val}. ${t.correct}`,.62);
                if(Object.keys(addUpAnswers).length===4){
                    addUpAdvancing=true; document.getElementById('addup-status').textContent=t.correct;
                    setTimeout(()=>{
                        if(addUpSetIndex<4){addUpSetIndex++;renderAddUpSet();}
                        else{if(window.saveScoreToFirebase)window.saveScoreToFirebase(getNum123Lang()==='ms'?'Tambah Semuanya':'Add Them Up',addUpScore);alert(t.score(addUpScore));open123Menu();}
                    },900);
                }
            } else {
                zone.classList.add('wrong'); document.getElementById('addup-status').textContent=t.wrong; speakText123(t.wrong,.7); setTimeout(()=>zone.classList.remove('wrong'),500);
            }
        }

        const CHOO_TRAIN_ART='images/asset-6d8ce24b8688ded6.webp';
        const CHOO_SCENE_ART='images/asset-8a30be417ab2e821.jpg';
        // CHOO CHOO 123 - five unique number sequences, three gaps in each train.
        // Freeze the completed carriages into one bitmap so the train and every label
        // travel by exactly the same pixels on each animation frame.
        function freezeCompletedChooTrain(train){
            const trainSet=train.querySelector('.choo-train-set');
            const artwork=trainSet?.querySelector('.choo-train-art');
            if(!trainSet||!artwork?.complete||!artwork.naturalWidth)return;
            const canvas=document.createElement('canvas');
            canvas.width=artwork.naturalWidth;canvas.height=artwork.naturalHeight;
            canvas.className='choo-train-art';canvas.setAttribute('aria-hidden','true');
            const ctx=canvas.getContext('2d');
            if(!ctx)return;
            ctx.drawImage(artwork,0,0,canvas.width,canvas.height);
            const scaleX=canvas.width/trainSet.clientWidth,scaleY=canvas.height/trainSet.clientHeight;
            trainSet.querySelectorAll('.choo-panel').forEach(panel=>{
                const size=parseFloat(getComputedStyle(panel).fontSize)*scaleY;
                ctx.font=`900 ${size}px 'Fredoka One', cursive`;
                ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#146bd0';
                ctx.shadowColor='#fff';ctx.shadowOffsetX=2*scaleX;ctx.shadowOffsetY=2*scaleY;
                ctx.fillText(panel.textContent,(panel.offsetLeft+panel.offsetWidth/2)*scaleX,(panel.offsetTop+panel.offsetHeight/2)*scaleY);
            });
            trainSet.replaceChildren(canvas);
        }
        let chooQuestions=[],chooIndex=0,chooFilled=new Set(),chooScore=0,chooDrag=null,chooFloat=null,chooAdvancing=false,chooSession=0,chooRetryVoice=null;
        function chooText(){return getNum123Lang()==='ms'?{
            question:'Soalan',instruction:'Seret nombor ke gerabak kosong mengikut turutan.',back:'Back ↩️',correct:'Betul!',wrong:'cuba lagi',done:'Hebat! Semua 5 kereta api berjaya dilengkapkan! 🎉'
        }:{question:'Question',instruction:'Drag the numbers into the empty carriages in order.',back:'Back ↩️',correct:'Correct!',wrong:'try again',done:'Amazing! You completed all 5 trains! 🎉'};}
        function startChoo123(){
            window.speechSynthesis?.cancel();
            chooSession++;chooQuestions=shuffle123(Array.from({length:16},(_,i)=>i+1)).slice(0,5).map(start=>({start,empty:shuffle123([0,1,2,3,4]).slice(0,3)}));
            chooIndex=0;chooScore=0;showScreen('choo123-screen');renderChoo123();
            const screen=document.getElementById('choo123-screen');
            if(!screen.dataset.audioReady){
                screen.dataset.audioReady='1';
                // Capture the original mobile gesture before drag handling or pointer capture.
                screen.addEventListener('pointerdown',e=>{
                    if(e.target.closest('#choo-train,#choo-bank')){wakeAppSound();playClickSound();}
                },{capture:true,passive:true});
            }
        }
        function updateChoo123Language(){
            const t=chooText();
            document.getElementById('choo-progress').textContent=`${t.question} ${chooIndex+1} / 5`;
            document.getElementById('choo-instruction').textContent=t.instruction;
            document.getElementById('choo-back-btn').textContent=t.back;
        }
        function renderChoo123(arriving=false){
            cleanupChooDrag();chooFilled=new Set();chooAdvancing=false;
            const q=chooQuestions[chooIndex],train=document.getElementById('choo-train'),bank=document.getElementById('choo-bank');
            train.classList.remove('choo-depart','choo-arrive');
            train.style.backgroundImage='none';
            if(!train.querySelector('.choo-scene')){
                const scene=document.createElement('img');scene.className='choo-scene';scene.src=CHOO_SCENE_ART;scene.alt='';scene.draggable=false;train.appendChild(scene);
            }
            train.querySelector('.choo-train-set')?.remove();
            const trainSet=document.createElement('div');trainSet.className='choo-train-set';train.appendChild(trainSet);
            const artwork=document.createElement('img');artwork.className='choo-train-art';artwork.alt='Realistic toy train with five carriages';artwork.draggable=false;
            artwork.src=CHOO_TRAIN_ART;trainSet.appendChild(artwork);
            for(let i=0;i<5;i++){
                const panel=document.createElement('div');panel.className='choo-panel';
                if(q.empty.includes(i)){
                    panel.classList.add('choo-drop');panel.dataset.answer=String(q.start+i);
                    panel.setAttribute('aria-label',getNum123Lang()==='ms'?`Gerabak ${i+1}, kosong`:`Carriage ${i+1}, empty`);
                }else panel.textContent=q.start+i;
                trainSet.appendChild(panel);
            }
            bank.innerHTML='';
            shuffle123(q.empty.map(i=>q.start+i)).forEach(value=>{
                const tile=document.createElement('div');tile.className='choo-tile';tile.textContent=value;tile.dataset.value=String(value);
                tile.setAttribute('role','button');tile.setAttribute('aria-label',String(value));installChooDrag(tile);bank.appendChild(tile);
            });
            document.getElementById('choo-score').textContent=chooScore;
            document.getElementById('choo-status').textContent='';updateChoo123Language();
            bank.classList.toggle('choo-waiting',arriving);
            if(arriving){
                chooAdvancing=true;train.classList.add('choo-arrive');
                setTimeout(()=>{if(train.classList.contains('choo-arrive')){train.classList.remove('choo-arrive');bank.classList.remove('choo-waiting');chooAdvancing=false;}},1000);
            }
        }
        function installChooDrag(tile){
            tile.onpointerdown=e=>{
                if(chooAdvancing||tile.classList.contains('used'))return;
                e.preventDefault();chooDrag={tile,id:e.pointerId};tile.setPointerCapture?.(e.pointerId);tile.classList.add('dragging');
                chooFloat=document.createElement('div');chooFloat.className='choo-tile choo-float';chooFloat.textContent=tile.dataset.value;document.body.appendChild(chooFloat);moveChooFloat(e);
            };
            tile.onpointermove=e=>{
                if(chooDrag?.tile!==tile||chooDrag.id!==e.pointerId)return;
                e.preventDefault();moveChooFloat(e);
                document.querySelectorAll('#choo-train .choo-drop').forEach(z=>z.classList.remove('hovered'));
                const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('#choo-train .choo-drop');
                if(zone&&!zone.classList.contains('correct'))zone.classList.add('hovered');
            };
            tile.onpointerup=e=>{
                if(chooDrag?.tile!==tile||chooDrag.id!==e.pointerId)return;
                e.preventDefault();
                const hit=document.elementFromPoint(e.clientX,e.clientY);
                const zone=hit?.closest('#choo-train .choo-drop') || hit?.closest('#choo-train .choo-panel.choo-drop');
                cleanupChooDrag();if(zone)dropChooAnswer(tile,zone);
            };
            tile.onpointercancel=()=>{if(chooDrag?.tile===tile)cleanupChooDrag();};
        }
        function moveChooFloat(e){if(chooFloat){chooFloat.style.left=e.clientX+'px';chooFloat.style.top=e.clientY+'px';}}
        function cleanupChooDrag(){chooDrag?.tile?.classList.remove('dragging');chooDrag=null;chooFloat?.remove();chooFloat=null;document.querySelectorAll('#choo-train .choo-drop.hovered').forEach(z=>z.classList.remove('hovered'));}
        function playChooRetry(){
            const message=chooText().wrong;
            playWrongSound();
            if(!('speechSynthesis' in window))return;
            try{
                speechSynthesis.cancel();
                chooRetryVoice=new SpeechSynthesisUtterance(message);
                chooRetryVoice.lang=getNum123Lang()==='ms'?'ms-MY':'en-US';
                chooRetryVoice.rate=.78;chooRetryVoice.volume=1;
                speechSynthesis.speak(chooRetryVoice);
                speechSynthesis.resume();
            }catch(error){console.warn('Choo Choo voice could not play:',error);}
        }
        function dropChooAnswer(tile,zone){
            if(chooAdvancing||tile.classList.contains('used'))return;
            const value=+tile.dataset.value,t=chooText(),status=document.getElementById('choo-status');
            if(zone.classList.contains('correct')||value!==+zone.dataset.answer){
                zone.classList.add('wrong');status.textContent=t.wrong;
                playChooRetry();
                setTimeout(()=>zone.classList.remove('wrong'),500);return;
            }
            playCorrectSound();zone.textContent=value;zone.classList.add('correct');tile.classList.add('used');chooFilled.add(value);
            status.textContent=t.correct;speakText123(String(value),.7);
            if(chooFilled.size===3){
                chooAdvancing=true;chooScore+=20;document.getElementById('choo-score').textContent=chooScore;
                const session=chooSession;
                setTimeout(()=>{
                    if(session!==chooSession||!document.getElementById('choo123-screen').classList.contains('active'))return;
                    freezeCompletedChooTrain(document.getElementById('choo-train'));
                    document.getElementById('choo-train').classList.add('choo-depart');
                    document.getElementById('choo-train').classList.remove('choo-arrive');
                    document.getElementById('choo-bank').classList.add('choo-waiting');
                    setTimeout(()=>{
                        if(session!==chooSession||!document.getElementById('choo123-screen').classList.contains('active'))return;
                        if(chooIndex<4){chooIndex++;renderChoo123(true);}
                        else{if(window.saveScoreToFirebase)window.saveScoreToFirebase('Choo Choo 123',chooScore);alert(t.done);open123Menu();}
                    },1150);
                },450);
            }
        }

        // CHOO-CHOO ABC - five unique letter sequences, three gaps in each train.
        let chooABCQuestions=[],chooABCIndex=0,chooABCFilled=new Set(),chooABCScore=0,chooABCDrag=null,chooABCFloat=null,chooABCAdvancing=false,chooABCSession=0,chooABCRetryVoice=null;
        function chooABCText(){return getNum123Lang()==='ms'?{
            question:'Soalan',instruction:'Seret huruf ke gerabak kosong mengikut turutan.',back:'Back ↩️',correct:'Betul!',wrong:'cuba lagi',done:'Hebat! Semua 5 kereta api ABC berjaya dilengkapkan! 🎉'
        }:{question:'Question',instruction:'Drag the letters into the empty carriages in order.',back:'Back ↩️',correct:'Correct!',wrong:'try again',done:'Amazing! You completed all 5 ABC trains! 🎉'};}
        function startChooABC(){
            window.speechSynthesis?.cancel();
            chooABCSession++;chooABCQuestions=shuffle123(Array.from({length:22},(_,i)=>i)).slice(0,5).map(start=>({start,empty:shuffle123([0,1,2,3,4]).slice(0,3)}));
            chooABCIndex=0;chooABCScore=0;showScreen('chooabc-screen');renderChooABC();
            const screen=document.getElementById('chooabc-screen');
            if(!screen.dataset.audioReady){
                screen.dataset.audioReady='1';
                // Capture the original mobile gesture before drag handling or pointer capture.
                screen.addEventListener('pointerdown',e=>{
                    if(e.target.closest('#chooabc-train,#chooabc-bank')){wakeAppSound();playClickSound();}
                },{capture:true,passive:true});
            }
        }
        function updateChooABCLanguage(){
            const t=chooABCText();
            document.getElementById('chooabc-progress').textContent=`${t.question} ${chooABCIndex+1} / 5`;
            document.getElementById('chooabc-instruction').textContent=t.instruction;
            document.getElementById('chooabc-back-btn').textContent=t.back;
        }
        function renderChooABC(arriving=false){
            cleanupChooABCDrag();chooABCFilled=new Set();chooABCAdvancing=false;
            const q=chooABCQuestions[chooABCIndex],train=document.getElementById('chooabc-train'),bank=document.getElementById('chooabc-bank');
            train.classList.remove('choo-depart','choo-arrive');
            train.style.backgroundImage='none';
            if(!train.querySelector('.choo-scene')){
                const scene=document.createElement('img');scene.className='choo-scene';scene.src=CHOO_SCENE_ART;scene.alt='';scene.draggable=false;train.appendChild(scene);
            }
            train.querySelector('.choo-train-set')?.remove();
            const trainSet=document.createElement('div');trainSet.className='choo-train-set';train.appendChild(trainSet);
            const artwork=document.createElement('img');artwork.className='choo-train-art';artwork.alt='Realistic toy train with five carriages';artwork.draggable=false;
            artwork.src=CHOO_TRAIN_ART;trainSet.appendChild(artwork);
            for(let i=0;i<5;i++){
                const panel=document.createElement('div');panel.className='choo-panel';
                if(q.empty.includes(i)){
                    panel.classList.add('choo-drop');panel.dataset.answer=String.fromCharCode(65+q.start+i);
                    panel.setAttribute('aria-label',getNum123Lang()==='ms'?`Gerabak ${i+1}, kosong`:`Carriage ${i+1}, empty`);
                }else panel.textContent=String.fromCharCode(65+q.start+i);
                trainSet.appendChild(panel);
            }
            bank.innerHTML='';
            shuffle123(q.empty.map(i=>String.fromCharCode(65+q.start+i))).forEach(value=>{
                const tile=document.createElement('div');tile.className='choo-tile';tile.textContent=value;tile.dataset.value=String(value);
                tile.setAttribute('role','button');tile.setAttribute('aria-label',String(value));installChooABCDrag(tile);bank.appendChild(tile);
            });
            document.getElementById('chooabc-score').textContent=chooABCScore;
            document.getElementById('chooabc-status').textContent='';updateChooABCLanguage();
            bank.classList.toggle('choo-waiting',arriving);
            if(arriving){
                chooABCAdvancing=true;train.classList.add('choo-arrive');
                setTimeout(()=>{if(train.classList.contains('choo-arrive')){train.classList.remove('choo-arrive');bank.classList.remove('choo-waiting');chooABCAdvancing=false;}},1000);
            }
        }
        function installChooABCDrag(tile){
            tile.onpointerdown=e=>{
                if(chooABCAdvancing||tile.classList.contains('used'))return;
                e.preventDefault();chooABCDrag={tile,id:e.pointerId};tile.setPointerCapture?.(e.pointerId);tile.classList.add('dragging');
                chooABCFloat=document.createElement('div');chooABCFloat.className='choo-tile choo-float';chooABCFloat.textContent=tile.dataset.value;document.body.appendChild(chooABCFloat);moveChooABCFloat(e);
            };
            tile.onpointermove=e=>{
                if(chooABCDrag?.tile!==tile||chooABCDrag.id!==e.pointerId)return;
                e.preventDefault();moveChooABCFloat(e);
                document.querySelectorAll('#chooabc-train .choo-drop').forEach(z=>z.classList.remove('hovered'));
                const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('#chooabc-train .choo-drop');
                if(zone&&!zone.classList.contains('correct'))zone.classList.add('hovered');
            };
            tile.onpointerup=e=>{
                if(chooABCDrag?.tile!==tile||chooABCDrag.id!==e.pointerId)return;
                e.preventDefault();
                const hit=document.elementFromPoint(e.clientX,e.clientY);
                const zone=hit?.closest('#chooabc-train .choo-drop') || hit?.closest('#chooabc-train .choo-panel.choo-drop');
                cleanupChooABCDrag();if(zone)dropChooABCAnswer(tile,zone);
            };
            tile.onpointercancel=()=>{if(chooABCDrag?.tile===tile)cleanupChooABCDrag();};
        }
        function moveChooABCFloat(e){if(chooABCFloat){chooABCFloat.style.left=e.clientX+'px';chooABCFloat.style.top=e.clientY+'px';}}
        function cleanupChooABCDrag(){chooABCDrag?.tile?.classList.remove('dragging');chooABCDrag=null;chooABCFloat?.remove();chooABCFloat=null;document.querySelectorAll('#chooabc-train .choo-drop.hovered').forEach(z=>z.classList.remove('hovered'));}
        function playChooABCRetry(){
            const message=chooABCText().wrong;
            playWrongSound();
            if(!('speechSynthesis' in window))return;
            try{
                speechSynthesis.cancel();
                chooABCRetryVoice=new SpeechSynthesisUtterance(message);
                chooABCRetryVoice.lang=getNum123Lang()==='ms'?'ms-MY':'en-US';
                chooABCRetryVoice.rate=.78;chooABCRetryVoice.volume=1;
                speechSynthesis.speak(chooABCRetryVoice);
                speechSynthesis.resume();
            }catch(error){console.warn('Choo-Choo ABC voice could not play:',error);}
        }
        function dropChooABCAnswer(tile,zone){
            if(chooABCAdvancing||tile.classList.contains('used'))return;
            const value=tile.dataset.value,t=chooABCText(),status=document.getElementById('chooabc-status');
            if(zone.classList.contains('correct')||value!==zone.dataset.answer){
                zone.classList.add('wrong');status.textContent=t.wrong;
                playChooABCRetry();
                setTimeout(()=>zone.classList.remove('wrong'),500);return;
            }
            playCorrectSound();zone.textContent=value;zone.classList.add('correct');tile.classList.add('used');chooABCFilled.add(value);
            status.textContent=t.correct;speakText123(String(value),.7);
            if(chooABCFilled.size===3){
                chooABCAdvancing=true;chooABCScore+=20;document.getElementById('chooabc-score').textContent=chooABCScore;
                const session=chooABCSession;
                setTimeout(()=>{
                    if(session!==chooABCSession||!document.getElementById('chooabc-screen').classList.contains('active'))return;
                    freezeCompletedChooTrain(document.getElementById('chooabc-train'));
                    document.getElementById('chooabc-train').classList.add('choo-depart');
                    document.getElementById('chooabc-train').classList.remove('choo-arrive');
                    document.getElementById('chooabc-bank').classList.add('choo-waiting');
                    setTimeout(()=>{
                        if(session!==chooABCSession||!document.getElementById('chooabc-screen').classList.contains('active'))return;
                        if(chooABCIndex<4){chooABCIndex++;renderChooABC(true);}
                        else{if(window.saveScoreToFirebase)window.saveScoreToFirebase('Choo-Choo ABC',chooABCScore);alert(t.done);openABCMenu();}
                    },1150);
                },450);
            }
        }

        // =========================================================
        // TAKING AWAY - one large question per page, selectable 5/10/15/20
        // =========================================================
        const takeAwayPairBank=[];
        for(let whole=2;whole<=10;whole++) for(let remove=1;remove<whole;remove++) takeAwayPairBank.push([whole,remove]);
        const takeAwayObjects=['🍎','🍊','🍓','🍐','🍇','🍒','🥝','🍋','🍑','🫐'];
        let takeAwaySession=[],takeAwayQuestionIndex=0,takeAwayQuestionTotal=5,takeAwayScore=0,takeAwayAnswers={},takeAwayRemoved={},takeAwayCountState={},takeAwayDrag=null,takeAwayFloat=null,takeAwayAdvancing=false;

        function takeAwayText(){
            const ms=getNum123Lang()==='ms';
            return ms?{
                title:'Taking Away ➖',question:'Soalan',choose:'Pilih bilangan soalan',instruction:'Seret objek ke dalam bakul mengikut soalan. Kira objek yang tinggal, kemudian pilih jawapan yang betul.',
                back:'Back ↩️',remove:n=>`Masukkan ${n} objek ke dalam bakul.`,ready:'Bagus! Tekan objek yang tinggal untuk mengira, kemudian pilih jawapan.',
                full:'Objek yang perlu dikeluarkan sudah cukup.',first:'Keluarkan objek ke dalam bakul dahulu.',correct:'Betul!',wrong:'Cuba lagi.',fill:'Masukkan objek ke dalam bakul dahulu.',score:s=>`Hebat! Skor anda ${s}/100 🎉`
            }:{
                title:'Taking Away ➖',question:'Question',choose:'Choose the number of questions',instruction:'Drag the objects into the basket. Count what remains, then choose the correct answer.',
                back:'Back ↩️',remove:n=>`Put ${n} object${n>1?'s':''} into the basket.`,ready:'Great! Tap the remaining objects to count, then choose the answer.',
                full:'You have removed enough objects.',first:'Move the objects into the basket first.',correct:'Correct!',wrong:'Try again.',fill:'Move the objects into the basket first.',score:s=>`Great job! Your score is ${s}/100 🎉`
            };
        }
        function openTakingAwayCountScreen(){
            window.speechSynthesis&&window.speechSynthesis.cancel();
            const t=takeAwayText();
            document.getElementById('takeaway-count-title').textContent=t.title;
            document.getElementById('takeaway-count-text').textContent=t.choose;
            document.getElementById('takeaway-count-back').textContent=t.back;
            showScreen('taking-away-count-screen');
        }
        function buildTakeAwaySession(count){
            return shuffle123(takeAwayPairBank).slice(0,count);
        }
        function startTakingAway(count){
            window.speechSynthesis&&window.speechSynthesis.cancel();takeAwayQuestionTotal=[5,10,15,20].includes(count)?count:5;takeAwaySession=buildTakeAwaySession(takeAwayQuestionTotal);takeAwayQuestionIndex=0;takeAwayScore=0;takeAwayAnswers={};takeAwayRemoved={};takeAwayCountState={};takeAwayAdvancing=false;showScreen('taking-away-screen');renderTakeAwayQuestion();
        }
        function renderTakeAwayQuestion(){
            if(!takeAwaySession.length)return;const t=takeAwayText(),pair=takeAwaySession[takeAwayQuestionIndex];takeAwayAnswers={};takeAwayRemoved={0:0};takeAwayCountState={0:0};takeAwayAdvancing=false;
            document.getElementById('takeaway-title').textContent=t.title;document.getElementById('takeaway-progress').textContent=`${t.question} ${takeAwayQuestionIndex+1} / ${takeAwayQuestionTotal}`;document.getElementById('takeaway-score').textContent=Math.round(takeAwayScore);document.getElementById('takeaway-instruction').textContent=t.instruction;document.getElementById('takeaway-back-btn').textContent=t.back;document.getElementById('takeaway-status').textContent=t.fill;
            const wrap=document.getElementById('takeaway-questions');wrap.innerHTML='';
            const [whole,remove]=pair,q=0,object=takeAwayObjects[takeAwayQuestionIndex%takeAwayObjects.length];
            const row=document.createElement('div');row.className='takeaway-row';row.dataset.q=q;
            row.innerHTML=`<div class="takeaway-equation">${whole} − ${remove} = ?</div><div class="takeaway-object-box" data-q="0"></div><div class="takeaway-basket" data-q="0" data-limit="${remove}" title="${t.remove(remove)}">🧺<span class="takeaway-basket-count">0/${remove}</span></div><div class="takeaway-answer-zone" data-q="0" data-answer="${whole-remove}">?</div>`;
            const box=row.querySelector('.takeaway-object-box');for(let n=0;n<whole;n++)box.appendChild(makeTakeAwayObject(object,0));wrap.appendChild(row);
            const correct=whole-remove,choices=new Set([correct]);
            for(const n of shuffle123([1,2,3,4,5,6,7,8,9])){if(choices.size===4)break;choices.add(n);}
            const answers=shuffle123([...choices]),bank=document.getElementById('takeaway-answer-bank');bank.innerHTML='';
            answers.forEach((n,i)=>{const tile=document.createElement('div');tile.className='takeaway-answer-tile';tile.textContent=n;tile.dataset.value=n;tile.dataset.tile=i;installTakeAwayAnswerDrag(tile);tile.onclick=()=>dropTakeAwayAnswer(tile,row.querySelector('.takeaway-answer-zone'));bank.appendChild(tile);});
        }
        function makeTakeAwayObject(symbol,q){
            const el=document.createElement('span');el.className='takeaway-object';el.textContent=symbol;el.dataset.q=q;
            el.onclick=()=>{if(el.classList.contains('removed'))return;el.classList.add('counted');takeAwayCountState[q]=(takeAwayCountState[q]||0)+1;speakText123(getNum123Words()[takeAwayCountState[q]]||String(takeAwayCountState[q]),.55);setTimeout(()=>el.classList.remove('counted'),260);};
            el.onpointerdown=e=>{if(el.classList.contains('removed')||takeAwayAdvancing)return;e.preventDefault();takeAwayDrag={type:'object',el,q,pointerId:e.pointerId};el.setPointerCapture?.(e.pointerId);takeAwayFloat=document.createElement('div');takeAwayFloat.className='takeaway-floating';takeAwayFloat.textContent=symbol;document.body.appendChild(takeAwayFloat);moveTakeAwayFloat(e);};
            el.onpointermove=e=>{if(takeAwayDrag?.el!==el)return;e.preventDefault();moveTakeAwayFloat(e);highlightTakeAwayBasket(e.clientX,e.clientY,q);};
            el.onpointerup=el.onpointercancel=e=>{if(takeAwayDrag?.el!==el)return;e.preventDefault();const basket=document.elementFromPoint(e.clientX,e.clientY)?.closest('.takeaway-basket');cleanupTakeAwayDrag();if(basket&&+basket.dataset.q===q)dropTakeAwayObject(el,basket,q);};return el;
        }
        function moveTakeAwayFloat(e){if(takeAwayFloat){takeAwayFloat.style.left=e.clientX+'px';takeAwayFloat.style.top=e.clientY+'px';}}
        function highlightTakeAwayBasket(x,y,q){document.querySelectorAll('.takeaway-basket').forEach(z=>z.classList.remove('hovered'));const z=document.elementFromPoint(x,y)?.closest('.takeaway-basket');if(z&&+z.dataset.q===q)z.classList.add('hovered');}
        function cleanupTakeAwayDrag(){if(takeAwayDrag?.type==='answer')takeAwayDrag.tile?.classList.remove('dragging');takeAwayDrag=null;takeAwayFloat?.remove();takeAwayFloat=null;document.querySelectorAll('.takeaway-basket,.takeaway-answer-zone').forEach(z=>z.classList.remove('hovered'));}
        function dropTakeAwayObject(el,basket,q){
            const t=takeAwayText(),limit=+basket.dataset.limit;if(takeAwayRemoved[q]>=limit){speakText123(t.full,.7);return;}el.classList.add('removed');takeAwayRemoved[q]++;takeAwayCountState[q]=0;basket.querySelector('.takeaway-basket-count').textContent=`${takeAwayRemoved[q]}/${limit}`;const left=limit-takeAwayRemoved[q];document.getElementById('takeaway-status').textContent=left?'':t.ready;playClickSound();speakText123(getNum123Words()[takeAwayRemoved[q]]||String(takeAwayRemoved[q]),.58);
        }
        function installTakeAwayAnswerDrag(tile){
            tile.onpointerdown=e=>{if(tile.classList.contains('used')||takeAwayAdvancing)return;e.preventDefault();takeAwayDrag={type:'answer',tile,pointerId:e.pointerId};tile.setPointerCapture?.(e.pointerId);tile.classList.add('dragging');takeAwayFloat=document.createElement('div');takeAwayFloat.className='takeaway-floating number';takeAwayFloat.textContent=tile.dataset.value;document.body.appendChild(takeAwayFloat);moveTakeAwayFloat(e);};
            tile.onpointermove=e=>{if(takeAwayDrag?.tile!==tile)return;e.preventDefault();moveTakeAwayFloat(e);document.querySelectorAll('.takeaway-answer-zone').forEach(z=>z.classList.remove('hovered'));const z=document.elementFromPoint(e.clientX,e.clientY)?.closest('.takeaway-answer-zone');if(z&&!z.classList.contains('correct'))z.classList.add('hovered');};
            tile.onpointerup=tile.onpointercancel=e=>{if(takeAwayDrag?.tile!==tile)return;e.preventDefault();const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('.takeaway-answer-zone');cleanupTakeAwayDrag();if(zone)dropTakeAwayAnswer(tile,zone);};
        }
        function dropTakeAwayAnswer(tile,zone){
            if(zone.classList.contains('correct')||tile.classList.contains('used')||takeAwayAdvancing)return;const t=takeAwayText(),q=+zone.dataset.q,pair=takeAwaySession[takeAwayQuestionIndex],remove=pair[1];
            if(takeAwayRemoved[q]!==remove){document.getElementById('takeaway-status').textContent=t.first;speakText123(t.first,.7);return;}
            const val=+tile.dataset.value,ans=+zone.dataset.answer;if(val===ans){zone.textContent=val;zone.classList.remove('wrong');zone.classList.add('correct');tile.classList.add('used');takeAwayAnswers[q]=val;takeAwayScore+=100/takeAwayQuestionTotal;document.getElementById('takeaway-score').textContent=Math.round(takeAwayScore);speakText123(`${val}. ${t.correct}`,.62);
                takeAwayAdvancing=true;document.getElementById('takeaway-status').textContent=t.correct;setTimeout(()=>{if(takeAwayQuestionIndex<takeAwayQuestionTotal-1){takeAwayQuestionIndex++;renderTakeAwayQuestion();}else{const finalScore=Math.round(takeAwayScore);if(window.saveScoreToFirebase)window.saveScoreToFirebase('Taking Away',finalScore);alert(t.score(finalScore));open123Menu();}},900);
            }else{zone.classList.add('wrong');document.getElementById('takeaway-status').textContent=t.wrong;speakText123(t.wrong,.7);setTimeout(()=>zone.classList.remove('wrong'),500);}
        }

        // =========================================================
        // COLOUR MODULE DATA & LOGIC
        // =========================================================
        const colourItems = [
            {en:'Red',ms:'Merah',hex:'#F44336'}, {en:'Blue',ms:'Biru',hex:'#2196F3'},
            {en:'Yellow',ms:'Kuning',hex:'#FFEB3B'}, {en:'Green',ms:'Hijau',hex:'#4CAF50'},
            {en:'Orange',ms:'Oren',hex:'#FF9800'}, {en:'Purple',ms:'Ungu',hex:'#9C27B0'},
            {en:'Pink',ms:'Merah Jambu',hex:'#FF69B4'}, {en:'Brown',ms:'Coklat',hex:'#795548'},
            {en:'Black',ms:'Hitam',hex:'#212121'}, {en:'White',ms:'Putih',hex:'#FFFFFF'}
        ];
        const colourShuffle = a => [...a].sort(()=>Math.random()-.5);
        const colourName = c => currentGlobalLang==='ms' ? c.ms : c.en;
        function speakColourText(text){ if(!('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang=currentGlobalLang==='ms'?'ms-MY':'en-US'; u.rate=.75; speechSynthesis.speak(u); }
        function openColourMenu(){ stopPairSocks(); showScreen('colour-menu-screen'); updateColourLanguage(); }
        function updateColourLanguage(){
            const ms=currentGlobalLang==='ms';
            const set=(id,en,bm)=>{const e=document.getElementById(id);if(e)e.innerText=ms?bm:en};
            set('colour-menu-title','Colour Module 🎨','Modul Warna 🎨'); set('colour-menu-desc','Choose a fun colour activity!','Pilih aktiviti warna yang menyeronokkan!'); set('colour-home-btn','Back to Home 🏠','Back to Home 🏠');
            set('learn-colour-title','Learn Colour 🎨','Belajar Warna 🎨'); set('learn-colour-listen','🔊 Listen','🔊 Dengar'); set('learn-colour-prev','⬅ Prev','⬅ Prev'); set('learn-colour-next','Next ➡','Next ➡'); set('learn-colour-back','Back ↩️','Back ↩️');
            set('pop-balloon-title','Pop the Balloon 🎈','Pecahkan Belon 🎈'); set('pop-balloon-listen','🔊 Listen','🔊 Dengar'); set('pop-balloon-back','Back ↩️','Back ↩️');
            set('match-colour-title','Match the Colour 🎨','Suaikan Warna 🎨'); set('match-colour-instruction','Tap a colour word, then match it with the correct colour.','Tekan perkataan warna, kemudian suaikan dengan warna yang betul.'); set('match-colour-back','Back ↩️','Back ↩️');
            set('match-paint-title','Match the Paint 🎨','Suaikan Cat 🎨'); set('match-paint-instruction','Drag a paint tube onto another tube to swap their places and match the colours below.','Seret satu tiub cat ke tiub lain untuk bertukar tempat dan susun mengikut warna di bawah.');
            set('pair-socks-title','Pair the Socks 🧦','Padankan Stokin 🧦'); set('pair-socks-instruction','','');
            set('crayon-title','Match the Crayon 🖍️','Padankan Krayon 🖍️'); set('crayon-instruction','Drag each crayon into the box above its matching colour.','Seret setiap krayon ke dalam kotak di atas warna yang sepadan.');
            set('find-colour-title','Find the Colour 🔎','Cari Warna 🔎'); set('find-colour-listen','🔊 Listen','🔊 Dengar'); set('find-colour-back','Back ↩️','Back ↩️');
            if(document.getElementById('learn-colour-screen')?.classList.contains('active')) renderLearnColour();
            if(document.getElementById('pop-balloon-screen')?.classList.contains('active')) renderPopBalloon();
            if(document.getElementById('match-colour-screen')?.classList.contains('active')) renderMatchColourSet();
            if(document.getElementById('match-crayon-screen')?.classList.contains('active')&&crayonSets.length) refreshCrayonLanguage();
            if(document.getElementById('pair-socks-screen')?.classList.contains('active')) refreshPairSocksLanguage();
            if(document.getElementById('find-colour-screen')?.classList.contains('active')) renderFindColour();
        }

        // Pair the Socks: nine single-hue knit patterns, eighteen socks, three distinct sets.
        const sockStyles=[
            {name:'Red',ms:'Merah',base:'#ff8192',dark:'#d83f61',pattern:'dots'},
            {name:'Blue',ms:'Biru',base:'#70c5ff',dark:'#347ed3',pattern:'stripes'},
            {name:'Green',ms:'Hijau',base:'#8fea93',dark:'#41a65e',pattern:'diamonds'},
            {name:'Purple',ms:'Ungu',base:'#cca6f7',dark:'#865fc0',pattern:'stars'},
            {name:'Orange',ms:'Oren',base:'#ffc17c',dark:'#d87b2f',pattern:'hearts'},
            {name:'Yellow',ms:'Kuning',base:'#ffe781',dark:'#b28c28',pattern:'checks'},
            {name:'Pink',ms:'Merah Jambu',base:'#ffb2df',dark:'#c45d9c',pattern:'waves'},
            {name:'Brown',ms:'Coklat',base:'#d7a47f',dark:'#966646',pattern:'crosses'},
            {name:'Teal',ms:'Biru Hijau',base:'#78e2d2',dark:'#278f81',pattern:'chevrons'}
        ];
        // Each photograph has its own crop; the wooden peg is drawn with the sock.
        const sockPhotos=[
            'images/asset-bcb0efe89b848b88.webp',
            'images/asset-2f3fabc415004dd1.webp',
            'images/asset-a597981da89ca08b.webp',
            'images/asset-9c08592969c0ae2d.webp',
            'images/asset-412d1188fbf6eda1.webp',
            'images/asset-1e231e326e2f6223.webp',
            'images/asset-7fa93eca8600d112.webp',
            'images/asset-4f28bd5c4fb8cb8f.webp',
            'images/asset-2b3dc0c0be9d765a.webp'
        ];
        let sockOrder=[],sockSet=0,sockSelected=-1,sockLocked=false,sockTimer=null,sockPop=null,sockIgnoreClickUntil=0,sockUsedSets=new Set();
        function sockShuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
        function sockSvg(style,unique){
            const positions={dots:0,stripes:1,diamonds:2,stars:3,hearts:4,checks:5,waves:6,crosses:7,chevrons:8};
            const photo=sockPhotos[positions[style.pattern]];
            return `<svg class="sock-art" viewBox="0 0 361 440" aria-hidden="true"><image href="${photo}" x="0" y="30" width="361" height="410"/></svg>`;
        }
        function stopPairSocks(){if(sockTimer){clearTimeout(sockTimer);sockTimer=null}sockPop?.remove();sockPop=null;sockLocked=false}
        function refreshPairSocksLanguage(){document.getElementById('pair-socks-progress').textContent=`${currentGlobalLang==='ms'?'Set':'Set'} ${sockSet+1} / 3`}
        function startPairSocks(){stopPairSocks();sockSet=0;sockUsedSets=new Set();showScreen('pair-socks-screen');updateColourLanguage();newSockSet()}
        function newSockSet(){
            sockLocked=false;sockSelected=-1;document.getElementById('pair-socks-feedback').textContent='';
            // Even positions are anchors; the nine odd positions are a derangement.
            let anchors,loose,key;
            do{
                anchors=sockShuffle(sockStyles.map((_,i)=>i));
                do{loose=sockShuffle(anchors)}while(loose.some((c,i)=>c===anchors[i]));
                key=anchors.flatMap((c,i)=>[c,loose[i]]).join(',');
            }while(sockUsedSets.has(key));
            sockUsedSets.add(key);
            sockOrder=anchors.flatMap((c,i)=>[c,loose[i]]);
            refreshPairSocksLanguage();renderSocks();
        }
        function renderSocks(){
            const board=document.getElementById('pair-socks-board');board.replaceChildren();
            for(let row=0;row<3;row++){
                const line=document.createElement('div');line.className='socks-line';
                for(let pair=0;pair<3;pair++){
                    const pairBox=document.createElement('div');pairBox.className='sock-pair';
                    for(let side=0;side<2;side++){
                    const i=row*6+pair*2+side,style=sockStyles[sockOrder[i]];
                    const place=document.createElement('div');place.className='sock-place';place.dataset.index=i;
                    if(sockOrder[i-(i%2)]===sockOrder[i-(i%2)+1])place.classList.add('paired');
                    if(sockSelected===i)place.classList.add('selected');
                    place.setAttribute('role','button');place.tabIndex=0;
                    place.setAttribute('aria-label',`${currentGlobalLang==='ms'?style.ms:style.name} ${currentGlobalLang==='ms'?'stokin':'sock'}, ${i+1}`);
                    const cuffPositions=[46,41.3,36.8,46.8,41.8,36.6,46.8,42.1,37.9];
                    const cuffX=cuffPositions[sockOrder[i]];
                    place.innerHTML=`<span class="sock-visual" style="--cuff-x:${cuffX}%">${sockSvg(style,`${sockSet}-${i}`)}<span class="sock-peg" aria-hidden="true"></span></span>`;
                    place.addEventListener('pointerdown',e=>beginSockDrag(e,place));
                    place.addEventListener('click',()=>{if(Date.now()>=sockIgnoreClickUntil)chooseSock(i)});
                    place.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseSock(i)}});
                    pairBox.appendChild(place);
                    }
                    line.appendChild(pairBox);
                }
                board.appendChild(line);
            }
        }
        function sockPairIsDone(index){const first=index-(index%2);return sockOrder[first]===sockOrder[first+1]}
        function chooseSock(index){
            if(sockLocked)return;
            if(sockSelected<0){sockSelected=index;renderSocks();return}
            const from=sockSelected;sockSelected=-1;
            if(from!==index)swapSocks(from,index);else renderSocks();
        }
        // Hit-test the visible sock, including portions outside its narrower grid slot.
        function sockDropTargetAt(x,y){
            const board=document.getElementById('pair-socks-board');
            const candidates=[...board.querySelectorAll('.sock-place')].filter(place=>{
                const r=place.querySelector('.sock-visual').getBoundingClientRect();
                return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
            });
            if(candidates.length){
                candidates.sort((a,b)=>{
                    const distance=place=>{
                        const visual=place.querySelector('.sock-visual'),r=visual.getBoundingClientRect();
                        const pegX=r.left+r.width*parseFloat(visual.style.getPropertyValue('--cuff-x'))/100;
                        return (x-pegX)**2+(y-(r.top+r.height*.45))**2;
                    };
                    return distance(a)-distance(b);
                });
                return candidates[0];
            }
            const hit=document.elementFromPoint(x,y)?.closest('.sock-place');
            return hit&&board.contains(hit)?hit:null;
        }
        function beginSockDrag(e,place){
            if(sockLocked||e.button!==0)return;
            e.preventDefault();const startX=e.clientX,startY=e.clientY,from=+place.dataset.index;
            const original=place.querySelector('svg');
            const size=original.getBoundingClientRect();
            const ghost=original.cloneNode(true);ghost.classList.add('sock-ghost');
            ghost.style.setProperty('--sock-drag-width',`${size.width}px`);
            ghost.style.setProperty('--sock-drag-height',`${size.height}px`);
            document.body.appendChild(ghost);original.style.visibility='hidden';
            const move=ev=>{ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';const target=sockDropTargetAt(ev.clientX,ev.clientY);document.querySelectorAll('#pair-socks-board .sock-place').forEach(p=>p.classList.toggle('over',p===target))};
            const clean=()=>{place.removeEventListener('pointermove',move);place.removeEventListener('pointerup',end);place.removeEventListener('pointercancel',cancel);original.style.visibility='';ghost.remove();document.querySelectorAll('#pair-socks-board .sock-place.over').forEach(p=>p.classList.remove('over'))};
            const end=ev=>{const target=sockDropTargetAt(ev.clientX,ev.clientY);const moved=Math.hypot(ev.clientX-startX,ev.clientY-startY)>10;clean();if(moved){sockIgnoreClickUntil=Date.now()+300;if(target)swapSocks(from,+target.dataset.index)}};
            const cancel=()=>clean();place.setPointerCapture(e.pointerId);place.addEventListener('pointermove',move);place.addEventListener('pointerup',end);place.addEventListener('pointercancel',cancel);move(e);
        }
        function swapSocks(from,to){
            if(sockLocked||from===to)return;
            [sockOrder[from],sockOrder[to]]=[sockOrder[to],sockOrder[from]];playClickSound();renderSocks();
            if(Array.from({length:9},(_,i)=>sockOrder[2*i]===sockOrder[2*i+1]).every(Boolean))finishSockSet();
        }
        function sockVoice(words){if(!('speechSynthesis' in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(words);u.lang='en-US';u.rate=.82;speechSynthesis.speak(u)}
        function sockPopup(words){sockPop?.remove();sockPop=document.createElement('div');sockPop.className='paint-success-pop sock-success-pop';sockPop.setAttribute('role','status');const label=document.createElement('span');label.textContent=words;sockPop.appendChild(label);document.body.appendChild(sockPop);sockVoice(words.replace(/[!🌟🎉]/g,''))}
        function finishSockSet(){
            sockLocked=true;playCorrectSound();sockPopup('Correct! 🌟');
            sockTimer=setTimeout(()=>{
                sockTimer=null;sockPop?.remove();sockPop=null;
                if(!document.getElementById('pair-socks-screen').classList.contains('active'))return;
                if(sockSet<2){sockSet++;newSockSet();return}
                sockPopup('All Done! 🎉');
                if(window.saveScoreToFirebase)window.saveScoreToFirebase('Pair the Socks',100);
                sockTimer=setTimeout(()=>{sockTimer=null;if(document.getElementById('pair-socks-screen').classList.contains('active'))openColourMenu()},2000);
            },2000);
        }

        // Five distinct colour combinations, shuffled anew for each session.
        let crayonSets=[],crayonSetIndex=0,crayonMatched=new Set(),crayonSelected=null,crayonLocked=false,crayonTimer=null;
        function shuffleCrayons(items){
            const result=[...items];
            for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}
            return result;
        }
        async function startMatchCrayon(){
            await crayonPhotoLoaded;
            if(crayonTimer){clearTimeout(crayonTimer);crayonTimer=null}
            document.querySelector('.crayon-success-pop')?.remove();
            const used=new Set(); // Draw directly from the Match the Paint colourItems data.
            crayonSets=[];
            while(crayonSets.length<5){
                const colours=colourShuffle(colourItems).slice(0,5),key=colours.map(c=>c.en).sort().join('|');
                if(!used.has(key)){used.add(key);crayonSets.push(shuffleCrayons(colours))}
            }
            crayonSets=shuffleCrayons(crayonSets);crayonSetIndex=0;
            showScreen('match-crayon-screen');updateColourLanguage();renderCrayonSet();
        }
        // One photographed wax crayon, recoloured from the exact Match the Paint hex values.
        const crayonPhoto=new Image();
        let crayonPhotoReady=false;
        const crayonPhotoLoaded=new Promise(resolve=>{
            crayonPhoto.onload=()=>{crayonPhotoReady=true;resolve(true)};
            crayonPhoto.onerror=()=>resolve(false);
        });
        crayonPhoto.src='images/asset-7e8d11f6c5e37ad5.png';
        const crayonPhotoColours=new Map();
        function crayonPhotoFor(hex){
            if(crayonPhotoColours.has(hex))return crayonPhotoColours.get(hex);
            const canvas=document.createElement('canvas');canvas.width=128;canvas.height=400;
            const ctx=canvas.getContext('2d',{willReadFrequently:true});
            ctx.drawImage(crayonPhoto,280,20,465,1480,0,0,128,400);
            const frame=ctx.getImageData(0,0,128,400),data=frame.data;
            const target=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
            for(let i=0;i<data.length;i+=4){
                const alpha=data[i+3];
                if(alpha<55){data[i+3]=0;continue}
                const light=(data[i]+data[i+1]+data[i+2])/3;
                const shade=(light-142)*.43;
                for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,target[c]+shade));
                data[i+3]=Math.min(255,Math.round((alpha-55)*255/200));
            }
            ctx.putImageData(frame,0,0);
            const result=canvas.toDataURL('image/png');crayonPhotoColours.set(hex,result);
            return result;
        }
        function makeCrayon(colour){
            const stick=document.createElement('span');stick.className='crayon-stick';
            const img=document.createElement('img');img.alt='';img.draggable=false;
            if(crayonPhotoReady)img.src=crayonPhotoFor(colour.hex);
            else{img.src=crayonPhoto.src;img.style.background=colour.hex}
            stick.appendChild(img);return stick;
        }

        function refreshCrayonLanguage(){
            document.getElementById('crayon-progress').textContent=`${currentGlobalLang==='ms'?'Soalan':'Question'} ${crayonSetIndex+1} / 5`;
            document.querySelectorAll('#crayon-slots .crayon-slot').forEach(slot=>{
                const colour=colourItems.find(c=>c.en===slot.dataset.colour);
                if(colour)slot.setAttribute('aria-label',colourName(colour));
            });
            document.querySelectorAll('#crayon-bank .crayon-stick').forEach(stick=>{
                const colour=colourItems.find(c=>c.en===stick.dataset.colour);
                if(colour)stick.setAttribute('aria-label',`${colourName(colour)} crayon`);
            });
        }
        function renderCrayonSet(){
            if(!document.getElementById('match-crayon-screen').classList.contains('active'))return;
            crayonMatched=new Set();crayonSelected=null;crayonLocked=false;
            const colours=crayonSets[crayonSetIndex],slots=document.getElementById('crayon-slots');
            const front=document.getElementById('crayon-front-colours'),bank=document.getElementById('crayon-bank');
            slots.replaceChildren();front.replaceChildren();bank.replaceChildren();
            document.getElementById('crayon-feedback').textContent='';
            document.getElementById('crayon-progress').textContent=`${currentGlobalLang==='ms'?'Soalan':'Question'} ${crayonSetIndex+1} / 5`;
            colours.forEach(colour=>{
                const slot=document.createElement('div');slot.className='crayon-slot';slot.dataset.colour=colour.en;
                slot.setAttribute('role','button');slot.tabIndex=0;
                slot.setAttribute('aria-label',colourName(colour));
                slot.addEventListener('click',()=>{if(crayonSelected)dropCrayon(crayonSelected,slot)});
                slot.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&crayonSelected){e.preventDefault();dropCrayon(crayonSelected,slot)}});
                slots.appendChild(slot);
                const swatch=document.createElement('span');swatch.style.background=colour.hex;front.appendChild(swatch);
            });
            const scattered=[
                {x:'19%',y:'18%',tilt:'-24deg',layer:2},
                {x:'35%',y:'5%',tilt:'17deg',layer:4},
                {x:'50%',y:'23%',tilt:'-9deg',layer:3},
                {x:'65%',y:'6%',tilt:'23deg',layer:5},
                {x:'81%',y:'19%',tilt:'-17deg',layer:1}
            ];
            shuffleCrayons(colours).forEach((colour,index)=>{
                const stick=makeCrayon(colour);stick.dataset.colour=colour.en;
                const place=scattered[index];
                stick.style.setProperty('--x',place.x);stick.style.setProperty('--y',place.y);
                stick.style.setProperty('--tilt',place.tilt);stick.style.setProperty('--layer',place.layer);
                stick.setAttribute('role','button');stick.tabIndex=0;
                stick.setAttribute('aria-label',`${colourName(colour)} crayon`);
                stick.addEventListener('pointerdown',e=>beginCrayonDrag(e,stick));
                stick.addEventListener('click',()=>selectCrayon(stick));
                stick.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCrayon(stick)}});
                bank.appendChild(stick);
            });
        }
        function selectCrayon(stick){
            if(crayonLocked||!stick.isConnected)return;
            document.querySelectorAll('#crayon-bank .crayon-stick').forEach(s=>s.classList.remove('selected'));
            crayonSelected=stick.dataset.colour;stick.classList.add('selected');
        }
        function beginCrayonDrag(e,stick){
            if(crayonLocked||e.button!==0)return;
            e.preventDefault();const startX=e.clientX,startY=e.clientY,colour=stick.dataset.colour;
            const ghost=stick.cloneNode(true);ghost.className='crayon-stick crayon-ghost';
            ghost.style.width=stick.offsetWidth+'px';
            ghost.style.height=stick.offsetHeight+'px';
            document.body.appendChild(ghost);stick.style.opacity='.3';
            const move=ev=>{
                ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';
                const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.crayon-slot');
                document.querySelectorAll('#crayon-slots .crayon-slot').forEach(s=>s.classList.toggle('over',s===target));
            };
            const clean=()=>{stick.removeEventListener('pointermove',move);stick.removeEventListener('pointerup',end);stick.removeEventListener('pointercancel',cancel);stick.style.opacity='';ghost.remove();document.querySelectorAll('#crayon-slots .crayon-slot').forEach(s=>s.classList.remove('over'))};
            const end=ev=>{const slot=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('#crayon-slots .crayon-slot');clean();if(slot)dropCrayon(colour,slot);else if(Math.hypot(ev.clientX-startX,ev.clientY-startY)<12)selectCrayon(stick)};
            const cancel=()=>clean();
            stick.setPointerCapture(e.pointerId);stick.addEventListener('pointermove',move);stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',cancel);move(e);
        }
        function dropCrayon(colour,slot){
            if(crayonLocked||!colour||crayonMatched.has(colour)||!slot?.isConnected)return;
            if(slot.dataset.colour!==colour){
                slot.classList.remove('wrong');void slot.offsetWidth;slot.classList.add('wrong');
                playWrongSound();document.getElementById('crayon-feedback').textContent=currentGlobalLang==='ms'?'Cuba lagi!':'Try again!';
                return; // The crayon stays outside the box.
            }
            crayonMatched.add(colour);crayonSelected=null;
            document.querySelectorAll('#crayon-bank .crayon-stick').forEach(s=>{if(s.dataset.colour===colour)s.remove()});
            const item=crayonSets[crayonSetIndex].find(c=>c.en===colour);
            slot.appendChild(makeCrayon(item));playCorrectSound();
            document.getElementById('crayon-feedback').textContent='';
            if(crayonMatched.size===5){
                crayonLocked=true;
                const pop=document.createElement('div');pop.className='paint-success-pop crayon-success-pop';
                const message=document.createElement('span');message.textContent=currentGlobalLang==='ms'?'Betul!':'Correct!';pop.appendChild(message);
                document.body.appendChild(pop);speakText123('Correct',.8);
                crayonTimer=setTimeout(()=>{
                    pop.remove();crayonTimer=null;
                    if(!document.getElementById('match-crayon-screen').classList.contains('active'))return;
                    crayonSetIndex++;
                    if(crayonSetIndex<5)renderCrayonSet();
                    else{if(window.saveScoreToFirebase)window.saveScoreToFirebase('Match the Crayon',100);openColourMenu()}
                },2000);
            }
        }


        // Arrange six tubes by swapping their positions, five sets per session.
        let paintSets=[],paintSetIndex=0,paintScore=0,paintSelected=null,paintAdvanceTimer=null,paintArrangement=[],paintTargets=[],paintFinishing=false;
        function paintTubeSvg(hex){return `<svg viewBox="0 0 90 180" aria-hidden="true"><path d="M21 20V5h48v15" fill="none" stroke="#a1998b" stroke-width="4"/><path d="M11 20h68l-6 43H17z" fill="#625e59"/><path d="M16 53h58v96q-2 10-14 11H30q-12-1-14-11z" fill="#fff"/><path d="M19 69h52v72q-3 9-13 9H32q-10 0-13-9z" fill="${hex}"/><path d="M25 21h40l-3 35H28z" fill="#514e49"/><path d="M28 159h34v15H28z" fill="#413d36"/><path d="M20 145q2 13 16 13h18q14 0 16-13" fill="none" stroke="#fff" stroke-width="6"/></svg>`}
        function paintSplashSvg(hex){return `<svg viewBox="0 0 90 75" aria-hidden="true"><path d="M17 35Q8 22 28 21Q30 8 42 16Q54 7 61 22Q78 22 70 37Q86 49 67 52Q67 69 51 60Q35 72 27 56Q10 59 17 45Q5 42 17 35Z" fill="${hex}"/></svg>`}
        function startMatchPaint(){
            clearTimeout(paintAdvanceTimer);document.querySelector('.paint-success-pop')?.remove();paintSetIndex=0;paintScore=0;paintSelected=null;paintFinishing=false;
            const used=new Set();paintSets=[];
            while(paintSets.length<5){const set=colourShuffle(colourItems).slice(0,6),key=set.map(c=>c.en).sort().join('|');if(!used.has(key)){used.add(key);paintSets.push(set)}}
            showScreen('match-paint-screen');updateColourLanguage();renderPaintSet();
        }
        function renderPaintSet(){
            paintSelected=null;paintFinishing=false;
            const colours=paintSets[paintSetIndex];paintTargets=colourShuffle(colours);
            do{paintArrangement=colourShuffle(paintTargets)}while(paintArrangement.some((c,i)=>c===paintTargets[i]));
            const board=document.getElementById('match-paint-board');board.innerHTML='';
            document.getElementById('match-paint-feedback').textContent='';
            for(let i=0;i<6;i++){
                const pair=document.createElement('div');pair.className='paint-pair';
                const tube=document.createElement('button');tube.type='button';tube.className='paint-tube';tube.dataset.position=i;
                tube.addEventListener('pointerdown',paintPointerDown);
                tube.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();paintSelectTube(i)}});
                const target=document.createElement('div');target.className='paint-target';target.dataset.paint=paintTargets[i].en;
                target.setAttribute('aria-label',`${colourName(paintTargets[i])} colour`);target.innerHTML=paintSplashSvg(paintTargets[i].hex);
                pair.append(tube,target);board.appendChild(pair);
            }
            updatePaintBoard();
        }
        function updatePaintBoard(){
            const tubes=document.querySelectorAll('#match-paint-board .paint-tube');
            const targets=document.querySelectorAll('#match-paint-board .paint-target');
            const matched=paintArrangement.filter((c,i)=>c===paintTargets[i]).length;
            tubes.forEach((tube,i)=>{const c=paintArrangement[i];tube.innerHTML=paintTubeSvg(c.hex);tube.setAttribute('aria-label',`${colourName(c)} paint tube`);tube.classList.toggle('matched',c===paintTargets[i]);tube.classList.toggle('selected',paintSelected===i)});
            targets.forEach((target,i)=>target.classList.toggle('matched',paintArrangement[i]===paintTargets[i]));
            document.getElementById('match-paint-progress').textContent=`Set ${paintSetIndex+1} / 5 · ⭐ ${Math.round((paintSetIndex*6+matched)*100/30)}`;
            if(matched===6&&!paintFinishing){
                paintFinishing=true;paintScore=Math.round((paintSetIndex+1)*100/5);playCorrectSound();
                document.getElementById('match-paint-feedback').textContent=currentGlobalLang==='ms'?'Bagus! Semua warna betul! 🌟':'Great! All colours match! 🌟';
                const pop=document.createElement('div');pop.className='paint-success-pop';pop.setAttribute('role','status');pop.innerHTML='<span>Correct! 🌟</span>';document.body.appendChild(pop);speakText123('Correct',.8);
                paintAdvanceTimer=setTimeout(()=>{pop.remove();if(!document.getElementById('match-paint-screen').classList.contains('active'))return;paintSetIndex++;if(paintSetIndex<5)renderPaintSet();else{if(window.saveScoreToFirebase)window.saveScoreToFirebase('Match the Paint',100);alert(currentGlobalLang==='ms'?'Tahniah! Semua cat berjaya disusun! 🎉':'Great job! All paint tubes are in order! 🎉');openColourMenu()}},1000);
            }
        }
        function swapPaintTubes(from,to){
            if(paintFinishing||from===to||from<0||to<0)return;
            [paintArrangement[from],paintArrangement[to]]=[paintArrangement[to],paintArrangement[from]];
            paintSelected=null;playClickSound();
            document.getElementById('match-paint-feedback').textContent='';updatePaintBoard();
        }
        function paintSelectTube(index){
            if(paintFinishing)return;
            if(paintSelected===null)paintSelected=index;
            else if(paintSelected===index)paintSelected=null;
            else{swapPaintTubes(paintSelected,index);return}
            updatePaintBoard();
        }
        function paintPointerDown(e){
            if(paintFinishing)return;
            e.preventDefault();const source=e.currentTarget,from=Number(source.dataset.position),startX=e.clientX,startY=e.clientY;
            const ghost=source.cloneNode(true);ghost.className='paint-drag-ghost';document.body.appendChild(ghost);
            const move=ev=>{ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';const under=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('#match-paint-board .paint-tube');document.querySelectorAll('#match-paint-board .paint-tube').forEach(t=>t.classList.toggle('over',t===under&&t!==source))};
            const clean=()=>{source.removeEventListener('pointermove',move);source.removeEventListener('pointerup',end);source.removeEventListener('pointercancel',cancel);ghost.remove();document.querySelectorAll('#match-paint-board .paint-tube').forEach(t=>t.classList.remove('over'))};
            const end=ev=>{const under=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('#match-paint-board .paint-tube'),to=under?Number(under.dataset.position):-1;clean();if(to>=0&&to!==from)swapPaintTubes(from,to);else if(Math.hypot(ev.clientX-startX,ev.clientY-startY)<12)paintSelectTube(from)};
            const cancel=()=>clean();source.setPointerCapture(e.pointerId);source.addEventListener('pointermove',move);source.addEventListener('pointerup',end);source.addEventListener('pointercancel',cancel);move(e);
        }

        let learnColourIndex=0;
        function startLearnColour(){learnColourIndex=0;showScreen('learn-colour-screen');updateColourLanguage();renderLearnColour();speakLearnColour()}
        function renderLearnColour(){const c=colourItems[learnColourIndex];document.getElementById('learn-colour-swatch').style.background=c.hex;document.getElementById('learn-colour-name').innerText=colourName(c);document.getElementById('learn-colour-progress').innerText=(currentGlobalLang==='ms'?'Warna ':'Colour ')+(learnColourIndex+1)+' / '+colourItems.length}
        function speakLearnColour(){speakColourText(colourName(colourItems[learnColourIndex]))}
        function prevLearnColour(){learnColourIndex=(learnColourIndex-1+colourItems.length)%colourItems.length;renderLearnColour();speakLearnColour()}
        function nextLearnColour(){learnColourIndex=(learnColourIndex+1)%colourItems.length;renderLearnColour();speakLearnColour()}

        let popOrder=[],popIndex=0,popScore=0,popLocked=false;
        function startPopBalloon(){popOrder=colourShuffle(colourItems);popIndex=0;popScore=0;document.getElementById('pop-balloon-score').innerText='0';showScreen('pop-balloon-screen');updateColourLanguage();renderPopBalloon();setTimeout(speakPopBalloonQuestion,180)}
        function popQuestionText(c){return currentGlobalLang==='ms'?`Pecahkan belon berwarna ${c.ms}!`:`Pop the ${c.en.toLowerCase()} balloon!`}
        function renderPopBalloon(){if(!popOrder.length)return;popLocked=false;const target=popOrder[popIndex];const targetCount=3+Math.floor(Math.random()*2);document.getElementById('pop-balloon-progress').innerText=(currentGlobalLang==='ms'?'Soalan ':'Question ')+(popIndex+1)+' / '+popOrder.length;document.getElementById('pop-balloon-question').innerText=popQuestionText(target);const distractorPool=colourItems.filter(c=>c!==target);const choices=Array(targetCount).fill(target);while(choices.length<20){choices.push(distractorPool[Math.floor(Math.random()*distractorPool.length)])}const shuffled=colourShuffle(choices);const field=document.getElementById('balloon-field');field.dataset.remaining=String(targetCount);field.innerHTML='';shuffled.forEach(c=>{const b=document.createElement('button');b.className='colour-balloon';b.style.background=c.hex;b.style.color=c.hex;b.setAttribute('aria-label',colourName(c));b.onclick=()=>answerPopBalloon(b,c,target);field.appendChild(b)})}
        function speakPopBalloonQuestion(){if(popOrder.length)speakColourText(popQuestionText(popOrder[popIndex]))}
        function answerPopBalloon(btn,c,target){if(popLocked||btn.classList.contains('popped'))return;if(c===target){btn.classList.add('popped');playCorrectSound();popScore+=10;document.getElementById('pop-balloon-score').innerText=popScore;const field=document.getElementById('balloon-field');const remaining=Math.max(0,(parseInt(field.dataset.remaining||'1',10)-1));field.dataset.remaining=String(remaining);if(remaining===0){popLocked=true;setTimeout(()=>{popIndex++;if(popIndex<popOrder.length){renderPopBalloon();speakPopBalloonQuestion()}else{if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Pecahkan Belon':'Pop the Balloon',popScore);alert(currentGlobalLang==='ms'?'Tahniah! Semua belon berjaya dipecahkan! 🎉':'Great job! You popped all the correct balloons! 🎉');openColourMenu()}},500)}}else{playWrongSound();btn.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:220})}}

        let matchColourSets=[],matchColourSetIndex=0,matchColourScore=0,matchDone=new Set();
        let activeDragColour=null,isDraggingColour=false,dragColourX=0,dragColourY=0,completedColourLines=[];
        let colourMatchEventsBound=false;

        function startMatchColour(){
            matchColourSets=[];
            const shuffled=colourShuffle(colourItems);
            for(let i=0;i+3<shuffled.length;i+=4) matchColourSets.push(shuffled.slice(i,i+4));
            matchColourSetIndex=0; matchColourScore=0; matchDone=new Set(); completedColourLines=[];
            showScreen('match-colour-screen'); updateColourLanguage();
            initMatchColourEvents(); renderMatchColourSet();
        }

        function initMatchColourEvents(){
            const wrapper=document.getElementById('colour-match-wrapper');
            if(!wrapper || colourMatchEventsBound) return;
            wrapper.addEventListener('pointerdown',handleColourPointerDown,{passive:false});
            wrapper.addEventListener('pointermove',handleColourPointerMove);
            wrapper.addEventListener('pointerup',handleColourPointerUp);
            wrapper.addEventListener('pointercancel',handleColourPointerUp);
            colourMatchEventsBound=true;
            window.addEventListener('resize',resizeColourCanvas);
        }

        function renderMatchColourSet(){
            if(!matchColourSets.length)return;
            matchDone=new Set(); completedColourLines=[]; activeDragColour=null; isDraggingColour=false;
            document.getElementById('match-colour-progress').innerText='Set '+(matchColourSetIndex+1)+' / '+matchColourSets.length;
            document.getElementById('match-colour-score').innerText=matchColourScore;
            const set=matchColourSets[matchColourSetIndex],left=document.getElementById('colour-match-left'),right=document.getElementById('colour-match-right');
            left.innerHTML=''; right.innerHTML='';

            colourShuffle(set).forEach(c=>{
                const div=document.createElement('div');
                div.className='match-item colour-word-item';
                div.dataset.key=c.en; div.dataset.side='left';
                div.innerHTML=`<span class="match-colour-name">${colourName(c)}</span><button type="button" class="match-colour-audio-btn" aria-label="Listen">🔊</button>`;
                const audio=div.querySelector('.match-colour-audio-btn');
                bindMatchingAudio(audio,()=>speakColourText(colourName(c)));
                left.appendChild(div);
            });

            colourShuffle(set).forEach(c=>{
                const div=document.createElement('div');
                div.className='match-item colour-swatch-item';
                div.dataset.key=c.en; div.dataset.side='right';
                div.innerHTML=`<svg class="match-colour-paint-can" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs><linearGradient id="metal-${c.en}" x1="0" x2="1"><stop stop-color="#777f8b"/><stop offset=".18" stop-color="#f8fbfc"/><stop offset=".48" stop-color="#a7aeb8"/><stop offset=".72" stop-color="#fff"/><stop offset="1" stop-color="#66707c"/></linearGradient><linearGradient id="paint-${c.en}" x1="0" y1="0" x2=".25" y2="1"><stop stop-color="#fff" stop-opacity=".5"/><stop offset=".3" stop-color="${c.hex}"/><stop offset="1" stop-color="${c.hex}"/></linearGradient></defs>
                    <ellipse cx="75" cy="132" rx="51" ry="7" fill="#192338" opacity=".2"/>
                    <path d="M26 35 Q75 21 124 35 L116 120 Q75 135 34 120Z" fill="url(#metal-${c.en})" stroke="#535a64" stroke-width="2"/>
                    <path d="M34 84 Q75 94 116 84 M34 116 Q75 127 116 116" fill="none" stroke="#626b77" opacity=".65" stroke-width="2"/>
                    <path d="M30 48 C22 87 37 115 60 119 M120 48 C128 87 113 115 90 119" fill="none" stroke="#504b43" stroke-width="5" stroke-linecap="round"/>
                    <path d="M30 48 C22 87 37 115 60 119 M120 48 C128 87 113 115 90 119" fill="none" stroke="#e8e6df" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="29" cy="49" r="5" fill="#929aa1" stroke="#3c434a" stroke-width="2"/><circle cx="121" cy="49" r="5" fill="#929aa1" stroke="#3c434a" stroke-width="2"/>
                    <path d="M58 112 Q75 116 92 112 L94 122 Q75 128 56 122Z" fill="#d59446" stroke="#8a512d" stroke-width="2"/>
                    <path d="M25 36 Q75 12 125 36 L121 57 Q118 65 113 57 L109 55 L107 74 Q104 82 99 75 L94 55 Q90 47 86 54 L84 67 Q81 76 76 68 L74 53 Q70 45 65 54 L63 61 Q60 71 55 63 L51 49 Q46 44 42 52 L39 66 Q35 76 30 68Z" fill="url(#paint-${c.en})" stroke="${c.hex}" stroke-width="2"/>
                    <ellipse cx="75" cy="35" rx="50" ry="15" fill="${c.hex}" stroke="#3d4751" stroke-width="3"/><ellipse cx="75" cy="34" rx="40" ry="9" fill="#151d2a" opacity=".55"/><path d="M39 31 Q75 16 111 31" fill="none" stroke="white" opacity=".55" stroke-width="3" stroke-linecap="round"/>
                    <ellipse cx="20" cy="127" rx="8" ry="3" fill="${c.hex}"/><ellipse cx="129" cy="132" rx="7" ry="3" fill="${c.hex}"/>
                </svg>`;
                right.appendChild(div);
            });
            setTimeout(resizeColourCanvas,60);
        }

        function resizeColourCanvas(){
            const canvas=document.getElementById('colour-match-canvas'),wrapper=document.getElementById('colour-match-wrapper');
            if(canvas&&wrapper){canvas.width=wrapper.clientWidth;canvas.height=wrapper.clientHeight;redrawColourCanvas();}
        }

        function handleColourPointerDown(e){
            if(e.target.closest('.match-colour-audio-btn'))return;
            const target=matchItemAtPointer(e,document.getElementById('colour-match-wrapper'),'.match-item[data-side]');
            if(!target || target.classList.contains('matched') || !target.dataset.side) return;
            beginMatchTouch(e);
            playClickSound(); activeDragColour=target; isDraggingColour=true; target.classList.add('selected');
            const r=document.getElementById('colour-match-wrapper').getBoundingClientRect();
            dragColourX=e.clientX-r.left; dragColourY=e.clientY-r.top; redrawColourCanvas();
        }
        function handleColourPointerMove(e){
            if(!isDraggingColour||!activeDragColour)return; e.preventDefault();
            const r=document.getElementById('colour-match-wrapper').getBoundingClientRect();
            dragColourX=e.clientX-r.left; dragColourY=e.clientY-r.top; redrawColourCanvas();
        }
        function handleColourPointerUp(e){
            if(!isDraggingColour||!activeDragColour)return;
            const target=matchItemAtPointer(e,document.getElementById('colour-match-wrapper'),'.match-item[data-side]',true);
            activeDragColour.classList.remove('selected');
            if(target && target.dataset.side!==activeDragColour.dataset.side && !target.classList.contains('matched')){
                if(activeDragColour.dataset.key===target.dataset.key){
                    playCorrectSound(); matchColourScore+=10; document.getElementById('match-colour-score').innerText=matchColourScore;
                    activeDragColour.classList.add('matched'); target.classList.add('matched'); matchDone.add(activeDragColour.dataset.key);
                    completedColourLines.push({from:activeDragColour.dataset.side==='left'?activeDragColour:target,to:activeDragColour.dataset.side==='right'?activeDragColour:target});
                    if(matchDone.size===matchColourSets[matchColourSetIndex].length){
                        setTimeout(()=>{matchColourSetIndex++;if(matchColourSetIndex<matchColourSets.length){renderMatchColourSet()}else{if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Suaikan Warna':'Match the Colour',100);alert(currentGlobalLang==='ms'?'Tahniah! Semua warna berjaya disuaikan! 🎉':'Great job! All colours matched! 🎉');openColourMenu()}},550);
                    }
                }else{
                    playWrongSound(); target.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:220});
                }
            }
            activeDragColour=null; isDraggingColour=false; redrawColourCanvas();
        }
        function redrawColourCanvas(){
            const canvas=document.getElementById('colour-match-canvas'); if(!canvas)return;
            const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
            syncMatchingEyelets(document.getElementById('colour-match-wrapper'));
            completedColourLines.forEach(line=>drawMatchingRope(ctx,getItemCenter(line.from),getItemCenter(line.to),line.from,line.to));
            if(isDraggingColour&&activeDragColour)drawMatchingRope(ctx,getItemCenter(activeDragColour),{x:dragColourX,y:dragColourY},activeDragColour,null);
        }

        let findColourOrder=[],findColourIndex=0,findColourScore=0,findColourLocked=false;
        function startFindColour(){findColourOrder=colourShuffle(colourItems);findColourIndex=0;findColourScore=0;document.getElementById('find-colour-score').innerText='0';showScreen('find-colour-screen');updateColourLanguage();renderFindColour();setTimeout(speakFindColourQuestion,180)}
        function findColourQuestionText(c){return currentGlobalLang==='ms'?`Yang mana satu warna ${c.ms}?`:`Which one is ${c.en.toLowerCase()}?`}
        function renderFindColour(){if(!findColourOrder.length)return;findColourLocked=false;const target=findColourOrder[findColourIndex];document.getElementById('find-colour-progress').innerText=(currentGlobalLang==='ms'?'Soalan ':'Question ')+(findColourIndex+1)+' / '+findColourOrder.length;document.getElementById('find-colour-question').innerText=findColourQuestionText(target);const choices=colourShuffle([target,...colourShuffle(colourItems.filter(c=>c!==target)).slice(0,3)]),box=document.getElementById('find-colour-options');box.innerHTML='';choices.forEach(c=>{const b=document.createElement('button');b.className='find-colour-option';b.innerHTML=`<div class="find-colour-chip" style="background:${c.hex}"></div>`;b.onclick=()=>answerFindColour(b,c,target);box.appendChild(b)})}
        function speakFindColourQuestion(){if(findColourOrder.length)speakColourText(findColourQuestionText(findColourOrder[findColourIndex]))}
        function answerFindColour(btn,c,target){if(findColourLocked)return;if(c===target){findColourLocked=true;btn.classList.add('correct');playCorrectSound();findColourScore+=10;document.getElementById('find-colour-score').innerText=findColourScore;setTimeout(()=>{findColourIndex++;if(findColourIndex<findColourOrder.length){renderFindColour();speakFindColourQuestion()}else{if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Cari Warna':'Find the Colour',100);alert(currentGlobalLang==='ms'?'Tahniah! Semua warna dijawab dengan betul! 🎉':'Great job! You found all the colours! 🎉');openColourMenu()}},650)}else{btn.classList.add('wrong');playWrongSound();setTimeout(()=>btn.classList.remove('wrong'),450)}}




        // ===== BODY PART MODULE =====
        const bodyParts = [
            {id:'head',en:'Head',ms:'Kepala',img:'https://i.imgur.com/kgG4FVh.jpeg',descEn:'Our head is at the top of our body.',descMs:'Kepala berada di bahagian atas badan kita.'},
            {id:'hair',en:'Hair',ms:'Rambut',img:'https://i.imgur.com/Mtx26DP.jpeg',descEn:'Hair grows on our head.',descMs:'Rambut tumbuh di atas kepala kita.'},
            {id:'eyebrow',en:'Eyebrows',ms:'Kening',img:'https://i.imgur.com/1xJ6klh.jpeg',descEn:'Our eyebrows are above our eyes.',descMs:'Kening berada di atas mata kita.'},
            {id:'eye',en:'Eyes',ms:'Mata',img:'https://i.imgur.com/5g4pxMe.jpeg',descEn:'We use our eyes to see.',descMs:'Kita menggunakan mata untuk melihat.'},
            {id:'ear',en:'Ears',ms:'Telinga',img:'https://i.imgur.com/sP5lgEN.jpeg',descEn:'We use our ears to hear.',descMs:'Kita menggunakan telinga untuk mendengar.'},
            {id:'nose',en:'Nose',ms:'Hidung',img:'https://i.imgur.com/4o1AFv1.jpeg',descEn:'We use our nose to smell.',descMs:'Kita menggunakan hidung untuk menghidu.'},
            {id:'mouth',en:'Mouth',ms:'Mulut',img:'https://i.imgur.com/x7jHyf6.jpeg',descEn:'We use our mouth to eat and speak.',descMs:'Kita menggunakan mulut untuk makan dan bercakap.'},
            {id:'tongue',en:'Tongue',ms:'Lidah',img:'https://i.imgur.com/wKq4aUc.jpeg',descEn:'Our tongue helps us taste and speak.',descMs:'Lidah membantu kita merasa dan bercakap.'},
            {id:'teeth',en:'Teeth',ms:'Gigi',img:'https://i.imgur.com/3Kn9BQl.jpeg',descEn:'Our teeth help us bite and chew food.',descMs:'Gigi membantu kita menggigit dan mengunyah makanan.'},
            {id:'neck',en:'Neck',ms:'Leher',img:'https://i.imgur.com/FMcFMrx.jpeg',descEn:'Our neck connects our head to our body.',descMs:'Leher menghubungkan kepala dengan badan.'},
            {id:'arm',en:'Arm',ms:'Lengan',img:'https://i.imgur.com/vmfg3FY.jpeg',descEn:'We use our arms to reach and carry.',descMs:'Kita menggunakan lengan untuk mencapai dan membawa.'},
            {id:'hand',en:'Hand',ms:'Tangan',img:'https://i.imgur.com/KJSiVBD.jpeg',descEn:'We use our hands to hold and touch.',descMs:'Kita menggunakan tangan untuk memegang dan menyentuh.'},
            {id:'finger',en:'Fingers',ms:'Jari',img:'https://i.imgur.com/0QIUkl8.jpeg',descEn:'Fingers help us pick up small things.',descMs:'Jari membantu kita mengambil benda kecil.'},
            {id:'stomach',en:'Stomach',ms:'Perut',img:'https://i.imgur.com/gSFcoAn.jpeg',descEn:'Our stomach is in the middle part of our body.',descMs:'Perut berada di bahagian tengah badan kita.'},
            {id:'knee',en:'Knee',ms:'Lutut',img:'https://i.imgur.com/XYMyu7r.jpeg',descEn:'Our knees help our legs bend.',descMs:'Lutut membantu kaki kita membengkok.'},
            {id:'leg',en:'Leg',ms:'Kaki',img:'https://i.imgur.com/fRMWJlT.jpeg',descEn:'Our legs help us stand and walk.',descMs:'Kaki membantu kita berdiri dan berjalan.'}
        ];
        const bodyShuffle=a=>[...a].sort(()=>Math.random()-.5);
        function bodyText(item){return currentGlobalLang==='ms'?item.ms:item.en}
        function speakBody(text){if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=currentGlobalLang==='ms'?'ms-MY':'en-US';u.rate=.72;speechSynthesis.speak(u)}
        function updateBodyLanguage(){const ms=currentGlobalLang==='ms',set=(id,en,bm)=>{const e=document.getElementById(id);if(e)e.innerText=ms?bm:en};set('body-menu-title','Body Part Module 🧒','Modul Anggota Badan 🧒');set('body-menu-desc','Choose a body part activity!','Pilih aktiviti anggota badan!');set('body-learn-menu-text','Learn the Body Part','Belajar Anggota Badan');set('body-choose-menu-text','Choose the Body Part','Pilih Anggota Badan');set('body-label-menu-text','Label the Body Part','Label Anggota Badan');set('match-body-count-title','Match the Body Part 🧩','Padankan Anggota Badan 🧩');set('match-body-count-desc','Select how many pages/sets you want to play:','Pilih berapa halaman/set yang mahu dimainkan:');set('match-body-count-back','Back ↩️','Back ↩️');set('match-body-header-title','Match Body Part','Padankan Anggota Badan');set('match-body-page-label','Page','Halaman');set('match-body-score-label','Score','Skor');set('match-body-instruction','Drag a line from the body part name to the correct picture!','Tarik garis dari nama anggota badan ke gambar yang betul!');set('match-body-back','Back ↩️','Back ↩️');set('body-menu-back','Back to Home 🏠','Back to Home 🏠');set('learn-body-title','Learn the Body Part 🧒','Belajar Anggota Badan 🧒');set('body-learn-listen','🔊 Listen','🔊 Dengar');set('choose-body-title','Choose the Body Part 🔎','Pilih Anggota Badan 🔎');set('choose-body-listen','🔊 Listen','🔊 Dengar');set('label-body-title','Label the Body Part 🏷️','Label Anggota Badan 🏷️');set('label-body-desc','Drag each label into the correct box. You can also tap a label, then tap a box.','Seret setiap label ke kotak yang betul. Boleh juga tekan label, kemudian tekan kotak.');set('label-body-reset','Reset 🔄','Mula Semula 🔄');if(document.getElementById('learn-body-screen')?.classList.contains('active'))renderLearnBodyPart();if(document.getElementById('choose-body-screen')?.classList.contains('active')&&chooseBodyOrder.length)renderChooseBody();if(document.getElementById('label-body-screen')?.classList.contains('active'))renderBodyLabelBank(true);if(document.getElementById('match-body-game-screen')?.classList.contains('active')&&matchBodyGameData.length)loadMatchBodyPage()}
        function openBodyPartMenu(){window.speechSynthesis?.cancel();updateBodyLanguage();showScreen('body-part-menu-screen')}

        // MATCH THE BODY PART - follows Match the Animal format
        let matchBodyPagesCount=5,currentMatchBodyPageIdx=0,matchBodyGameData=[],matchBodyScoreCount=0;
        let activeDragBody=null,isDraggingBody=false,dragBodyX=0,dragBodyY=0,completedBodyLines=[],matchedBodyPairsInPage=0,matchBodyEventsReady=false;
        function openMatchBodyCountScreen(){updateBodyLanguage();showScreen('match-body-count-screen')}
        function startMatchBody(setCount){
            matchBodyPagesCount=setCount;currentMatchBodyPageIdx=0;matchBodyScoreCount=0;matchBodyGameData=[];
            for(let i=0;i<setCount;i++)matchBodyGameData.push(bodyShuffle(bodyParts).slice(0,4));
            updateBodyLanguage();showScreen('match-body-game-screen');setTimeout(()=>{initMatchBodyEvents();loadMatchBodyPage()},80);
        }
        function resizeBodyCanvas(){const c=document.getElementById('match-body-canvas'),w=document.getElementById('match-body-wrapper');if(c&&w){c.width=w.clientWidth;c.height=w.clientHeight;redrawBodyCanvas()}}
        window.addEventListener('resize',resizeBodyCanvas);
        function initMatchBodyEvents(){const w=document.getElementById('match-body-wrapper');if(!w||matchBodyEventsReady)return;matchBodyEventsReady=true;w.addEventListener('pointerdown',handleBodyPointerDown,{passive:false});w.addEventListener('pointermove',handleBodyPointerMove);w.addEventListener('pointerup',handleBodyPointerUp);w.addEventListener('pointercancel',handleBodyPointerUp);resizeBodyCanvas()}
        function loadMatchBodyPage(){
            if(!matchBodyGameData.length)return;
            matchedBodyPairsInPage=0;completedBodyLines=[];activeDragBody=null;isDraggingBody=false;
            document.getElementById('match-body-current-page').innerText=currentMatchBodyPageIdx+1;
            document.getElementById('match-body-total-pages').innerText=matchBodyPagesCount;
            document.getElementById('match-body-score').innerText=matchBodyScoreCount;
            document.getElementById('match-body-next-btn').style.display='none';
            const items=matchBodyGameData[currentMatchBodyPageIdx],left=document.getElementById('match-body-left-column'),right=document.getElementById('match-body-right-column');left.innerHTML='';right.innerHTML='';
            bodyShuffle(items).forEach(item=>{const d=document.createElement('div');d.className='match-item';const name=bodyText(item);d.innerHTML=`<span class="match-body-name">${name}</span><button type="button" class="match-body-audio-btn" aria-label="Listen to ${name}" title="Listen / Dengar">🔊</button>`;d.dataset.id=item.id;d.dataset.side='left';const b=d.querySelector('.match-body-audio-btn');bindMatchingAudio(b,()=>speakBody(bodyText(item)));left.appendChild(d)});
            bodyShuffle(items).forEach(item=>{const d=document.createElement('div');d.className='match-item';d.innerHTML=`<img src="${item.img}" alt="${bodyText(item)}">`;d.dataset.id=item.id;d.dataset.side='right';right.appendChild(d)});
            setTimeout(resizeBodyCanvas,50);
        }
        function handleBodyPointerDown(e){if(e.target.closest('.match-body-audio-btn'))return;const target=matchItemAtPointer(e,document.getElementById('match-body-wrapper'),'.match-item[data-side]');if(!target||target.classList.contains('matched')||!target.dataset.side)return;beginMatchTouch(e);playClickSound();activeDragBody=target;isDraggingBody=true;target.classList.add('selected');const r=document.getElementById('match-body-wrapper').getBoundingClientRect();dragBodyX=e.clientX-r.left;dragBodyY=e.clientY-r.top;redrawBodyCanvas()}
        function handleBodyPointerMove(e){if(!isDraggingBody||!activeDragBody)return;e.preventDefault();const r=document.getElementById('match-body-wrapper').getBoundingClientRect();dragBodyX=e.clientX-r.left;dragBodyY=e.clientY-r.top;redrawBodyCanvas()}
        function handleBodyPointerUp(e){
            if(!isDraggingBody||!activeDragBody)return;const target=matchItemAtPointer(e,document.getElementById('match-body-wrapper'),'.match-item[data-side]',true);activeDragBody.classList.remove('selected');
            if(target&&target.dataset.side!==activeDragBody.dataset.side&&!target.classList.contains('matched')){
                if(activeDragBody.dataset.id===target.dataset.id){playCorrectSound();matchBodyScoreCount+=10;document.getElementById('match-body-score').innerText=matchBodyScoreCount;activeDragBody.classList.add('matched');target.classList.add('matched');completedBodyLines.push({from:activeDragBody.dataset.side==='left'?activeDragBody:target,to:activeDragBody.dataset.side==='right'?activeDragBody:target});matchedBodyPairsInPage++;
                    if(matchedBodyPairsInPage===4){if(currentMatchBodyPageIdx<matchBodyPagesCount-1)setTimeout(nextMatchBodyPage,700);else setTimeout(()=>{if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Padankan Anggota Badan':'Match Body Part',100);alert(currentGlobalLang==='ms'?'🌟 Hebat! Anda telah melengkapkan semua set padanan anggota badan!':'🌟 Amazing! You completed all body part match sets!');openBodyPartMenu()},500)}}
                else{playWrongSound();const img=target.querySelector('img');if(img){img.style.borderColor='#FF6B6B';setTimeout(()=>img.style.borderColor='',400)}}
            }
            activeDragBody=null;isDraggingBody=false;redrawBodyCanvas();
        }
        function getBodyItemCenter(el){const wrapper=document.getElementById('match-body-wrapper').getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-wrapper.left+r.width/2,y:r.top-wrapper.top+r.height/2}}
        function redrawBodyCanvas(){const c=document.getElementById('match-body-canvas');if(!c)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);syncMatchingEyelets(document.getElementById('match-body-wrapper'));completedBodyLines.forEach(line=>drawMatchingRope(ctx,getBodyItemCenter(line.from),getBodyItemCenter(line.to),line.from,line.to));if(isDraggingBody&&activeDragBody)drawMatchingRope(ctx,getBodyItemCenter(activeDragBody),{x:dragBodyX,y:dragBodyY},activeDragBody,null)}
        function nextMatchBodyPage(){currentMatchBodyPageIdx++;loadMatchBodyPage()}

        let learnBodyIndex=0;function startLearnBodyPart(){learnBodyIndex=0;showScreen('learn-body-screen');updateBodyLanguage();renderLearnBodyPart();setTimeout(speakCurrentBodyPart,180)}
        function renderLearnBodyPart(){const p=bodyParts[learnBodyIndex],ms=currentGlobalLang==='ms';document.getElementById('learn-body-progress').innerText=`${ms?'Anggota Badan':'Body Part'} ${learnBodyIndex+1} / ${bodyParts.length}`;document.getElementById('body-learn-visual').innerHTML=`<img src="${p.img}" alt="${bodyText(p)}">`;document.getElementById('body-learn-name').innerText=bodyText(p);document.getElementById('body-learn-desc').innerText=ms?p.descMs:p.descEn}
        function speakCurrentBodyPart(){const p=bodyParts[learnBodyIndex];speakBody(`${bodyText(p)}. ${currentGlobalLang==='ms'?p.descMs:p.descEn}`)}
        function nextBodyPart(){learnBodyIndex=(learnBodyIndex+1)%bodyParts.length;renderLearnBodyPart();speakCurrentBodyPart()}function prevBodyPart(){learnBodyIndex=(learnBodyIndex-1+bodyParts.length)%bodyParts.length;renderLearnBodyPart();speakCurrentBodyPart()}
        let chooseBodyOrder=[],chooseBodyIndex=0,chooseBodyScore=0,chooseBodyLocked=false;
        function startChooseBodyPart(){chooseBodyOrder=bodyShuffle(bodyParts).slice(0,10);chooseBodyIndex=0;chooseBodyScore=0;document.getElementById('choose-body-score').innerText='0';showScreen('choose-body-screen');updateBodyLanguage();renderChooseBody();setTimeout(speakChooseBodyQuestion,180)}
        function chooseBodyQuestionText(p){return currentGlobalLang==='ms'?`Yang mana satu ${p.ms.toLowerCase()}?`:`Which one is the ${p.en.toLowerCase()}?`}
        function renderChooseBody(){chooseBodyLocked=false;const target=chooseBodyOrder[chooseBodyIndex];document.getElementById('choose-body-progress').innerText=`${currentGlobalLang==='ms'?'Soalan':'Question'} ${chooseBodyIndex+1} / ${chooseBodyOrder.length}`;document.getElementById('choose-body-question').innerText=chooseBodyQuestionText(target);const choices=bodyShuffle([target,...bodyShuffle(bodyParts.filter(x=>x.id!==target.id)).slice(0,3)]);const box=document.getElementById('choose-body-options');box.innerHTML='';choices.forEach(p=>{const b=document.createElement('button');b.className='body-img-card';b.innerHTML=`<img class="body-choice-img" src="${p.img}" alt="${bodyText(p)}">`;b.onclick=()=>answerChooseBody(b,p,target);box.appendChild(b)})}
        function speakChooseBodyQuestion(){if(chooseBodyOrder.length)speakBody(chooseBodyQuestionText(chooseBodyOrder[chooseBodyIndex]))}
        function showChooseBodyCorrectPopup(target){
            const oldPopup=document.getElementById('choose-body-correct-popup');
            if(oldPopup)oldPopup.remove();
            const popup=document.createElement('div');
            popup.id='choose-body-correct-popup';
            popup.className='find-animal-correct-popup';
            const partName=bodyText(target);
            popup.innerHTML=`
                <div class="find-animal-popup-card">
                    <div class="find-animal-popup-title">${currentGlobalLang==='ms'?'Jawapan betul':'Correct answer'}</div>
                    <img src="${target.img}" alt="${partName}">
                    <div class="find-animal-popup-name">${partName}</div>
                </div>`;
            document.body.appendChild(popup);
            requestAnimationFrame(()=>popup.classList.add('show'));
            setTimeout(()=>{
                popup.classList.remove('show');
                setTimeout(()=>popup.remove(),220);
            },2800);
        }

        function finishOrAdvanceChooseBody(delay=0){
            setTimeout(()=>{
                if(chooseBodyIndex<chooseBodyOrder.length-1){
                    chooseBodyIndex++;
                    renderChooseBody();
                    speakChooseBodyQuestion();
                    return;
                }

                const finalPercent=Math.round((chooseBodyScore/(chooseBodyOrder.length*10))*100);
                try{
                    if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Pilih Anggota Badan':'Choose the Body Part',finalPercent);
                }catch(err){
                    console.warn('Unable to save Choose Body Part score:',err);
                }

                alert(currentGlobalLang==='ms'?`🎉 Kuiz tamat! Skor anda: ${finalPercent}%`:`🎉 Quiz finished! Score: ${finalPercent}%`);

                // Pastikan selepas pengguna tekan Close/OK pada mesej tamat,
                // paparan kembali ke menu Body Part.
                setTimeout(()=>openBodyPartMenu(),0);
            },delay);
        }

        function answerChooseBody(btn,p,target){
            if(chooseBodyLocked)return;
            chooseBodyLocked=true;
            const cards=[...document.querySelectorAll('#choose-body-screen .body-img-card')];
            cards.forEach(c=>c.style.pointerEvents='none');

            if(p.id===target.id){
                playCorrectSound();
                btn.style.borderColor='#4CAF50';
                btn.style.boxShadow='0 0 0 5px rgba(76,175,80,.20), 0 10px 24px rgba(0,0,0,.16)';
                chooseBodyScore+=10;
                document.getElementById('choose-body-score').innerText=chooseBodyScore;
                finishOrAdvanceChooseBody(650);
            }else{
                playWrongSound();
                btn.style.borderColor='#E53935';
                btn.style.boxShadow='0 0 0 5px rgba(229,57,53,.18), 0 10px 24px rgba(0,0,0,.16)';

                // Sama seperti Find the Animal: tandakan jawapan sebenar hijau.
                cards.forEach(c=>{
                    const img=c.querySelector('img');
                    if(img && img.src===target.img)c.style.borderColor='#4CAF50';
                });

                // Sama seperti Find the Animal: paparkan gambar jawapan betul ±3 saat,
                // kemudian terus ke soalan seterusnya.
                showChooseBodyCorrectPopup(target);
                finishOrAdvanceChooseBody(3000);
            }
        }
        const labelBodyIds=['head','eye','ear','nose','mouth','arm','hand','leg','knee','foot'];let selectedBodyLabel=null,labelBodyDone=new Set();
        function startLabelBodyPart(){labelBodyDone=new Set();selectedBodyLabel=null;document.getElementById('label-body-score').innerText='0';document.querySelectorAll('#label-body-screen .body-drop').forEach(z=>{z.innerHTML='';z.classList.remove('correct','over')});showScreen('label-body-screen');updateBodyLanguage();renderBodyLabelBank(false);setupBodyDropZones()}
        function renderBodyLabelBank(preserve=false){const bank=document.getElementById('body-label-bank');if(!bank)return;bank.innerHTML='';bodyShuffle(labelBodyIds).forEach(id=>{if(preserve&&labelBodyDone.has(id))return;const p=bodyParts.find(x=>x.id===id),d=document.createElement('div');d.className='body-drag-label';d.draggable=true;d.dataset.part=id;d.innerText=bodyText(p);d.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',id));d.onclick=()=>{document.querySelectorAll('.body-drag-label').forEach(x=>x.classList.remove('selected'));selectedBodyLabel=id;d.classList.add('selected')};bank.appendChild(d)})}
        function setupBodyDropZones(){document.querySelectorAll('#label-body-screen .body-drop').forEach(z=>{z.ondragover=e=>{e.preventDefault();z.classList.add('over')};z.ondragleave=()=>z.classList.remove('over');z.ondrop=e=>{e.preventDefault();z.classList.remove('over');placeBodyLabel(e.dataTransfer.getData('text/plain'),z)};z.onclick=()=>{if(selectedBodyLabel)placeBodyLabel(selectedBodyLabel,z)}})}
        function placeBodyLabel(id,zone){if(!id||labelBodyDone.has(id))return;if(zone.dataset.part===id){playCorrectSound();labelBodyDone.add(id);const p=bodyParts.find(x=>x.id===id);zone.innerText=bodyText(p);zone.classList.add('correct');const el=document.querySelector(`#body-label-bank .body-drag-label[data-part="${id}"]`);if(el)el.remove();selectedBodyLabel=null;document.getElementById('label-body-score').innerText=labelBodyDone.size*10;if(labelBodyDone.size===labelBodyIds.length){if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Label Anggota Badan':'Label the Body Part',100);setTimeout(()=>alert(currentGlobalLang==='ms'?'Tahniah! Semua label betul! 🎉':'Excellent! All labels are correct! 🎉'),250)}}else{playWrongSound();zone.classList.add('over');setTimeout(()=>zone.classList.remove('over'),450)}}

        const lessonData = {
            numeric: {
                title: "Number / Nombor",
                desc: "Let's count numbers from 1 to 10 and beyond! Counting helps us understand quantity and math basics. / Mari mengira nombor dari 1 hingga 10 dan seterusnya!",
                examples: "<ul><li>Numbers / Nombor: <i>1 (One / Satu), 2 (Two / Dua), 3 (Three / Tiga)...</i></li></ul>"
            },
            colour: {
                title: "Colour / Warna",
                desc: "Explore vibrant colours all around us! Colors make our world beautiful and full of life. / Terokai warna-warna ceria di sekeliling kita.",
                examples: "<ul><li>Primary colours / Warna asas: <i>Red/Merah, Blue/Biru, Yellow/Kuning</i></li><li>Others / Lain-lain: <i>Green/Hijau, Pink/Merah Jambunya, Purple/Ungu</i></li></ul>"
            },
            bodyPart: {
                title: "Body Part / Anggota Badan",
                desc: "Learn about the different parts of our body and what each part helps us do every day. / Kenali bahagian anggota badan kita.",
                examples: "<ul><li>Face / Muka: <i>Eyes/Mata, Nose/Hidung, Mouth/Mulut, Ears/Telinga</i></li><li>Limbs / Tangan & Kaki: <i>Hands/Tangan, Fingers/Jari, Legs/Kaki</i></li></ul>"
            },
            shape: {
                title: "Shape / Bentuk",
                desc: "Identify fundamental geometric shapes like circles, squares, triangles, and rectangles in everyday objects. / Kenal bentuk geometri asas.",
                examples: "<ul><li>Shapes / Bentuk: <i>Circle/Bulat, Square/Segi Empat Sama, Triangle/Segi Tiga, Rectangle/Segi Empat Tepat</i></li></ul>"
            },
            transport: {
                title: "Transport / Pengangkutan",
                desc: "Learn about different vehicles that help us travel on land, water, and up in the sky. / Kenali kenderaan di darat, air, dan udara.",
                examples: "<ul><li>Land / Darat: <i>Car/Kereta, Bus/Bas, Bicycle/Basikal, Train/Keretapi</i></li><li>Air/Water / Udara/Air: <i>Aeroplane/Kapal Terbang, Ship/Kapal</i></li></ul>"
            }
        };

        function openLesson(topic) {
            const data = lessonData[topic];
            if (data) {
                document.getElementById("lesson-title").innerText = data.title;
                document.getElementById("lesson-desc").innerText = data.desc;
                document.getElementById("lesson-examples").innerHTML = data.examples;
                showScreen("lesson-screen");
            }
        }

        function toggleLoginPassword() {
            const input = document.getElementById('login-password');
            if (!input) return;
            input.type = input.type === 'password' ? 'text' : 'password';
        }


        function showInstallGuide(device) {
            const ios = document.getElementById('install-ios-guide');
            const android = document.getElementById('install-android-guide');
            const iosBtn = document.getElementById('install-ios-btn');
            const androidBtn = document.getElementById('install-android-btn');
            if (ios) ios.classList.toggle('active', device === 'ios');
            if (android) android.classList.toggle('active', device === 'android');
            if (iosBtn) iosBtn.classList.toggle('active', device === 'ios');
            if (androidBtn) androidBtn.classList.toggle('active', device === 'android');
        }

        function updateInstallTutorialLanguage() {
            const ms = currentGlobalLang === 'ms';
            const text = {
                'install-title': ms ? '📲 Tambah aplikasi ini ke Skrin Utama' : '📲 Add this app to Home Screen',
                'install-desc': ms ? 'Pilih jenis peranti anda dan ikut langkah mudah di bawah.' : 'Choose your device and follow the simple steps below.',
                'ios-step-1': ms ? 'Buka pautan ini menggunakan pelayar Safari! 🌐' : 'Open this link using the Safari browser! 🌐',
                'ios-step-2': ms ? 'Tekan butang Share di bahagian bawah skrin. ↗️' : 'Tap the Share button at the bottom of the screen. ↗️',
                'ios-step-3': ms ? 'Skrol ke bawah dan pilih “Add to Home Screen”. 📱' : 'Scroll down and select “Add to Home Screen”. 📱',
                'ios-step-4': ms ? 'Tekan Add di penjuru kanan atas! 🎉' : 'Tap Add in the top right corner! 🎉',
                'android-step-1': ms ? 'Buka pautan ini menggunakan Google Chrome! 🌐 Tekan ikon Menu (tiga titik) di penjuru kanan atas. 👆' : 'Open this link using the Google Chrome browser! 🌐 Tap the Menu icon (three dots) in the top right corner. 👆',
                'android-step-2': ms ? 'Pilih “Install” atau “Create shortcut”. 🌟' : 'Select “Install” or “Create shortcut”. 🌟',
                'android-step-3': ms ? 'Pilih “Install”. 😍' : 'Select “Install”. 😍',
                'android-step-4': ms ? 'Tekan Install untuk mengesahkan. Yay! 🥳' : 'Tap Install to confirm. Yay! 🥳',
                'install-home-btn': ms ? 'Kembali ke Utama 🏠' : 'Back to Home 🏠'
            };
            Object.entries(text).forEach(([id,value]) => { const el=document.getElementById(id); if(el) el.innerText=value; });
        }

        function showScreen(screenId) {
            const screens = document.querySelectorAll('.card');
            screens.forEach(s => s.classList.remove('active'));
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                targetScreen.classList.add('active');
            }

            // Blur gambar background PALING BELAKANG hanya semasa aktiviti/latihan.
            // Menu, profile, pilihan soalan, flashcard/pelajaran dan result kekal background asal.
            const activityScreens = new Set([
                'spell-it-right-screen',
                'abc-tracing-screen',
                'complete-abc-screen',
                'bijak-suku-kata-screen',
                'bijak-suku-kata-2-screen',
                'match123-screen',
                'choo123-screen',
                'chooabc-screen',
                'column-math-screen',
                'lets-count-screen',
                'find123-screen',
                'pop-balloon-screen',
                'match-colour-screen',
                'match-paint-screen',
                'match-crayon-screen',
                'pair-socks-screen',
                'find-colour-screen',
                'match-animal-game-screen',
                'complete-animal-screen',
                'match-body-game-screen',
                'find-animal-game-screen',
                'choose-body-screen',
                'label-body-screen',
                'match-game-screen',
                'find-letter-screen',
                'quiz-screen',
                'match-shape-screen',
                'draw-shape-screen',
                'match-me-screen',
                'sort-transport-screen',
                'guess-transport-screen',
                'jobs-quiz-screen',
                'sort-food-screen'
            ]);
            document.body.classList.toggle('activity-bg-blur', activityScreens.has(screenId));
            document.body.classList.toggle('login-mode', screenId === 'login-screen');
            document.body.classList.toggle('home-mobile-bg', screenId === 'home-screen');

            closeSidebar();
        }

        function navigateTo(screenId, element) {
            if (element) {
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(i => i.classList.remove('active'));
                element.classList.add('active');
            }
            if (screenId === 'scores-screen') {
                window.loadScoreBoard();
            }
            showScreen(screenId);
        }

        // Fungsi membuka/menutup sidebar
function toggleSidebar(event) {
    if (event) event.stopPropagation(); // Elak event bertaut
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', isOpen);
    const toggle = document.getElementById('mobile-toggle-btn');
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        toggle.textContent = isOpen ? '✕' : '☰';
    }
}

// Fungsi paksa tutup sidebar
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    const toggle = document.getElementById('mobile-toggle-btn');
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        toggle.textContent = '☰';
    }
}
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSidebar();
});

// Alternatif tambahan: Boleh juga tutup sidebar apabila pengguna menekan kawasan .main-content
document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                closeSidebar();
            }
              });
        }
     });
        // ==========================================
        // KONTROL BACKGROUND MUSIC KANAK-KANAK
        // ==========================================
        let isMusicPlaying = false;
        let bgMusicIntroDone = false;   // muzik latar tunggu audio intro KIDDORA habis dulu
        let bgMusicMutedByUser = false; // hormati pilihan 🔇 pengguna
        const bgAudio = document.getElementById('bg-music-player');
        const bgToggleBtn = document.getElementById('bg-music-toggle');

        // Laraskan kelantangan audio (0.1 - 0.3 adalah yang paling sesuai untuk kanak-kanak supaya tidak mengganggu audio lain)
        if (bgAudio) {
            bgAudio.volume = 0.2;
            // Mobile browsers may pause media when the app has been in the background.
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && isMusicPlaying && bgAudio.paused) bgAudio.play().catch(() => {});
            });
            document.addEventListener('pointerdown', () => {
                if (isMusicPlaying && bgAudio.paused) bgAudio.play().catch(() => {});
            }, {passive: true});
        }

        function toggleBgMusic() {
            if (!bgAudio) return;

            if (bgAudio.paused) {
                bgAudio.play().then(() => {
                    isMusicPlaying = true;
                    bgMusicMutedByUser = false;
                    if (bgToggleBtn) {
                        bgToggleBtn.innerText = "🔊";
                        bgToggleBtn.setAttribute('aria-label', 'Turn background music off');
                        bgToggleBtn.title = 'Music ON';
                    }
                }).catch(err => {
                    console.log("Autoplay ditahan oleh pelayar:", err);
                });
            } else {
                bgAudio.pause();
                isMusicPlaying = false;
                bgMusicMutedByUser = true;
                if (bgToggleBtn) {
                    bgToggleBtn.innerText = "🔇";
                    bgToggleBtn.setAttribute('aria-label', 'Turn background music on');
                    bgToggleBtn.title = 'Music OFF';
                }
            }
        }

        // Memulakan muzik secara automatik sebaik sahaja pengguna menekan apa-apa pada skrin/app
        // (Sebab browser moden menyekat audio autoplay sebelum ada sentuhan pengguna)
        function enableAutoplayOnFirstTouch() {
            // Tunggu audio intro KIDDORA habis; startBgMusicAfterIntro() akan mulakan muzik.
            if (!bgMusicIntroDone) return;
            window.removeEventListener('click', enableAutoplayOnFirstTouch);
            window.removeEventListener('touchstart', enableAutoplayOnFirstTouch);
            if (bgAudio && bgAudio.paused && !isMusicPlaying && !bgMusicMutedByUser) {
                bgAudio.play().then(() => {
                    isMusicPlaying = true;
                    if (bgToggleBtn) {
                        bgToggleBtn.innerText = "🔊";
                        bgToggleBtn.setAttribute('aria-label', 'Turn background music off');
                        bgToggleBtn.title = 'Music ON';
                    }
                }).catch(() => {});
            }
        }

        // Dipanggil sebaik sahaja audio intro KIDDORA selesai dimainkan.
        window.startBgMusicAfterIntro = function() {
            bgMusicIntroDone = true;
            if (!bgAudio || bgMusicMutedByUser || isMusicPlaying) return;
            bgAudio.currentTime = 0;
            bgAudio.play().then(() => {
                isMusicPlaying = true;
                if (bgToggleBtn) {
                    bgToggleBtn.innerText = "🔊";
                    bgToggleBtn.setAttribute('aria-label', 'Turn background music off');
                    bgToggleBtn.title = 'Music ON';
                }
            }).catch(() => {
                // Pelayar sekat audio: mula pada sentuhan seterusnya.
                window.addEventListener('click', enableAutoplayOnFirstTouch);
                window.addEventListener('touchstart', enableAutoplayOnFirstTouch);
            });
        };

        // Log keluar / log masuk gagal: hentikan muzik, tunggu intro seterusnya.
        window.resetBgMusicForIntro = function() {
            bgMusicIntroDone = false;
            if (bgAudio) bgAudio.pause();
            isMusicPlaying = false;
        };



        // ==========================================
        // SPELL IT RIGHT - ABC MODULE
        // ==========================================
        const spellWords = [
            { word: 'SUN',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT64OmAmOyjW0j_b1QPcik5YwSX54Xqe0HFOhr63-uNjg&s=10' },
            { word: 'CAT',   image: 'https://loremflickr.com/500/500/cat' },
            { word: 'DOG',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQNq0KV-_JxhxwRW5q7mIAC8JY4fjKiGcmauhW79TdadQ&s=10' },
            { word: 'BUS',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRuHCMaziFbH-FBqrFLNrHZ1MFRThqInBHPIY0wbu3riw&s=10' },
            { word: 'HAT',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSfR2UdR9a2SF0GfffU8QxTOnYTpII7_Z0zIatZSxemLw&s=10' },
            { word: 'PEN',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSa1yEVEEN1nUjULkEpSGtT44GZ-CxTpnJGNul-GzeUiQ&s=10' },
            { word: 'CUP',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcToqd0H77xEnh8kZjWhm2gPM1K36dYjz6MfeXkWopE70Q&s=10' },
            { word: 'FISH',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqHStMH6A2CYnNaGF9t313zq12DR0li-nIs71790kfdg&s=10' },
            { word: 'BIRD',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhaJNO8uZEuM8GZjZhxiGbnrqgRzNVDqAYfKrkjJpP4g&s=10' },
            { word: 'STAR',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRz6vfsr5Xui1TXhQrziSNKAFQVv6a17p__Hk0XKLI4Kg&s=10' },
            { word: 'MOON',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCubxoPchg2Ea7m_u1kK871371z2DEf7xUpnLY3IpjNg&s=10' },
            { word: 'BOOK',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQLL0vSvJExLz5L94fvXam5V-z8OeFvZrPWjT1sYDVGdw&s=10' },
            { word: 'CAKE',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCK01Op-EcXbeRNzlSt3n1ogE3ckEDC4P1FXeL33wdkA&s=10' },
            { word: 'BALL',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT2nYD-zAUNW9HsQPFm3dAXxdyRYPwln9ari2yAAsp2dw&s=10' },
            { word: 'DUCK',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQFFPAzZfN1_2x2gyszpaOfBG3gC96wJUj7FuzsvVg7fA&s=10' },
            { word: 'APPLE', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQXcIB-W2n5nsWUwzndyiZhc6w1DWkQiiI5fGP0hv9-Ug&s=10' },
            { word: 'CAR',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmQRthofgZNjly-hK7Uqh6YmcRyDV8gIk6pvOttIuWGQ&s=10' },
            { word: 'TREE',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS1tYvk0ra8IXCIerfPmcxaj-mqdwUWp4Tj4IuHUwzFTg&s=10' },
            { word: 'SHOE',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTiok6OZFX7mV6HgCt-9D1-8nX2x9h14UGo3W_puItNoA&s=10' },
            { word: 'MILK',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSbogsMNu0-iIBRRJByJ0x61RZxsjNeZUvgh3L-knWk4w&s=10' },
            { word: 'RED', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTbXkrNrIW7caLfpk0xASwtcTuP_1CrJ0oitmr_asz1ag&s=10' },
            { word: 'EGG',   image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQwbSZduJXNmNb4xOkE73RV3t5YGetPhNDnctLdkfLBwQ&s=10' },
            { word: 'COW',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStslX4G-_9xCjQdnEJMMl7S153DXd6KkbKvggysRzFQA&s=10' },
            { word: 'ANT',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQE_FwkuI2U8O0dVYcIBJBbBnJsCzrySQKELxz_MhhzDA&s=10' },
            { word: 'EYE',  image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQA4KBhDX5PcBVaU4CEKWVUvAQBQNQTvrCti5nVF-D1bQ&s=10' }
        ];

        let spellSessionWords = [];
        let spellIndex = 0;
        let spellScore = 0;
        let spellSelected = [];
        let spellOrder = [];
        let spellBusy = false;

        function shuffleSpellItems(items) {
            const arr = [...items];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        function startSpellItRight() {
            window.speechSynthesis?.cancel();
            spellIndex = 0;
            spellScore = 0;
            spellSessionWords = [];
            showScreen('spell-it-right-screen');
            document.getElementById('spell-count-selection').style.display = 'block';
            document.getElementById('spell-game-area').style.display = 'none';
        }

        function beginSpellSession(questionCount) {
            playClickSound();
            // Shuffle once, then slice: guarantees random order + no repeated word in one session.
            spellSessionWords = shuffleSpellItems(spellWords).slice(0, Math.min(questionCount, spellWords.length));
            spellIndex = 0;
            spellScore = 0;
            document.getElementById('spell-count-selection').style.display = 'none';
            document.getElementById('spell-game-area').style.display = 'block';
            loadSpellWord();
        }

        function getCurrentSpellItem() {
            return spellSessionWords[spellIndex];
        }

        function loadSpellWord() {
            const item = getCurrentSpellItem();
            if (!item) return;
            spellSelected = [];
            spellBusy = true;

            document.getElementById('spell-progress').innerText = `${spellIndex + 1} / ${spellSessionWords.length}`;
            document.getElementById('spell-score').innerText = spellScore;
            const picture = document.getElementById('spell-picture');
            picture.innerHTML = '';
            const img = document.createElement('img');
            img.src = item.image;
            img.alt = item.word.toLowerCase();
            img.loading = 'eager';
            picture.appendChild(img);
            document.getElementById('spell-learning-word').innerText = item.word.split('').join('   ');
            document.getElementById('spell-instruction').innerText = `Listen: ${item.word.split('').join(' - ')}`;
            document.getElementById('spell-feedback').innerText = '';
            document.getElementById('spell-next-btn').style.display = 'none';
            document.getElementById('spell-retry-btn').style.display = 'none';
            document.getElementById('spell-answer-slots').innerHTML = '';
            document.getElementById('spell-letter-bank').innerHTML = '';

            speakSpelling(item.word, () => {
                if (document.getElementById('spell-it-right-screen').classList.contains('active')) beginSpellAttempt();
            });
        }

        function speakSpelling(word, onDone) {
            if (!('speechSynthesis' in window)) {
                setTimeout(() => onDone && onDone(), 3500);
                return;
            }
            window.speechSynthesis.cancel();
            const synth = window.speechSynthesis;
            const letters = word.split('');

            function speakPart(text, rate, callback) {
                const utter = new SpeechSynthesisUtterance(text);
                utter.lang = 'en-US';
                utter.rate = rate;
                utter.pitch = 1.05;
                utter.volume = 1;
                utter.onend = () => callback && callback();
                utter.onerror = () => callback && callback();
                synth.speak(utter);
            }

            // Spell huruf sahaja. Gunakan lowercase untuk elakkan TTS menyebut
            // "capital C", "capital A" dan sebagainya.
            let i = 0;
            function speakNextLetter() {
                if (i >= letters.length) {
                    setTimeout(() => onDone && onDone(), 650);
                    return;
                }
                speakPart(letters[i].toLowerCase(), 0.50, () => {
                    i++;
                    setTimeout(speakNextLetter, 600);
                });
            }
            speakNextLetter();
        }

        function replaySpellWord() {
            const item = getCurrentSpellItem();
            if (item) speakSpelling(item.word);
        }

        function shuffleSpellLetters(word) {
            const original = word.split('').map((letter, index) => ({ letter, index }));
            let shuffled = [...original];
            let tries = 0;
            do {
                shuffled = shuffleSpellItems(original);
                tries++;
            } while (word.length > 2 && shuffled.map(x => x.letter).join('') === word && tries < 12);
            return shuffled;
        }

        function beginSpellAttempt() {
            const item = getCurrentSpellItem();
            if (!item) return;
            spellBusy = false;
            spellSelected = [];
            spellOrder = shuffleSpellLetters(item.word);
            document.getElementById('spell-learning-word').innerText = '';
            document.getElementById('spell-instruction').innerText = 'Tap the letters in the correct order.';
            document.getElementById('spell-feedback').innerText = '';
            renderSpellSlots();
            renderSpellLetterBank();
        }

        function renderSpellSlots() {
            const item = getCurrentSpellItem();
            const wrap = document.getElementById('spell-answer-slots');
            wrap.innerHTML = '';
            item.word.split('').forEach((_, i) => {
                const slot = document.createElement('div');
                slot.className = 'spell-slot';
                slot.innerText = spellSelected[i] ? spellSelected[i].letter : '';
                wrap.appendChild(slot);
            });
        }

        function renderSpellLetterBank() {
            const bank = document.getElementById('spell-letter-bank');
            bank.innerHTML = '';
            spellOrder.forEach((obj, idx) => {
                const btn = document.createElement('button');
                btn.className = 'spell-letter-btn';
                btn.innerText = obj.letter;
                btn.dataset.spellIdx = idx;
                btn.onclick = () => chooseSpellLetter(idx, btn);
                bank.appendChild(btn);
            });
        }

        function chooseSpellLetter(idx, btn) {
            if (spellBusy || btn.classList.contains('used')) return;
            playClickSound();
            btn.classList.add('used');
            spellSelected.push({ ...spellOrder[idx], buttonIndex: idx });
            renderSpellSlots();
            const item = getCurrentSpellItem();
            if (spellSelected.length === item.word.length) checkSpellAnswer();
        }

        function checkSpellAnswer() {
            spellBusy = true;
            const item = getCurrentSpellItem();
            const answer = spellSelected.map(x => x.letter).join('');
            const feedback = document.getElementById('spell-feedback');
            if (answer === item.word) {
                spellScore++;
                document.getElementById('spell-score').innerText = spellScore;
                feedback.innerText = `✅ Great job! ${item.word}`;
                feedback.style.color = '#2e9c43';
                if (typeof playCorrectSound === 'function') playCorrectSound();
                speakWholeWord(item.word);
                document.getElementById('spell-next-btn').style.display = 'inline-block';
            } else {
                feedback.innerText = '❌ Try again!';
                feedback.style.color = '#e53935';
                if (typeof playWrongSound === 'function') playWrongSound();
                document.getElementById('spell-retry-btn').style.display = 'inline-block';
            }
        }

        function speakWholeWord(word) {
            if (!('speechSynthesis' in window)) return;
            const utter = new SpeechSynthesisUtterance(word.toLowerCase());
            utter.lang = 'en-US';
            utter.rate = 0.72;
            utter.pitch = 1.05;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utter);
        }

        function resetCurrentSpellAttempt() {
            document.getElementById('spell-retry-btn').style.display = 'none';
            beginSpellAttempt();
        }

        function nextSpellWord() {
            playClickSound();
            if (spellIndex < spellSessionWords.length - 1) {
                spellIndex++;
                loadSpellWord();
            } else {
                const feedback = document.getElementById('spell-feedback');
                feedback.style.color = '#5E17EB';
                feedback.innerText = `🎉 Finished! Score: ${spellScore} / ${spellSessionWords.length}`;
                document.getElementById('spell-next-btn').style.display = 'none';
                document.getElementById('spell-learning-word').innerText = 'ALL DONE!';
                document.getElementById('spell-instruction').innerText = 'You completed Spell it Right!';
                document.getElementById('spell-letter-bank').innerHTML = '';
                document.getElementById('spell-answer-slots').innerHTML = '';
                alert('Completed Spell it Right! 🎉');
            }
        }




        // =========================================================
        // ABC TRACING
        // =========================================================
        let traceLetterIndex = 0;
        let traceCase = 'upper';
        let traceDrawing = false;
        let traceLastPoint = null;
        let traceResizeTimer = null;
        const traceAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

        function startABCTracing() {
            traceLetterIndex = 0;
            traceCase = 'upper';
            showScreen('abc-tracing-screen');
            document.getElementById('trace-uppercase-btn').classList.add('active');
            document.getElementById('trace-lowercase-btn').classList.remove('active');
            requestAnimationFrame(() => {
                setupTraceCanvases();
                renderTraceLetter();
            });
        }

        function setTraceCase(which) {
            playClickSound();
            traceCase = which;
            document.getElementById('trace-uppercase-btn').classList.toggle('active', which === 'upper');
            document.getElementById('trace-lowercase-btn').classList.toggle('active', which === 'lower');
            clearTraceDrawing(false);
            renderTraceLetter();
        }

        function previousTraceLetter() {
            playClickSound();
            traceLetterIndex = (traceLetterIndex - 1 + 26) % 26;
            clearTraceDrawing(false);
            renderTraceLetter();
        }

        function nextTraceLetter() {
            playClickSound();
            traceLetterIndex = (traceLetterIndex + 1) % 26;
            clearTraceDrawing(false);
            renderTraceLetter();
        }

        function getTraceLetter() {
            const l = traceAlphabet[traceLetterIndex];
            return traceCase === 'upper' ? l : l.toLowerCase();
        }

        function setupTraceCanvases() {
            const wrap = document.getElementById('trace-canvas-wrap');
            const guide = document.getElementById('abc-trace-guide');
            const draw = document.getElementById('abc-trace-draw');
            if (!wrap || !guide || !draw) return;

            const rect = wrap.getBoundingClientRect();
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            [guide, draw].forEach(c => {
                c.width = Math.round(rect.width * dpr);
                c.height = Math.round(rect.height * dpr);
                c.style.width = rect.width + 'px';
                c.style.height = rect.height + 'px';
                const ctx = c.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            });
            attachTraceEvents();
        }

        function drawSingleLineTraceLetter(ctx, letter, w, h) {
            // Single-line tracing guide: dots follow ONE centre path only (no hollow/outlined letter).
            const upper = traceCase === 'upper';
            const key = upper ? letter.toUpperCase() : letter.toLowerCase();
            const x0 = w * 0.18, x1 = w * 0.82;
            const y0 = h * 0.13, y1 = h * 0.87;
            const W = x1 - x0, H = y1 - y0;
            const X = n => x0 + W * n;
            const Y = n => y0 + H * n;

            function path(commands) {
                ctx.beginPath();
                for (const c of commands) {
                    if (c[0] === 'M') ctx.moveTo(X(c[1]), Y(c[2]));
                    else if (c[0] === 'L') ctx.lineTo(X(c[1]), Y(c[2]));
                    else if (c[0] === 'Q') ctx.quadraticCurveTo(X(c[1]), Y(c[2]), X(c[3]), Y(c[4]));
                    else if (c[0] === 'C') ctx.bezierCurveTo(X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6]));
                }
                ctx.stroke();
            }

            const P = {};
            // Uppercase A-Z, drawn as centre-line handwriting strokes.
            P.A=[[['M',.12,1],['L',.5,0],['L',.88,1]],[['M',.28,.58],['L',.72,.58]]];
            P.B=[[['M',.18,0],['L',.18,1]],[['M',.18,0],['C',.72,0,.82,.22,.55,.48],['C',.88,.53,.78,.88,.18,1]]];
            P.C=[[['M',.86,.14],['C',.7,-.02,.2,.02,.14,.5],['C',.2,.98,.7,1.02,.86,.86]]];
            P.D=[[['M',.18,0],['L',.18,1]],[['M',.18,0],['C',.88,.02,.9,.98,.18,1]]];
            P.E=[[['M',.82,0],['L',.18,0],['L',.18,1],['L',.82,1]],[['M',.18,.5],['L',.68,.5]]];
            P.F=[[['M',.18,1],['L',.18,0],['L',.82,0]],[['M',.18,.5],['L',.68,.5]]];
            P.G=[[['M',.86,.16],['C',.72,-.03,.18,.02,.14,.5],['C',.18,1.02,.76,1.02,.86,.67],['L',.58,.67]]];
            P.H=[[['M',.18,0],['L',.18,1]],[['M',.82,0],['L',.82,1]],[['M',.18,.5],['L',.82,.5]]];
            P.I=[[['M',.3,0],['L',.7,0]],[['M',.5,0],['L',.5,1]],[['M',.3,1],['L',.7,1]]];
            P.J=[[['M',.28,0],['L',.82,0],['L',.82,.72],['C',.82,1,.25,1.05,.18,.72]]];
            P.K=[[['M',.18,0],['L',.18,1]],[['M',.82,0],['L',.18,.55],['L',.85,1]]];
            P.L=[[['M',.2,0],['L',.2,1],['L',.82,1]]];
            P.M=[[['M',.12,1],['L',.12,0],['L',.5,.58],['L',.88,0],['L',.88,1]]];
            P.N=[[['M',.16,1],['L',.16,0],['L',.84,1],['L',.84,0]]];
            P.O=[[['M',.5,0],['C',.05,0,.05,1,.5,1],['C',.95,1,.95,0,.5,0]]];
            P.P=[[['M',.18,1],['L',.18,0],['C',.82,-.03,.86,.55,.18,.55]]];
            P.Q=[[['M',.5,0],['C',.05,0,.05,1,.5,1],['C',.95,1,.95,0,.5,0]],[['M',.58,.7],['L',.88,1]]];
            P.R=[[['M',.18,1],['L',.18,0],['C',.82,-.03,.86,.55,.18,.55]],[['M',.5,.55],['L',.86,1]]];
            P.S=[[['M',.84,.13],['C',.68,-.02,.18,.02,.18,.32],['C',.18,.56,.82,.44,.82,.72],['C',.82,1.03,.3,1.03,.14,.86]]];
            P.T=[[['M',.12,0],['L',.88,0]],[['M',.5,0],['L',.5,1]]];
            P.U=[[['M',.16,0],['L',.16,.7],['C',.16,1.08,.84,1.08,.84,.7],['L',.84,0]]];
            P.V=[[['M',.12,0],['L',.5,1],['L',.88,0]]];
            P.W=[[['M',.08,0],['L',.25,1],['L',.5,.48],['L',.75,1],['L',.92,0]]];
            P.X=[[['M',.14,0],['L',.86,1]],[['M',.86,0],['L',.14,1]]];
            P.Y=[[['M',.12,0],['L',.5,.5],['L',.88,0]],[['M',.5,.5],['L',.5,1]]];
            P.Z=[[['M',.14,0],['L',.86,0],['L',.14,1],['L',.86,1]]];

            // Lowercase a-z: NORMAL PRINT / BLOCK STYLE.
            // Sengaja dibuat lebih geometrik & tegak (bukan handwriting/cursive).
            // Masih menggunakan SATU garisan tengah sahaja untuk dotted tracing.
            P.a=[[['M',.25,.56],['C',.25,.35,.68,.35,.68,.56],['L',.68,.92]],[['M',.68,.56],['C',.68,.80,.25,.80,.25,.61],['C',.25,.43,.68,.43,.68,.61]]];
            P.b=[[['M',.26,.10],['L',.26,.92]],[['M',.26,.50],['C',.36,.37,.68,.37,.74,.56],['C',.80,.76,.58,.91,.26,.78]]];
            P.c=[[['M',.74,.45],['C',.62,.35,.30,.35,.25,.60],['C',.22,.83,.53,.95,.74,.80]]];
            P.d=[[['M',.74,.10],['L',.74,.92]],[['M',.74,.50],['C',.64,.37,.32,.37,.26,.56],['C',.20,.76,.42,.91,.74,.78]]];
            P.e=[[['M',.25,.62],['L',.75,.62],['C',.74,.45,.61,.36,.48,.36],['C',.28,.36,.22,.52,.24,.66],['C',.27,.88,.56,.96,.76,.80]]];
            P.f=[[['M',.60,.12],['C',.43,.08,.34,.18,.34,.37],['L',.34,.92]],[['M',.18,.44],['L',.62,.44]]];
            P.g=[[['M',.72,.46],['C',.62,.35,.30,.35,.25,.58],['C',.22,.80,.52,.91,.72,.77]],[['M',.72,.43],['L',.72,.94],['C',.72,1.12,.53,1.16,.38,1.10]]];
            P.h=[[['M',.26,.10],['L',.26,.92]],[['M',.26,.56],['C',.36,.38,.68,.38,.73,.56],['L',.73,.92]]];
            P.i=[[['M',.50,.44],['L',.50,.92]],[['M',.50,.22],['L',.50,.23]]];
            P.j=[[['M',.58,.44],['L',.58,.94],['C',.58,1.10,.44,1.16,.30,1.08]],[['M',.58,.22],['L',.58,.23]]];
            P.k=[[['M',.26,.10],['L',.26,.92]],[['M',.72,.43],['L',.26,.66],['L',.74,.92]]];
            P.l=[[['M',.50,.10],['L',.50,.92]]];
            P.m=[[['M',.15,.92],['L',.15,.44]],[['M',.15,.56],['C',.24,.39,.42,.39,.48,.56],['L',.48,.92]],[['M',.48,.56],['C',.56,.39,.75,.39,.81,.56],['L',.81,.92]]];
            P.n=[[['M',.25,.92],['L',.25,.44]],[['M',.25,.56],['C',.35,.39,.66,.39,.72,.56],['L',.72,.92]]];
            P.o=[[['M',.50,.36],['C',.28,.36,.23,.51,.23,.64],['C',.23,.82,.34,.92,.50,.92],['C',.72,.92,.77,.77,.77,.64],['C',.77,.47,.65,.36,.50,.36]]];
            P.p=[[['M',.26,.44],['L',.26,1.10]],[['M',.26,.51],['C',.36,.38,.68,.38,.74,.57],['C',.80,.77,.58,.91,.26,.79]]];
            P.q=[[['M',.74,.44],['L',.74,1.10]],[['M',.74,.51],['C',.64,.38,.32,.38,.26,.57],['C',.20,.77,.42,.91,.74,.79]]];
            P.r=[[['M',.30,.92],['L',.30,.44]],[['M',.30,.57],['C',.38,.42,.58,.38,.72,.44]]];
            P.s=[[['M',.72,.46],['C',.60,.35,.30,.35,.27,.51],['C',.24,.66,.66,.63,.70,.77],['C',.74,.94,.42,.98,.25,.86]]];
            P.t=[[['M',.50,.18],['L',.50,.80],['C',.50,.92,.60,.96,.72,.89]],[['M',.28,.44],['L',.70,.44]]];
            P.u=[[['M',.25,.44],['L',.25,.72],['C',.25,.88,.37,.93,.50,.93],['C',.65,.93,.74,.83,.74,.68],['L',.74,.44],['L',.74,.92]]];
            P.v=[[['M',.22,.44],['L',.50,.92],['L',.78,.44]]];
            P.w=[[['M',.12,.44],['L',.30,.92],['L',.50,.62],['L',.70,.92],['L',.88,.44]]];
            P.x=[[['M',.24,.44],['L',.76,.92]],[['M',.76,.44],['L',.24,.92]]];
            P.y=[[['M',.22,.44],['L',.50,.84],['L',.78,.44]],[['M',.50,.84],['L',.42,1.06],['C',.38,1.16,.27,1.16,.22,1.09]]];
            P.z=[[['M',.25,.44],['L',.75,.44],['L',.25,.92],['L',.76,.92]]];

            ctx.save();
            ctx.strokeStyle = '#111';
            ctx.lineWidth = Math.max(5, Math.min(w, h) * 0.013);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // Short dash + large gap = one clean row of round tracing dots.
            ctx.setLineDash([1, Math.max(10, Math.min(w, h) * 0.036)]);
            for (const stroke of (P[key] || P.A)) path(stroke);
            ctx.restore();
        }

        function renderTraceLetter() {
            const guide = document.getElementById('abc-trace-guide');
            const wrap = document.getElementById('trace-canvas-wrap');
            if (!guide || !wrap) return;
            const ctx = guide.getContext('2d');
            const w = wrap.clientWidth;
            const h = wrap.clientHeight;
            ctx.clearRect(0, 0, w, h);

            const letter = getTraceLetter();
            drawSingleLineTraceLetter(ctx, letter, w, h);

            const label = traceCase === 'upper' ? 'Uppercase' : 'Lowercase';
            document.getElementById('trace-letter-display').innerText = `${label} ${letter}`;
            document.getElementById('trace-progress').innerText = `${letter} • ${traceLetterIndex + 1} / 26`;
        }

        function clearTraceDrawing(withSound = true) {
            if (withSound) playClickSound();
            const draw = document.getElementById('abc-trace-draw');
            const wrap = document.getElementById('trace-canvas-wrap');
            if (!draw || !wrap) return;
            draw.getContext('2d').clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
            traceDrawing = false;
            traceLastPoint = null;
        }

        function tracePointFromEvent(e) {
            const canvas = document.getElementById('abc-trace-draw');
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        function beginTraceStroke(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            const canvas = document.getElementById('abc-trace-draw');
            if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
            traceDrawing = true;
            traceLastPoint = tracePointFromEvent(e);

            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.fillStyle = '#5E17EB';
            ctx.arc(traceLastPoint.x, traceLastPoint.y, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        function moveTraceStroke(e) {
            if (!traceDrawing) return;
            e.preventDefault();
            const canvas = document.getElementById('abc-trace-draw');
            const point = tracePointFromEvent(e);
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.moveTo(traceLastPoint.x, traceLastPoint.y);
            ctx.lineTo(point.x, point.y);
            ctx.strokeStyle = '#5E17EB';
            ctx.lineWidth = Math.max(10, canvas.getBoundingClientRect().width * 0.025);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            traceLastPoint = point;
        }

        function endTraceStroke(e) {
            if (!traceDrawing) return;
            e.preventDefault();
            traceDrawing = false;
            traceLastPoint = null;
        }

        function attachTraceEvents() {
            const canvas = document.getElementById('abc-trace-draw');
            if (!canvas || canvas.dataset.traceReady === '1') return;
            canvas.dataset.traceReady = '1';
            canvas.addEventListener('pointerdown', beginTraceStroke, { passive: false });
            canvas.addEventListener('pointermove', moveTraceStroke, { passive: false });
            canvas.addEventListener('pointerup', endTraceStroke, { passive: false });
            canvas.addEventListener('pointercancel', endTraceStroke, { passive: false });
            canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') endTraceStroke(e); }, { passive: false });
        }


        // =========================================================
        // 123 TRACING - Nombor 1 hingga 10
        // Menggunakan saiz canvas, titik panduan dan stroke yang sama
        // seperti ABC Tracing.
        // =========================================================
        let numTraceIndex = 0;
        let numTraceDrawing = false;
        let numTraceLastPoint = null;
        const numTraceNumbers = ['1','2','3','4','5','6','7','8','9','10'];

        function start123Tracing() {
            numTraceIndex = 0;
            showScreen('num123-tracing-screen');
            requestAnimationFrame(() => {
                setupNumberTraceCanvases();
                renderTraceNumber();
            });
        }

        function previousTraceNumber() {
            playClickSound();
            numTraceIndex = (numTraceIndex - 1 + numTraceNumbers.length) % numTraceNumbers.length;
            clearNumberTraceDrawing(false);
            renderTraceNumber();
        }

        function nextTraceNumber() {
            playClickSound();
            numTraceIndex = (numTraceIndex + 1) % numTraceNumbers.length;
            clearNumberTraceDrawing(false);
            renderTraceNumber();
        }

        function setupNumberTraceCanvases() {
            const wrap = document.getElementById('num-trace-canvas-wrap');
            const guide = document.getElementById('num-trace-guide');
            const draw = document.getElementById('num-trace-draw');
            if (!wrap || !guide || !draw) return;

            const rect = wrap.getBoundingClientRect();
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            [guide, draw].forEach(c => {
                c.width = Math.round(rect.width * dpr);
                c.height = Math.round(rect.height * dpr);
                c.style.width = rect.width + 'px';
                c.style.height = rect.height + 'px';
                const ctx = c.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            });
            attachNumberTraceEvents();
        }

        function drawSingleLineTraceNumber(ctx, value, w, h) {
            const x0 = w * 0.18, x1 = w * 0.82;
            const y0 = h * 0.13, y1 = h * 0.87;
            const W = x1 - x0, H = y1 - y0;

            const paths = {
                '0': [[['M',.50,.04],['C',.22,.04,.18,.27,.18,.50],['C',.18,.78,.27,.96,.50,.96],['C',.73,.96,.82,.78,.82,.50],['C',.82,.22,.73,.04,.50,.04]]],
                '1': [[['M',.34,.22],['L',.50,.05],['L',.50,.95]],[['M',.31,.95],['L',.69,.95]]],
                '2': [[['M',.20,.25],['C',.28,.02,.72,.00,.80,.25],['C',.86,.45,.65,.57,.20,.95],['L',.82,.95]]],
                '3': [[['M',.22,.13],['C',.38,.00,.76,.02,.78,.25],['C',.79,.43,.61,.49,.49,.50],['C',.65,.50,.83,.58,.80,.78],['C',.77,1.00,.37,1.00,.20,.87]]],
                '4': [[['M',.68,.95],['L',.68,.05],['L',.17,.66],['L',.83,.66]]],
                '5': [[['M',.78,.05],['L',.26,.05],['L',.22,.46],['C',.38,.35,.73,.38,.79,.60],['C',.87,.89,.53,1.01,.21,.87]]],
                '6': [[['M',.74,.12],['C',.50,-.02,.20,.17,.19,.56],['C',.18,.91,.46,1.02,.68,.88],['C',.87,.76,.80,.48,.60,.43],['C',.42,.38,.24,.47,.20,.60]]],
                '7': [[['M',.18,.06],['L',.82,.06],['L',.37,.95]]],
                '8': [[['M',.50,.04],['C',.25,.04,.22,.27,.50,.49],['C',.78,.28,.75,.04,.50,.04]],[['M',.50,.49],['C',.18,.56,.20,.95,.50,.96],['C',.80,.96,.82,.58,.50,.49]]],
                '9': [[['M',.27,.83],['C',.50,1.00,.80,.82,.81,.44],['C',.82,.09,.54,-.02,.31,.12],['C',.12,.24,.19,.52,.39,.57],['C',.57,.62,.76,.53,.80,.39]]]
            };

            function strokeDigit(digit, left, widthScale) {
                const X = n => x0 + W * (left + n * widthScale);
                const Y = n => y0 + H * n;
                function path(commands) {
                    ctx.beginPath();
                    for (const c of commands) {
                        if (c[0] === 'M') ctx.moveTo(X(c[1]), Y(c[2]));
                        else if (c[0] === 'L') ctx.lineTo(X(c[1]), Y(c[2]));
                        else if (c[0] === 'Q') ctx.quadraticCurveTo(X(c[1]), Y(c[2]), X(c[3]), Y(c[4]));
                        else if (c[0] === 'C') ctx.bezierCurveTo(X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6]));
                    }
                    ctx.stroke();
                }
                for (const stroke of paths[digit]) path(stroke);
            }

            ctx.save();
            ctx.strokeStyle = '#111';
            ctx.lineWidth = Math.max(5, Math.min(w, h) * 0.013);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash([1, Math.max(10, Math.min(w, h) * 0.036)]);

            if (value === '10') {
                // Dua digit masih menggunakan tinggi dan ketebalan dot yang sama.
                strokeDigit('1', 0.02, 0.44);
                strokeDigit('0', 0.48, 0.44);
            } else {
                strokeDigit(value, 0, 1);
            }
            ctx.restore();
        }

        function renderTraceNumber() {
            const guide = document.getElementById('num-trace-guide');
            const wrap = document.getElementById('num-trace-canvas-wrap');
            if (!guide || !wrap) return;
            const ctx = guide.getContext('2d');
            const w = wrap.clientWidth;
            const h = wrap.clientHeight;
            ctx.clearRect(0, 0, w, h);

            const value = numTraceNumbers[numTraceIndex];
            drawSingleLineTraceNumber(ctx, value, w, h);
            document.getElementById('num-trace-display').innerText = `Number ${value}`;
            document.getElementById('num-trace-progress').innerText = `${value} • ${numTraceIndex + 1} / 10`;
        }

        function clearNumberTraceDrawing(withSound = true) {
            if (withSound) playClickSound();
            const draw = document.getElementById('num-trace-draw');
            const wrap = document.getElementById('num-trace-canvas-wrap');
            if (!draw || !wrap) return;
            draw.getContext('2d').clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
            numTraceDrawing = false;
            numTraceLastPoint = null;
        }

        function numberTracePointFromEvent(e) {
            const canvas = document.getElementById('num-trace-draw');
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        function beginNumberTraceStroke(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            const canvas = document.getElementById('num-trace-draw');
            if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
            numTraceDrawing = true;
            numTraceLastPoint = numberTracePointFromEvent(e);

            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.fillStyle = '#5E17EB';
            ctx.arc(numTraceLastPoint.x, numTraceLastPoint.y, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        function moveNumberTraceStroke(e) {
            if (!numTraceDrawing) return;
            e.preventDefault();
            const canvas = document.getElementById('num-trace-draw');
            const point = numberTracePointFromEvent(e);
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.moveTo(numTraceLastPoint.x, numTraceLastPoint.y);
            ctx.lineTo(point.x, point.y);
            ctx.strokeStyle = '#5E17EB';
            ctx.lineWidth = Math.max(10, canvas.getBoundingClientRect().width * 0.025);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            numTraceLastPoint = point;
        }

        function endNumberTraceStroke(e) {
            if (!numTraceDrawing) return;
            e.preventDefault();
            numTraceDrawing = false;
            numTraceLastPoint = null;
        }

        function attachNumberTraceEvents() {
            const canvas = document.getElementById('num-trace-draw');
            if (!canvas || canvas.dataset.traceReady === '1') return;
            canvas.dataset.traceReady = '1';
            canvas.addEventListener('pointerdown', beginNumberTraceStroke, { passive: false });
            canvas.addEventListener('pointermove', moveNumberTraceStroke, { passive: false });
            canvas.addEventListener('pointerup', endNumberTraceStroke, { passive: false });
            canvas.addEventListener('pointercancel', endNumberTraceStroke, { passive: false });
            canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') endNumberTraceStroke(e); }, { passive: false });
        }

        window.addEventListener('resize', () => {
            if (!document.getElementById('abc-tracing-screen')?.classList.contains('active')) return;
            clearTimeout(traceResizeTimer);
            traceResizeTimer = setTimeout(() => {
                setupTraceCanvases();
                clearTraceDrawing(false);
                renderTraceLetter();
            }, 140);
        });

        window.addEventListener('resize', () => {
            if (!document.getElementById('num123-tracing-screen')?.classList.contains('active')) return;
            clearTimeout(traceResizeTimer);
            traceResizeTimer = setTimeout(() => {
                setupNumberTraceCanvases();
                clearNumberTraceDrawing(false);
                renderTraceNumber();
            }, 140);
        });




        // =========================================================
        // BIJAK SUKU KATA - 10 random, non-repeating words per session
        // =========================================================
        // EDIT GAMBAR BIJAK SUKU KATA DI SINI SAHAJA.
        // Tukar nilai image: dengan direct link gambar anda (contoh Imgur).
        // Contoh: image: 'https://i.imgur.com/xxxx.jpeg'
        const sukuWords = [
            { word: 'baju', first: 'BA', second: 'JU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTrNwCgNiy2MAuQ0g4qyoFZvSQXRvj1fcWKUy6HX52CDw&s=10' },
            { word: 'batu', first: 'BA', second: 'TU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRPsVSxyE2dPyRSGnYm9jjYRx8mcvW1x6AuCQKBpnmUaw&s=10' },
            { word: 'buku', first: 'BU', second: 'KU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ79zYWvDaTVVUBJWI_R10UwyNh9gOxFzYgOksbVVBisw&s=10' },
            { word: 'bola', first: 'BO', second: 'LA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQVMc01fNm4zmVdnl_9dm4M7SGTl-dF82uprjmth_EDHA&s=10' },
            { word: 'biru', first: 'BI', second: 'RU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQRaP3p4Puj4eLJAivYLrc_JJH5Rd61jT2DAReDTopjEA&s=10' },
            { word: 'bayi', first: 'BA', second: 'YI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCfdkNpGm2qmbCI2x_YTKd3-RaSTii5LYR6fNPEtcXzQ&s=10' },
            { word: 'dada', first: 'DA', second: 'DA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWWoz6ciLbVaK92oFb8griYEFEPzXX7if0YozHk9bzVA&s=10' },
            { word: 'dadu', first: 'DA', second: 'DU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmvV7YN_bS4zrlQa9_gJdJGAi_D-jsI1qESIyHrWsxUQ&s=10' },
            { word: 'gigi', first: 'GI', second: 'GI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQWdGHhNm6jESxOTXVwWuc5O10pD63oFbpu-1A2IW8T4w&s=10' },
            { word: 'gula', first: 'GU', second: 'LA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS56Cj6fdn56Wj4otzQj_u5DxufSjxPCUdKZUtjfs3kSw&s=10' },
            { word: 'guru', first: 'GU', second: 'RU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQuieJpcRWfTiy1Oc_cCYTcfFLowFQdMyRuVKWctIA2hg&s=10' },
            { word: 'jari', first: 'JA', second: 'RI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQho9CKccZG7TLCQk3TTTtMv9OufX_ITmuyOFS0ektOwQ&s=10' },
            { word: 'kaki', first: 'KA', second: 'KI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRlujYUM_-BGBIwkmRFLc0fOYXWTrMZNepLbWNe60_T2Q&s=10' },
            { word: 'kayu', first: 'KA', second: 'YU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRu7OWNNM-WrhINseCkROzJrYGGefAlKFFr-oM0GfNk5g&s=10' },
            { word: 'kuda', first: 'KU', second: 'DA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTCEYybFVM8Km4_f_rlj9pR45orPNdjeNiiBDbeh6WWkQ&s=10' },
            { word: 'kuku', first: 'KU', second: 'KU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTXAjIEgbjTXKHsXN429IyQo4Vb1-Y5k4wGUE1CM1byeA&s=10' },
            { word: 'labu', first: 'LA', second: 'BU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwHaxeWFfFqxdjiU1L1pWReL-EmW54-3-mlwizSgP31w&s=10' },
            { word: 'lima', first: 'LI', second: 'MA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStQCOYXBXDL_nNwww1uO33UA-DH-AdYr-CUQVH4bimNQ&s=10' },
            { word: 'mata', first: 'MA', second: 'TA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTYroqPxY0ajNrVDoMjydq3fOdgLeXMBFSp9eq_UrTysA&s=10' },
            { word: 'meja', first: 'ME', second: 'JA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT1MbOh7iuLZ5XsfNEZiCCa9aUFFFAQrRGijAc6knnRTA&s=10' },
            { word: 'muka', first: 'MU', second: 'KA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRhJUc4TllI1V0q6-RHrR1TM3d3kHxbuQum87-xrYBDXg&s=10' },
            { word: 'nasi', first: 'NA', second: 'SI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3zWTi1SUYfREoAv_rSLwbE1Vhz6E1OFOe41RbyXJYTA&s=10' },
            { word: 'nota', first: 'NO', second: 'TA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSBthBsk_6ne4vSeEvAIgta_dlPDeNjAl39exKRexVylw&s=10' },
            { word: 'padi', first: 'PA', second: 'DI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSic2KfFjRMV6ptmIfASV4fDBdcAQb39Xn7idhTxxNhmg&s=10' },
            { word: 'pasu', first: 'PA', second: 'SU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQMLslEwbJU1-sOfpCXG2iHKP8dhNq0mZu7YhLvgYfgPw&s=10' },
            { word: 'paku', first: 'PA', second: 'KU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYKwE3TlFFEkpQy-Kd3D41c_U2k_HfOTvIheEn4Yh7IA&s=10' },
            { word: 'pipi', first: 'PI', second: 'PI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQWLloUxdjJI1yVesk1bxtrMnHBch6wY4I2zp1XMQbT3w&s=10' },
            { word: 'roda', first: 'RO', second: 'DA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT1m34YZJbJlx60o2TwyIjBQGH4uYDGneChM8mu0V56kw&s=10' },
            { word: 'roti', first: 'RO', second: 'TI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRsXtTsDb2h4ELY3RQXe4Ccz3_xFrHihREG2RIil3VGjQ&s=10' },
            { word: 'satu', first: 'SA', second: 'TU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRmva1IdMp3oAVvv1acwtKWdhNidXOT0O6cBDv0bs8Xeg&s=10' },
            { word: 'siku', first: 'SI', second: 'KU', image: 'https://flexfreeclinic.com/uploads/artikel/2UZ4Q_Flexfree_Clinic_BERBAGAI-PENYEBAB-NYERI-SIKU-.jpg' },
            { word: 'susu', first: 'SU', second: 'SU', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRcq2ivnMvEcCgCSUcXWD7_iq5Emh9hqHP6yyc18zj4QQ&s=10' },
            { word: 'tali', first: 'TA', second: 'LI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVpbUEi3tTOpoGAlX7phWEKqCrKi-BfbohHrKGVr6gpg&s=10' },
            { word: 'topi', first: 'TO', second: 'PI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSXtNwQugd1XcFERoEkenvuF7igZbgRn4PRFTW1SBaVuQ&s=10' },
            { word: 'ubi', first: 'U', second: 'BI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZVkrf6No0g9qJu0_pso8LoLDwJejT2IWIhMliIKmkYw&s=10' },
            { word: 'sawi', first: 'SA', second: 'WI', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTka5KLIGKkyM5-016kMSwcn9N1bHrjrjfIwYy6YVdHfg&s=10' },
            { word: 'sate', first: 'SA', second: 'TE', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRZpNeNzGvsDdRsyKcv7z34N6PdBbS_IbOL1nABgx_jzg&s' },
            { word: 'rusa', first: 'RU', second: 'SA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMV3vSCSE2KTfts7-oe4Ua46zOM1zVZqM25J4M3dPk5Q&s=10' },
            { word: 'singa', first: 'SI', second: 'NGA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSlHhOteFzFpz9phePIrIvv8dPTFp8KgTSbkUtNlw6MWg&s=10' },
            { word: 'naga', first: 'NA', second: 'GA', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRo3R2q40-D_xDS9IejL_tWaKjnQbiZZ898Wrg67kS5BQ&s=10' }
        ];
        function sukuShuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
        function updateBijakSukuKataLanguage(){
            const ms=currentGlobalLang==='ms';
            const labels={
                'suku-menu-title':'Bijak Suku Kata 📖',
                'suku-menu-desc':ms?'Pilih aktiviti yang ingin dimainkan.':'Choose an activity to play.',
                'suku-activity2-btn':ms?'Aktiviti 1':'Activity 1',
                'suku-menu-back':ms?'Kembali ke ABC 🔤':'Back to ABC 🔤',
                'suku2-title':ms?'Aktiviti 1':'Activity 1',
                'suku2-instruction':ms?'Tarik suku kata kedua yang betul untuk melengkapkan perkataan!':'Drag the correct second syllable to complete each word!',
                'suku2-back':ms?'Kembali ↩️':'Back ↩️'
            };
            Object.entries(labels).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value});
        }
        function openBijakSukuKataMenu(){window.speechSynthesis?.cancel();updateBijakSukuKataLanguage();showScreen('bijak-suku-kata-menu-screen')}
        // =========================================================
        // BIJAK SUKU KATA - AKTIVITI 1 (5 sets x 4 unique pictures)
        // =========================================================
        let suku2Sets=[],suku2SetIndex=0,suku2Score=0,suku2Matched=0,suku2SelectedRow=null,suku2SelectedChoice=null;
        let suku2DragChoice=null,suku2DragGhost=null,suku2DragStartX=0,suku2DragStartY=0,suku2SuppressClick=false;
        function buildSuku2Sets(){
            const remaining=sukuShuffle(sukuWords);
            const sets=[];
            for(let setNo=0;setNo<5;setNo++){
                const set=[],usedSeconds=new Set();
                for(let i=0;i<remaining.length&&set.length<4;){
                    const item=remaining[i];
                    if(!usedSeconds.has(item.second)){set.push(item);usedSeconds.add(item.second);remaining.splice(i,1)}else{i++}
                }
                if(set.length<4){
                    while(set.length<4&&remaining.length){set.push(remaining.shift())}
                }
                sets.push(set);
            }
            return sets;
        }
        function startBijakSukuKata2(){
            window.speechSynthesis?.cancel();updateBijakSukuKataLanguage();
            suku2Sets=buildSuku2Sets();suku2SetIndex=0;suku2Score=0;suku2Matched=0;suku2SelectedRow=null;suku2SelectedChoice=null;
            showScreen('bijak-suku-kata-2-screen');renderSuku2Set();
        }
        function renderSuku2Set(){
            const set=suku2Sets[suku2SetIndex];if(!set)return;
            suku2Matched=0;suku2SelectedRow=null;suku2SelectedChoice=null;
            document.getElementById('suku2-set-progress').textContent=`${suku2SetIndex+1} / ${suku2Sets.length}`;
            document.getElementById('suku2-score').textContent=suku2Score;
            document.getElementById('suku2-message').textContent='';
            const board=document.getElementById('suku2-board');board.innerHTML='';
            const pairs=sukuShuffle(set.map((item,index)=>({second:item.second,key:index})));
            set.forEach((item,index)=>{
                const row=document.createElement('div');row.className='suku2-row';row.dataset.second=item.second;row.dataset.word=item.word;
                const img=document.createElement('img');img.src=item.image;img.alt=item.word;img.loading='eager';
                const plank=document.createElement('div');plank.className='suku2-plank';
                const first=document.createElement('span');first.className='suku2-first';first.textContent=item.first;
                const drop=document.createElement('div');drop.className='suku2-drop';drop.tabIndex=0;drop.setAttribute('role','button');drop.setAttribute('aria-label',currentGlobalLang==='ms'?`Jawapan untuk ${item.first}`:`Answer for ${item.first}`);
                drop.onclick=()=>{if(suku2SelectedChoice)trySuku2Match(drop,suku2SelectedChoice)};
                drop.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&suku2SelectedChoice){e.preventDefault();trySuku2Match(drop,suku2SelectedChoice)}};
                plank.append(first,drop);
                const options=document.createElement('div');options.className='suku2-options';
                const correct=pairs.find(pair=>pair.key===index);
                const decoy=pairs.find(pair=>pair.key!==index&&pair.second!==correct.second) || pairs.find(pair=>pair.key!==index);
                sukuShuffle([correct,decoy]).forEach((pair,optionIndex)=>{
                    const choice=document.createElement('button');choice.type='button';choice.className='suku2-choice';choice.id=`suku2-choice-${index}-${optionIndex}`;choice.dataset.second=pair.second;choice.textContent=pair.second;choice.draggable=false;
                    choice.onclick=()=>{if(suku2SuppressClick)return;document.querySelectorAll('.suku2-choice.selected').forEach(el=>el.classList.remove('selected'));choice.classList.add('selected');suku2SelectedChoice=choice};
                    choice.onpointerdown=e=>startSuku2ChoiceDrag(e,choice);
                    choice.onpointermove=moveSuku2ChoiceDrag;
                    choice.onpointerup=endSuku2ChoiceDrag;
                    choice.onpointercancel=cancelSuku2ChoiceDrag;
                    options.appendChild(choice);
                });
                row.append(img,plank,options);board.appendChild(row);
            });
        }
        function startSuku2ChoiceDrag(e,choice){
            if(choice.classList.contains('matched')||e.button>0)return;
            e.preventDefault();suku2DragChoice=choice;suku2DragStartX=e.clientX;suku2DragStartY=e.clientY;
            choice.setPointerCapture?.(e.pointerId);
        }
        function moveSuku2ChoiceDrag(e){
            if(!suku2DragChoice)return;
            e.preventDefault();
            if(!suku2DragGhost&&Math.hypot(e.clientX-suku2DragStartX,e.clientY-suku2DragStartY)>7){
                suku2SuppressClick=true;suku2DragChoice.classList.add('dragging');
                suku2DragGhost=document.createElement('div');suku2DragGhost.className='suku2-drag-ghost';suku2DragGhost.textContent=suku2DragChoice.textContent;document.body.appendChild(suku2DragGhost);
            }
            if(suku2DragGhost){suku2DragGhost.style.left=e.clientX+'px';suku2DragGhost.style.top=e.clientY+'px';
                document.querySelectorAll('#suku2-board .suku2-drop').forEach(el=>el.classList.remove('hover'));
                document.elementFromPoint(e.clientX,e.clientY)?.closest('#suku2-board .suku2-drop')?.classList.add('hover');}
        }
        function endSuku2ChoiceDrag(e){
            if(!suku2DragChoice)return;
            const choice=suku2DragChoice,wasDragging=!!suku2DragGhost;
            const drop=wasDragging?document.elementFromPoint(e.clientX,e.clientY)?.closest('#suku2-board .suku2-drop'):null;
            choice.releasePointerCapture?.(e.pointerId);cancelSuku2ChoiceDrag();
            if(drop)trySuku2Match(drop,choice);
            if(wasDragging){suku2SuppressClick=true;setTimeout(()=>{suku2SuppressClick=false},80)}
        }
        function cancelSuku2ChoiceDrag(){
            suku2DragChoice?.classList.remove('dragging');suku2DragChoice=null;suku2DragGhost?.remove();suku2DragGhost=null;
            document.querySelectorAll('#suku2-board .suku2-drop.hover').forEach(el=>el.classList.remove('hover'));
        }
        function trySuku2Match(drop,choice){
            if(!drop||!choice||drop.classList.contains('matched')||choice.classList.contains('matched'))return;
            const row=drop.closest('.suku2-row');
            if(row.dataset.second!==choice.dataset.second){
                playWrongSound();drop.classList.add('wrong');choice.classList.add('wrong');document.getElementById('suku2-message').textContent=currentGlobalLang==='ms'?'Cuba lagi 😊':'Try again 😊';
                setTimeout(()=>{drop.classList.remove('wrong');choice.classList.remove('wrong')},450);return;
            }
            playCorrectSound();row.querySelector('.suku2-first').textContent+=choice.textContent;drop.remove();row.classList.add('matched');
            row.querySelectorAll('.suku2-choice').forEach(el=>{el.classList.add('matched');el.disabled=true});
            suku2SelectedChoice=null;suku2Matched++;suku2Score++;document.getElementById('suku2-score').textContent=suku2Score;
            document.getElementById('suku2-message').textContent=currentGlobalLang==='ms'?`${row.dataset.word.toUpperCase()} — Betul! 🌟`:`${row.dataset.word.toUpperCase()} — Correct! 🌟`;
            if(suku2Matched===4)setTimeout(()=>{if(suku2SetIndex<suku2Sets.length-1){suku2SetIndex++;renderSuku2Set()}else{finishSuku2Session()}},750);
        }
        function finishSuku2Session(){
            const pop=document.getElementById('suku-pop'),inner=document.getElementById('suku-pop-inner'),ms=currentGlobalLang==='ms';
            inner.innerHTML=`<div style="font-size:clamp(2rem,7vw,3.6rem);margin-bottom:12px;">${ms?'🎉 DAH SELESAI! 🎉':'🎉 ALL DONE! 🎉'}</div><div style="font-family:'Quicksand',sans-serif;font-size:1.05rem;color:#2C3E50;margin-bottom:18px;font-weight:800;">${ms?'Skor':'Score'}: ${suku2Score} / 20</div><button class="action-btn home-btn" onclick="closeSuku2Completion()" style="font-size:1rem;">Close ✖️</button>`;
            pop.style.pointerEvents='auto';pop.classList.add('show');
            announceAllDone();
        }
        function closeSuku2Completion(){const pop=document.getElementById('suku-pop');pop.classList.remove('show');pop.style.pointerEvents='none';openBijakSukuKataMenu()}

        // =========================================================
        // COMPLETE THE ABC - 5 randomized, non-repeating questions
        // =========================================================
        const COMPLETE_ABC_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        let completeABCQuestions = [];
        let completeABCIndex = 0;
        let completeABCSelectedChip = null;

        function completeABCShuffle(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        function buildCompleteABCQuestions() {
            const seen = new Set();
            const sets = [];
            while (sets.length < 5) {
                // Every question has at least 10 different missing letters.
                const missingCount = 10 + Math.floor(Math.random() * 3); // 10-12
                const pool = COMPLETE_ABC_ALPHABET.map((_, i) => i);
                const missing = completeABCShuffle(pool).slice(0, missingCount).sort((a,b)=>a-b);
                const key = missing.join('-');
                if (!seen.has(key)) { seen.add(key); sets.push(missing); }
            }
            return completeABCShuffle(sets);
        }

        function startCompleteABC() {
            completeABCQuestions = buildCompleteABCQuestions();
            completeABCIndex = 0;
            completeABCSelectedChip = null;
            showScreen('complete-abc-screen');
            renderCompleteABCQuestion();
        }

        // =========================================================
        // COMPLETE THE ABC - EASY POINTER DRAG (same feel as Add Them Up)
        // One press + drag works for mouse, iPhone, iPad and Android.
        // =========================================================
        let completeABCDrag = null;
        let completeABCFloat = null;

        function installCompleteABCChipDrag(chip) {
            chip.onpointerdown = e => {
                if (chip.classList.contains('used')) return;
                e.preventDefault();

                // Start dragging immediately on the FIRST touch/press.
                completeABCDrag = { chip, pointerId: e.pointerId };
                chip.setPointerCapture?.(e.pointerId);
                chip.classList.add('dragging');

                completeABCFloat = document.createElement('div');
                completeABCFloat.className = 'complete-abc-floating';
                completeABCFloat.textContent = chip.dataset.letter;
                document.body.appendChild(completeABCFloat);
                moveCompleteABCFloat(e);
            };

            chip.onpointermove = e => {
                if (completeABCDrag?.chip !== chip) return;
                e.preventDefault();
                moveCompleteABCFloat(e);
                highlightCompleteABCZone(e.clientX, e.clientY);
            };

            chip.onpointerup = chip.onpointercancel = e => {
                if (completeABCDrag?.chip !== chip) return;
                e.preventDefault();
                const target = document.elementFromPoint(e.clientX, e.clientY);
                const cell = target?.closest?.('#complete-abc-path .abc-path-cell.missing:not(.filled)');
                cleanupCompleteABCDrag();
                if (cell) placeCompleteABCLetter(chip, cell);
            };
        }

        function moveCompleteABCFloat(e) {
            if (!completeABCFloat) return;
            completeABCFloat.style.left = e.clientX + 'px';
            completeABCFloat.style.top = e.clientY + 'px';
        }

        function highlightCompleteABCZone(x, y) {
            document.querySelectorAll('#complete-abc-path .abc-path-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
            const target = document.elementFromPoint(x, y);
            const cell = target?.closest?.('#complete-abc-path .abc-path-cell.missing:not(.filled)');
            if (cell) cell.classList.add('drag-over');
        }

        function cleanupCompleteABCDrag() {
            if (completeABCDrag?.chip) completeABCDrag.chip.classList.remove('dragging');
            completeABCDrag = null;
            completeABCFloat?.remove();
            completeABCFloat = null;
            document.querySelectorAll('#complete-abc-path .abc-path-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
        }


        function drawCompleteABCRope() {
            const path = document.getElementById('complete-abc-path');
            if (!path) return;
            path.querySelector('.complete-abc-rope')?.remove();
            const cells = [...path.querySelectorAll('.abc-path-cell')];
            if (cells.length < 2) return;
            const box = path.getBoundingClientRect();
            const pts = cells.map(cell => {
                const r = cell.getBoundingClientRect();
                return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
            });
            const d = pts.map((p,i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('class','complete-abc-rope');
            svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
            svg.setAttribute('preserveAspectRatio','none');
            const rope = document.createElementNS(svgNS,'path');
            rope.setAttribute('d',d);
            const hi = document.createElementNS(svgNS,'path');
            hi.setAttribute('d',d);
            hi.setAttribute('class','rope-highlight');
            svg.append(rope,hi);
            path.prepend(svg);
        }
        window.addEventListener('resize', () => {
            if (document.getElementById('complete-abc-screen')?.classList.contains('active')) {
                requestAnimationFrame(drawCompleteABCRope);
            }
        });

        function renderCompleteABCQuestion() {
            const missing = completeABCQuestions[completeABCIndex];
            const path = document.getElementById('complete-abc-path');
            const options = document.getElementById('complete-abc-options');
            const msg = document.getElementById('complete-abc-message');
            if (!path || !options) return;
            msg.textContent = '';
            completeABCSelectedChip = null;
            document.getElementById('complete-abc-title').textContent = currentGlobalLang === 'ms' ? 'Lengkapkan ABC 🔤' : 'Complete the ABC 🔤';
            document.getElementById('complete-abc-instruction').textContent = currentGlobalLang === 'ms' ? 'Bantu lebah sampai ke sarang dengan melengkapkan huruf A hingga Z.' : 'Help the bee reach the hive by completing the letters from A to Z.';
            document.getElementById('complete-abc-progress').textContent = `${currentGlobalLang === 'ms' ? 'Soalan' : 'Question'} ${completeABCIndex + 1} / 5`;
            document.getElementById('complete-abc-back').textContent = currentGlobalLang === 'ms' ? 'Kembali ke ABC 🔤' : 'Back to ABC 🔤';
            document.getElementById('complete-abc-route-label').textContent = currentGlobalLang === 'ms' ? 'Bantu lebah ke sarang!' : 'Help the bee reach the hive!';
            document.getElementById('complete-options-title').textContent = currentGlobalLang === 'ms' ? 'Seret huruf ke bulatan kosong' : 'Drag the letters into the empty circles';

            path.innerHTML = '';
            COMPLETE_ABC_ALPHABET.forEach((letter, idx) => {
                const cell = document.createElement('div');
                cell.className = 'abc-path-cell' + (missing.includes(idx) ? ' missing' : '');
                cell.dataset.answer = letter;
                cell.dataset.index = idx;
                // Snake route: each row alternates direction, like the worksheet path.
                const row = Math.floor(idx / 6) + 1;
                const offset = idx % 6;
                const col = row % 2 === 1 ? offset + 1 : 6 - offset;
                cell.style.gridRow = row;
                cell.style.gridColumn = col;
                cell.textContent = missing.includes(idx) ? '' : letter;
                if (missing.includes(idx)) {
                    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
                    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
                    cell.addEventListener('drop', e => {
                        e.preventDefault(); cell.classList.remove('drag-over');
                        const chipId = e.dataTransfer.getData('text/plain');
                        const chip = document.getElementById(chipId);
                        if (chip) placeCompleteABCLetter(chip, cell);
                    });
                    // Tap letter then tap circle also works on phones/tablets.
                    cell.addEventListener('click', () => {
                        if (completeABCSelectedChip) placeCompleteABCLetter(completeABCSelectedChip, cell);
                    });
                }
                path.appendChild(cell);
            });

            // Draw one continuous rounded rope behind the circles so the ABC path
            // clearly looks like a connected caterpillar without forcing every circle to touch.
            requestAnimationFrame(drawCompleteABCRope);

            options.innerHTML = '';
            completeABCShuffle(missing.map(i => COMPLETE_ABC_ALPHABET[i])).forEach((letter, n) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'complete-letter-chip';
                chip.id = `complete-chip-${completeABCIndex}-${n}`;
                chip.textContent = letter;
                chip.dataset.letter = letter;
                // Same one-touch pointer drag technique used by Add Them Up.
                // No second tap is needed on phones.
                chip.draggable = false;
                installCompleteABCChipDrag(chip);
                options.appendChild(chip);
            });
        }

        function placeCompleteABCLetter(chip, cell) {
            if (!chip || !cell || cell.classList.contains('filled')) return;
            const letter = chip.dataset.letter;
            if (letter === cell.dataset.answer) {
                cell.textContent = letter;
                cell.classList.remove('missing');
                cell.classList.add('filled');
                chip.classList.add('used');
                chip.classList.remove('selected');
                completeABCSelectedChip = null;
                playClickSound();
                const remaining = document.querySelectorAll('#complete-abc-path .abc-path-cell.missing:not(.filled)').length;
                if (remaining === 0) {
                    const msg = document.getElementById('complete-abc-message');
                    msg.textContent = currentGlobalLang === 'ms' ? 'Bagus! Lebah sudah sampai ke sarang! 🐝🍯🎉' : 'Great! The bee reached the hive! 🐝🍯🎉';
                    setTimeout(() => {
                        if (completeABCIndex < 4) {
                            completeABCIndex++;
                            renderCompleteABCQuestion();
                        } else {
                            alert(currentGlobalLang === 'ms' ? 'Tahniah! Anda telah lengkapkan 5 soalan ABC! 🎉' : 'Congratulations! You completed all 5 ABC questions! 🎉');
                            openABCMenu();
                        }
                    }, 950);
                }
            } else {
                cell.style.background = '#ffd6d6';
                setTimeout(() => { if (!cell.classList.contains('filled')) cell.style.background = ''; }, 450);
                const msg = document.getElementById('complete-abc-message');
                msg.textContent = currentGlobalLang === 'ms' ? 'Cuba lagi 😊' : 'Try again 😊';
            }
        }


        // =========================================================
        // SHAPE MODULE
        // Learn Shape, Match Shape, Draw Shape, Match Me
        // =========================================================
        const shapeDatabase = [
            {id:'square', en:'Square', ms:'Segi Empat Sama', color:'#0099FF'},
            {id:'circle', en:'Circle', ms:'Bulatan', color:'#00B894'},
            {id:'rectangle', en:'Rectangle', ms:'Segi Empat Tepat', color:'#FFD000'},
            {id:'triangle', en:'Triangle', ms:'Segi Tiga', color:'#FF6B57'},
            {id:'star', en:'Star', ms:'Bintang', color:'#FFB800'},
            {id:'heart', en:'Heart', ms:'Hati', color:'#FF3366'},
            {id:'rhombus', en:'Rhombus', ms:'Belah Ketupat', color:'#7C4DFF'},
            {id:'oval', en:'Oval', ms:'Bujur', color:'#20C77A'},
            {id:'pentagon', en:'Pentagon', ms:'Pentagon', color:'#C92DB4'},
            {id:'hexagon', en:'Hexagon', ms:'Heksagon', color:'#24B85F'},
            {id:'heptagon', en:'Heptagon', ms:'Heptagon', color:'#F06A18'},
            {id:'octagon', en:'Octagon', ms:'Oktagon', color:'#E83E45'},
            {id:'nonagon', en:'Nonagon', ms:'Nonagon', color:'#247FDB'},
            {id:'parallelogram', en:'Parallelogram', ms:'Segi Empat Selari', color:'#8A45D1'},
            {id:'trapezium', en:'Trapezium', ms:'Trapezium', color:'#159E91'}
        ];

        function shapeShuffle(arr){ return [...arr].sort(()=>Math.random()-.5); }
        function shapeText(s){ return currentGlobalLang === 'ms' ? s.ms : s.en; }

        function shapePoints(id){
            const p = {
                square:'20,20 80,20 80,80 20,80',
                rectangle:'10,28 90,28 90,72 10,72',
                triangle:'50,10 90,85 10,85',
                rhombus:'50,8 88,50 50,92 12,50',
                pentagon:'50,7 92,38 76,88 24,88 8,38',
                hexagon:'25,10 75,10 95,50 75,90 25,90 5,50',
                heptagon:'50,5 85,22 96,58 72,91 28,91 4,58 15,22',
                octagon:'30,6 70,6 94,30 94,70 70,94 30,94 6,70 6,30',
                nonagon:'50,4 79,15 96,40 90,70 67,91 35,94 10,76 3,45 20,18',
                parallelogram:'27,22 92,22 73,78 8,78',
                trapezium:'28,22 72,22 92,80 8,80'
            };
            return p[id] || '';
        }

        function shapeSvg(item, bw=false, extraClass=''){
            const fill = bw ? '#555555' : item.color;
            const stroke = 'none';
            if(item.id === 'circle'){
                return `<svg class="shape-svg ${bw?'bw':''} ${extraClass}" viewBox="0 0 100 100" aria-hidden="true"><circle class="shape-fill" cx="50" cy="50" r="38" fill="${fill}" stroke="${stroke}" stroke-width="0"/></svg>`;
            }
            if(item.id === 'oval'){
                return `<svg class="shape-svg ${bw?'bw':''} ${extraClass}" viewBox="0 0 100 100" aria-hidden="true"><ellipse class="shape-fill" cx="50" cy="50" rx="43" ry="29" fill="${fill}" stroke="${stroke}" stroke-width="0"/></svg>`;
            }
            if(item.id === 'star'){
                return `<svg class="shape-svg ${bw?'bw':''} ${extraClass}" viewBox="0 0 100 100" aria-hidden="true"><polygon class="shape-fill" points="50,5 61,36 95,36 68,56 78,90 50,70 22,90 32,56 5,36 39,36" fill="${fill}" stroke="${stroke}" stroke-width="0" stroke-linejoin="round"/></svg>`;
            }
            if(item.id === 'heart'){
                return `<svg class="shape-svg ${bw?'bw':''} ${extraClass}" viewBox="0 0 100 100" aria-hidden="true"><path class="shape-fill" d="M50 88 C42 78 12 61 12 34 C12 16 34 8 50 27 C66 8 88 16 88 34 C88 61 58 78 50 88 Z" fill="${fill}" stroke="${stroke}" stroke-width="0" stroke-linejoin="round"/></svg>`;
            }
            return `<svg class="shape-svg ${bw?'bw':''} ${extraClass}" viewBox="0 0 100 100" aria-hidden="true"><polygon class="shape-fill" points="${shapePoints(item.id)}" fill="${fill}" stroke="${stroke}" stroke-width="0" stroke-linejoin="round"/></svg>`;
        }

        function openShapeMenu(){
            updateShapeLanguage();
            showScreen('shape-menu-screen');
        }

        function updateShapeLanguage(){
            const ms = currentGlobalLang === 'ms';
            const text = {
                'shape-menu-title': ms ? 'Modul Bentuk 🔷' : 'Shape Module 🔷',
                'shape-menu-desc': ms ? 'Pilih aktiviti bentuk yang menyeronokkan!' : 'Choose a fun shape activity!',
                'shape-menu-home-btn': ms ? 'Back to Home 🏠' : 'Back to Home 🏠',
                'learn-shape-title': ms ? 'Belajar Bentuk 🔷' : 'Learn the Shape 🔷',
                'shape-learn-listen': ms ? '🔊 Dengar' : '🔊 Listen',
                'shape-learn-prev': ms ? '⬅ Prev' : '⬅ Prev',
                'shape-learn-back': ms ? 'Back ↩️' : 'Back ↩️',
                'shape-learn-next': ms ? 'Next ➡' : 'Next ➡',
                'match-shape-title': ms ? 'Suaikan Bentuk 🔷' : 'Match the Shape 🔷',
                'match-shape-instruction': ms ? 'Suaikan nama bentuk dengan bentuk yang betul.' : 'Match each shape name with the correct shape.',
                'match-shape-round-label': ms ? 'Set' : 'Set',
                'match-shape-score-label': ms ? 'Skor' : 'Score',
                'match-shape-next': ms ? 'Next Set ➡' : 'Next Set ➡',
                'match-shape-back': ms ? 'Back ↩️' : 'Back ↩️',
                'draw-shape-title': ms ? 'Lukis Bentuk ✏️' : 'Draw the Shape ✏️',
                'draw-shape-desc': ms ? 'Trace garisan bertitik menggunakan jari atau tetikus.' : 'Trace the dotted shape with your finger or mouse.',
                'shape-trace-prev': ms ? '⬅ Prev' : '⬅ Previous',
                'shape-trace-next': ms ? 'Next ➡' : 'Next ➡',
                'shape-trace-clear': ms ? '🧽 Padam' : '🧽 Clear',
                'shape-draw-back': ms ? 'Back to Shape 🔷' : 'Back to Shape 🔷',
                'match-me-title': ms ? 'Suaikan Saya 🎨' : 'Match Me 🎨',
                'match-me-instruction': ms ? 'Suaikan bentuk berwarna dengan bentuk hitam putih yang sama.' : 'Match the coloured shape with the same black-and-white shape.',
                'match-me-round-label': ms ? 'Set' : 'Set',
                'match-me-score-label': ms ? 'Skor' : 'Score',
                'match-me-next': ms ? 'Next Set ➡' : 'Next Set ➡',
                'match-me-back': ms ? 'Back ↩️' : 'Back ↩️'
            };
            Object.entries(text).forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.innerText=val; });
            if(document.getElementById('learn-shape-screen')?.classList.contains('active')) renderLearnShape();
            if(document.getElementById('draw-shape-screen')?.classList.contains('active')) renderTraceShape();
            if(document.getElementById('match-shape-screen')?.classList.contains('active') && matchShapeSets.length) renderMatchShapeSet(false);
        }

        // ---------- Learn the Shape ----------
        let learnShapeIndex = 0;
        function startLearnShape(){
            learnShapeIndex = 0;
            showScreen('learn-shape-screen');
            updateShapeLanguage();
            renderLearnShape();
            setTimeout(speakCurrentShape,150);
        }
        function renderLearnShape(){
            const item = shapeDatabase[learnShapeIndex];
            if(!item) return;
            document.getElementById('shape-learn-visual').innerHTML = shapeSvg(item,false);
            document.getElementById('shape-learn-name').innerText = shapeText(item);
            document.getElementById('learn-shape-progress').innerText = `${currentGlobalLang==='ms'?'Bentuk':'Shape'} ${learnShapeIndex+1} / ${shapeDatabase.length}`;
        }
        function speakShapeItem(item){
            if(!item || !('speechSynthesis' in window)) return;
            speechSynthesis.cancel();
            const u=new SpeechSynthesisUtterance(shapeText(item));
            u.lang=currentGlobalLang==='ms'?'ms-MY':'en-US';
            u.rate=.55;
            speechSynthesis.speak(u);
        }
        function speakCurrentShape(){
            speakShapeItem(shapeDatabase[learnShapeIndex]);
        }
        function nextShape(){ learnShapeIndex=(learnShapeIndex+1)%shapeDatabase.length; renderLearnShape(); speakCurrentShape(); }
        function prevShape(){ learnShapeIndex=(learnShapeIndex-1+shapeDatabase.length)%shapeDatabase.length; renderLearnShape(); speakCurrentShape(); }

        // ---------- Shared pointer-line matcher ----------
        function createShapeMatcher(cfg){
            const state={drag:null,lines:[],matched:0,ready:false};
            function elements(){
                return {
                    wrap:document.getElementById(cfg.wrapperId),
                    canvas:document.getElementById(cfg.canvasId)
                };
            }
            function point(el,wrap){
                const r=el.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
                return {x:r.left+r.width/2-wr.left,y:r.top+r.height/2-wr.top};
            }
            function draw(tempPoint=null){
                const {wrap,canvas}=elements(); if(!wrap||!canvas)return;
                const dpr=Math.max(1,window.devicePixelRatio||1), w=wrap.clientWidth,h=wrap.clientHeight;
                if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
                    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
                    canvas.style.width=w+'px';canvas.style.height=h+'px';
                }
                const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
                if(cfg.useRope!==false)syncMatchingEyelets(wrap);
                state.lines.forEach(line=>{
                    const a=document.querySelector(`#${cfg.leftId} .shape-match-item[data-key="${line.key}"]`);
                    const b=document.querySelector(`#${cfg.rightId} .shape-match-item[data-key="${line.key}"]`);
                    if(a&&b){
                        const p1=point(a,wrap),p2=point(b,wrap);
                        if(cfg.useRope!==false)drawMatchingRope(ctx,p1,p2,a,b);
                        else {ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.strokeStyle='#5E17EB';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke()}
                    }
                });
                if(state.drag&&tempPoint){
                    const p1=point(state.drag,wrap);
                    if(cfg.useRope!==false)drawMatchingRope(ctx,p1,tempPoint,state.drag,null);
                    else {ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(tempPoint.x,tempPoint.y);ctx.strokeStyle='#FF66C4';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke()}
                }
            }
            function pos(e,wrap){const r=wrap.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
            function down(e){
                if(e.target.closest('.shape-match-audio-btn'))return;
                const item=matchItemAtPointer(e,elements().wrap,'.shape-match-item[data-side]');
                if(!item||item.classList.contains('matched')||!item.dataset.side)return;
                beginMatchTouch(e);state.drag=item;item.classList.add('selected');draw(pos(e,elements().wrap));
            }
            function move(e){if(!state.drag)return;e.preventDefault();draw(pos(e,elements().wrap));}
            function up(e){
                if(!state.drag)return;e.preventDefault();
                const left=state.drag;left.classList.remove('selected');
                const target=matchItemAtPointer(e,elements().wrap,'.shape-match-item[data-side]',true);
                if(target&&target.dataset.side!==left.dataset.side&&!target.classList.contains('matched')&&target.dataset.key===left.dataset.key){
                    left.classList.add('matched');target.classList.add('matched');
                    state.lines.push({key:left.dataset.key});state.matched++;
                    if(typeof playCorrectSound==='function')playCorrectSound();
                    if(cfg.onMatch)cfg.onMatch(state.matched);
                    if(state.matched>=4 && cfg.onComplete)cfg.onComplete();
                }else if(target&&target.dataset.side!==left.dataset.side&&!target.classList.contains('matched')){
                    if(typeof playWrongSound==='function')playWrongSound();
                }
                state.drag=null;draw();
            }
            function init(){
                const {wrap}=elements();if(!wrap||state.ready)return;
                state.ready=true;
                wrap.addEventListener('pointerdown',down,{passive:false});
                wrap.addEventListener('pointermove',move,{passive:false});
                wrap.addEventListener('pointerup',up,{passive:false});
                wrap.addEventListener('pointercancel',up,{passive:false});
                window.addEventListener('resize',()=>setTimeout(()=>draw(),50));
            }
            function reset(){state.drag=null;state.lines=[];state.matched=0;setTimeout(()=>draw(),30);}
            return {init,reset,draw,state};
        }

        // ---------- Match the Shape: 5 random sets, 4 pairs/set ----------
        let matchShapeSets=[],matchShapeSetIndex=0,matchShapeScore=0;
        const matchShapeMatcher=createShapeMatcher({
            wrapperId:'match-shape-wrapper',canvasId:'match-shape-canvas',
            leftId:'match-shape-left',rightId:'match-shape-right',
            onMatch:()=>{matchShapeScore+=10;document.getElementById('match-shape-score').innerText=matchShapeScore;},
            // Bila semua 4 pasangan betul, terus bergerak ke set seterusnya tanpa tekan Next.
            onComplete:()=>{
                document.getElementById('match-shape-next').style.display='none';
                setTimeout(()=>nextMatchShapeSet(),650);
            }
        });

        function buildFiveShapeSets(){
            const result=[];
            let pool=shapeShuffle(shapeDatabase);
            for(let i=0;i<5;i++){
                if(pool.length<4)pool=shapeShuffle(shapeDatabase);
                const four=pool.splice(0,4);
                result.push(four);
            }
            return result;
        }
        function startMatchShape(){
            matchShapeSets=buildFiveShapeSets();matchShapeSetIndex=0;matchShapeScore=0;
            showScreen('match-shape-screen');updateShapeLanguage();matchShapeMatcher.init();renderMatchShapeSet(true);
        }
        function renderMatchShapeSet(reset=true){
            if(reset)matchShapeMatcher.reset();
            const items=matchShapeSets[matchShapeSetIndex]||[];
            document.getElementById('match-shape-round').innerText=matchShapeSetIndex+1;
            document.getElementById('match-shape-score').innerText=matchShapeScore;
            document.getElementById('match-shape-next').style.display='none';
            const l=document.getElementById('match-shape-left'),r=document.getElementById('match-shape-right');
            l.innerHTML='';r.innerHTML='';
            shapeShuffle(items).forEach(item=>{
                const d=document.createElement('div');
                d.className='shape-match-item'; d.dataset.key=item.id; d.dataset.side='left';
                const name=shapeText(item);
                d.innerHTML=`<span class="match-shape-name">${name}</span><button type="button" class="shape-match-audio-btn" aria-label="${currentGlobalLang==='ms'?'Dengar':'Listen'} ${name}" title="Listen / Dengar">🔊</button>`;
                const audioBtn=d.querySelector('.shape-match-audio-btn');
                bindMatchingAudio(audioBtn,()=>speakShapeItem(item));
                l.appendChild(d);
            });
            shapeShuffle(items).forEach(item=>{
                const d=document.createElement('div');d.className='shape-match-item';d.dataset.key=item.id;d.dataset.side='right';
                d.innerHTML=`<div class="shape-mini">${shapeSvg(item,false,'no-shadow')}</div>`;r.appendChild(d);
            });
            setTimeout(()=>matchShapeMatcher.draw(),80);
        }
        function nextMatchShapeSet(){
            if(matchShapeSetIndex<4){matchShapeSetIndex++;renderMatchShapeSet(true);}
            else{
                if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Suaikan Bentuk':'Match the Shape',100);
                alert(currentGlobalLang==='ms'?'Tahniah! Anda telah lengkapkan semua set! 🎉':'Congratulations! You completed all sets! 🎉');
                openShapeMenu();
            }
        }

        // ---------- Draw the Shape / tracing ----------
        let shapeTraceIndex=0,shapeTraceDrawing=false,shapeTraceLast=null;
        function startDrawShape(){
            shapeTraceIndex=0;showScreen('draw-shape-screen');updateShapeLanguage();
            requestAnimationFrame(()=>{setupShapeTraceCanvases();renderTraceShape();});
        }
        function setupShapeTraceCanvases(){
            const wrap=document.getElementById('shape-trace-canvas-wrap'),g=document.getElementById('shape-trace-guide'),d=document.getElementById('shape-trace-draw');
            if(!wrap||!g||!d)return;
            const rect=wrap.getBoundingClientRect(),dpr=Math.max(1,devicePixelRatio||1);
            [g,d].forEach(c=>{c.width=Math.round(rect.width*dpr);c.height=Math.round(rect.height*dpr);c.style.width=rect.width+'px';c.style.height=rect.height+'px';c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);});
            attachShapeTraceEvents();
        }
        function traceShapePath(ctx,id,w,h){
            const side=Math.min(w,h)*0.82;
            const ox=(w-side)/2, oy=(h-side)/2;
            const X=v=>ox+(v/100)*side, Y=v=>oy+(v/100)*side;
            const cx=X(50), cy=Y(50);
            ctx.beginPath();
            if(id==='circle'){
                ctx.arc(cx,cy,side*.38,0,Math.PI*2);
            } else if(id==='oval'){
                ctx.ellipse(cx,cy,side*.43,side*.29,0,0,Math.PI*2);
            } else if(id==='heart'){
                ctx.moveTo(X(50),Y(88));
                ctx.bezierCurveTo(X(42),Y(78),X(12),Y(61),X(12),Y(34));
                ctx.bezierCurveTo(X(12),Y(16),X(34),Y(8),X(50),Y(27));
                ctx.bezierCurveTo(X(66),Y(8),X(88),Y(16),X(88),Y(34));
                ctx.bezierCurveTo(X(88),Y(61),X(58),Y(78),X(50),Y(88));
            } else {
                const map={
                    square:[[20,20],[80,20],[80,80],[20,80]],
                    rectangle:[[10,28],[90,28],[90,72],[10,72]],
                    triangle:[[50,10],[90,85],[10,85]],
                    rhombus:[[50,8],[88,50],[50,92],[12,50]],
                    pentagon:[[50,7],[92,38],[76,88],[24,88],[8,38]],
                    hexagon:[[25,10],[75,10],[95,50],[75,90],[25,90],[5,50]],
                    heptagon:[[50,5],[85,22],[96,58],[72,91],[28,91],[4,58],[15,22]],
                    octagon:[[30,6],[70,6],[94,30],[94,70],[70,94],[30,94],[6,70],[6,30]],
                    nonagon:[[50,4],[79,15],[96,40],[90,70],[67,91],[35,94],[10,76],[3,45],[20,18]],
                    parallelogram:[[27,22],[92,22],[73,78],[8,78]],
                    trapezium:[[28,22],[72,22],[92,80],[8,80]],
                    star:[[50,5],[61,36],[95,36],[68,56],[78,90],[50,70],[22,90],[32,56],[5,36],[39,36]]
                };
                const pts=map[id]||map.square;
                ctx.moveTo(X(pts[0][0]),Y(pts[0][1]));
                for(let i=1;i<pts.length;i++) ctx.lineTo(X(pts[i][0]),Y(pts[i][1]));
                ctx.closePath();
            }
            ctx.stroke();
        }
        function renderTraceShape(){
            const item=shapeDatabase[shapeTraceIndex],wrap=document.getElementById('shape-trace-canvas-wrap'),guide=document.getElementById('shape-trace-guide');
            if(!item||!wrap||!guide)return;
            const ctx=guide.getContext('2d'),w=wrap.clientWidth,h=wrap.clientHeight;ctx.clearRect(0,0,w,h);
            ctx.save();ctx.strokeStyle='#111';ctx.lineWidth=Math.max(5,Math.min(w,h)*.014);ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([1,Math.max(10,Math.min(w,h)*.035)]);
            traceShapePath(ctx,item.id,w,h);ctx.restore();
            document.getElementById('shape-trace-name').innerText=shapeText(item);
            document.getElementById('shape-trace-progress').innerText=`${shapeTraceIndex+1} / ${shapeDatabase.length}`;
        }
        function shapeTracePoint(e){const c=document.getElementById('shape-trace-draw'),r=c.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
        function attachShapeTraceEvents(){
            const c=document.getElementById('shape-trace-draw');if(!c||c.dataset.ready==='1')return;c.dataset.ready='1';
            c.addEventListener('pointerdown',e=>{e.preventDefault();shapeTraceDrawing=true;shapeTraceLast=shapeTracePoint(e);try{c.setPointerCapture(e.pointerId)}catch(_){}} ,{passive:false});
            c.addEventListener('pointermove',e=>{if(!shapeTraceDrawing)return;e.preventDefault();const p=shapeTracePoint(e),ctx=c.getContext('2d');ctx.beginPath();ctx.moveTo(shapeTraceLast.x,shapeTraceLast.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle='#5E17EB';ctx.lineWidth=Math.max(10,c.getBoundingClientRect().width*.025);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();shapeTraceLast=p;},{passive:false});
            const end=e=>{if(!shapeTraceDrawing)return;e.preventDefault();shapeTraceDrawing=false;shapeTraceLast=null;};
            c.addEventListener('pointerup',end,{passive:false});c.addEventListener('pointercancel',end,{passive:false});
        }
        function clearShapeTraceDrawing(withSound=true){if(withSound)playClickSound();const c=document.getElementById('shape-trace-draw'),w=document.getElementById('shape-trace-canvas-wrap');if(c&&w)c.getContext('2d').clearRect(0,0,w.clientWidth,w.clientHeight);shapeTraceDrawing=false;shapeTraceLast=null;}
        function previousTraceShape(){playClickSound();shapeTraceIndex=(shapeTraceIndex-1+shapeDatabase.length)%shapeDatabase.length;clearShapeTraceDrawing(false);renderTraceShape();}
        function nextTraceShape(){playClickSound();shapeTraceIndex=(shapeTraceIndex+1)%shapeDatabase.length;clearShapeTraceDrawing(false);renderTraceShape();}
        window.addEventListener('resize',()=>{
            if(document.getElementById('draw-shape-screen')?.classList.contains('active')){
                clearTimeout(window.__shapeTraceResizeTimer);
                window.__shapeTraceResizeTimer=setTimeout(()=>{setupShapeTraceCanvases();clearShapeTraceDrawing(false);renderTraceShape();},100);
            }
        });

        // ---------- Match Me: coloured shape -> same B&W shape ----------
        let matchMeSets=[],matchMeIndex=0,matchMeScore=0;
        const matchMeMatcher=createShapeMatcher({
            wrapperId:'match-me-wrapper',canvasId:'match-me-canvas',
            useRope:false,
            leftId:'match-me-left',rightId:'match-me-right',
            onMatch:()=>{matchMeScore+=10;document.getElementById('match-me-score').innerText=matchMeScore;},
            onComplete:()=>{
                document.getElementById('match-me-next').style.display='none';
                setTimeout(()=>nextMatchMeSet(),650);
            }
        });
        function startMatchMe(){
            matchMeSets=buildFiveShapeSets();matchMeIndex=0;matchMeScore=0;
            showScreen('match-me-screen');updateShapeLanguage();matchMeMatcher.init();renderMatchMeSet();
        }
        function renderMatchMeSet(){
            matchMeMatcher.reset();
            const items=matchMeSets[matchMeIndex]||[];
            document.getElementById('match-me-round').innerText=matchMeIndex+1;
            document.getElementById('match-me-score').innerText=matchMeScore;
            document.getElementById('match-me-next').style.display='none';
            const l=document.getElementById('match-me-left'),r=document.getElementById('match-me-right');l.innerHTML='';r.innerHTML='';
            shapeShuffle(items).forEach(item=>{const d=document.createElement('div');d.className='shape-match-item';d.dataset.key=item.id;d.dataset.side='left';d.innerHTML=`<div class="shape-mini">${shapeSvg(item,false,'no-shadow')}</div>`;l.appendChild(d);});
            shapeShuffle(items).forEach(item=>{const d=document.createElement('div');d.className='shape-match-item';d.dataset.key=item.id;d.dataset.side='right';d.innerHTML=`<div class="shape-mini">${shapeSvg(item,true,'no-shadow')}</div>`;r.appendChild(d);});
            setTimeout(()=>matchMeMatcher.draw(),80);
        }
        function nextMatchMeSet(){
            if(matchMeIndex<4){matchMeIndex++;renderMatchMeSet();}
            else{
                if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Suaikan Saya':'Match Me',100);
                alert(currentGlobalLang==='ms'?'Tahniah! Anda telah lengkapkan semua set! 🎉':'Congratulations! You completed all sets! 🎉');
                openShapeMenu();
            }
        }


        window.addEventListener('click', enableAutoplayOnFirstTouch);
        window.addEventListener('touchstart', enableAutoplayOnFirstTouch);


        // =========================================================
        // FOOD MODULE
        // =========================================================
        const foodDatabase = [
            {id:'apple',cat:'fruit',en:'Apple',bm:'Epal',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWL3sFXC3SBeJmdXgdd7xyapAAEWBbNcPvjZ625iHV_g&s=10'},
            {id:'banana',cat:'fruit',en:'Banana',bm:'Pisang',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9stY-In-DVwLLzyyVuGzH16gmGKRj2mzkYqJApytapg&s=10'},
            {id:'Guava',cat:'fruit',en:'Guava',bm:'Jambu Batu',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPaCjY8CZnUDwcY1FX84WmrNQUR71EwWhS8MEsuW4JMw&s=10'},
            {id:'Kiwi',cat:'fruit',en:'Kiwi',bm:'Kiwi',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQXzje-uhtMJCLqHLhx8gGLJhSdwpZvyqAI-AltJPdk7A&s=10'},
            {id:'orange',cat:'fruit',en:'Orange',bm:'Oren',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQW5B8jGwTWNPMkuQ73Pvz2dj_rDsfqoCSis0IrQCCvZg&s=10'},
            {id:'mango',cat:'fruit',en:'Mango',bm:'Mangga',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZkSYIfz4foZGSsM5KXABVoyD0L8UDu72YO1Z-3jiZqw&s=10'},
            {id:'watermelon',cat:'fruit',en:'Watermelon',bm:'Tembikai',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_n_gTx2LY9rTdXti6r0z9nSlQq4Qyg2iMQTroXDnibg&s=10'},
            {id:'grape',cat:'fruit',en:'Grapes',bm:'Anggur',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTTlLGT0vjF8E8wvKKdv8814mSQGCyqGXugaVV7_KFWg&s=10'},
            {id:'pineapple',cat:'fruit',en:'Pineapple',bm:'Nanas',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQKeZa_kQkqZRUcYOp3GNbW5qSNXbHzgNw-ExGE1Yo3zA&s=10'},
            {id:'strawberry',cat:'fruit',en:'Strawberry',bm:'Strawberi',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRpeGRBbN4f4cCRJDj8pw_3BUhRge24rJTv5aNLlxtjpg&s=10'},
            {id:'papaya',cat:'fruit',en:'Papaya',bm:'Betik',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQybs2ESWlsnP9eiBp4YtWtObike9lWpGTiYufwVh_uBw&s=10'},
            {id:'dragonfruit',cat:'fruit',en:'Dragon Fruit',bm:'Buah Naga',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_NquXhNqE7u_4I-VVEhzB8iU2a2neMpVUWDbYasBXgA&s=10'},
            {id:'carrot',cat:'vegetable',en:'Carrot',bm:'Lobak Merah',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRPVSIq6x0Lj9_nDxfM5eg7nWVeKr0GlNAmtSzVcXzbFg&s=10'},
            {id:'broccoli',cat:'vegetable',en:'Broccoli',bm:'Brokoli',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSrMtvKcttPwI5KVZsLrk_9xJGQJQTv-fhIQBJeo1IdnQ&s=10'},
            {id:'cabbage',cat:'vegetable',en:'Cabbage',bm:'Kubis',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQJiM_wGjkHKAV7bVNJ0mrL-dxZsyjtd2BSt9-rLdr4Q&s=10'},
            {id:'spinach',cat:'vegetable',en:'Spinach',bm:'Bayam',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRtUUgyDfZWL_vaRoa3Pp4G-1Q8qH-gA7ZyqPGhMzQeVA&s=10'},
            {id:'cucumber',cat:'vegetable',en:'Cucumber',bm:'Timun',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQoQKyuNjnAYiPJ9nU_OqFHWLuOiVfH_IIy2t57FF4Cg&s=10'},
            {id:'eggplant',cat:'vegetable',en:'Eggplant',bm:'Terung',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcShM8U7LyywoD8cXoR76MkIzxAREuPiX6457CbWEkOAMA&s=10'},
            {id:'cauliflower',cat:'vegetable',en:'Cauliflower',bm:'Kubis Bunga',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRzHExjub_8M8pF-Znklhbk91prUEvlZjlZSrrJp6x2JA&s=10'},
            {id:'pumpkin',cat:'vegetable',en:'Pumpkin',bm:'Labu',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwHaxeWFfFqxdjiU1L1pWReL-EmW54-3-mlwizSgP31w&s=10'},
            {id:'corn',cat:'vegetable',en:'Corn',bm:'Jagung',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDPLoiudSgL2NqL_ZfG2uSB1fv9W6SYttviGGhYEYvxQ&s=10'},
            {id:'okra',cat:'vegetable',en:'Okra',bm:'Bendi',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRyCZl_6-TZ5wwMZjKHQDtNsSJW8SgBkTKrdkP7QI1U1g&s=10'},
            {id:'tomato',cat:'vegetable',en:'Tomato',bm:'Tomato',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTq_gE0KSjPPQ9-ucTIOnM7ZzVLI9Hx-_XWERQHYtnbHQ&s=10'},


            {id:'Potato',cat:'vegetable',en:'Potato',bm:'Kentang',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTI0pVme6fnWEDb3DE4eu1vH1iMMMgyr-e7coDi4cwh6w&s=10'},
            {id:'onion',cat:'vegetable',en:'Onion',bm:'Bawang',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTDlRCLXdLoW5TX40tSJh8k9_uBEyPt3aUOwAzXjFt4gg&s=10'},
            {id:'Green beans',cat:'vegetable',en:'Green Beans',bm:'Kacang Buncis',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8ksoeA5OdZSGajP87N1YeDAm1Pec7Arsg4RzK8IJ4wQ&s=10'},
            {id:'Bell pepper',cat:'vegetable',en:'Bell Pepper',bm:'Lada Benggala',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEoE85AOx_u3sECK67Upl5__WCCDxarosrbU0U6tyDKQ&s=10'}
        ];
        const foodShuffle = arr => [...arr].sort(()=>Math.random()-.5);
        const foodName = item => currentGlobalLang==='ms' ? item.bm : item.en;
        let currentFoodCategory='fruit', currentLearnFoodList=[], currentLearnFoodIdx=0;

        function openFoodMenu(){ updateFoodLanguage(); showScreen('food-menu-screen'); }
        function updateFoodLanguage(){
            const ms=currentGlobalLang==='ms';
            const map={
                'food-menu-title':ms?'Modul Makanan 🍎🥕':'Food Module 🍎🥕',
                'food-menu-desc':ms?'Pilih aktiviti makanan yang menyeronokkan!':'Choose a fun food activity!',
                'food-menu-home-btn':'Back to Home 🏠',
                'learn-food-listen':ms?'🔊 Dengar':'🔊 Listen',
                'learn-food-back':'Back ↩️',
                'sort-food-title':ms?'Buah atau Sayur? 🍎🥕':'Fruit or Vegetable? 🍎🥕',
                'sort-food-desc':ms?'Seret semua 4 gambar sebenar ke dalam kotak yang betul.':'Drag all 4 real pictures into the correct box.',
                'sort-food-set-label':'Set','sort-food-left-label':ms?'Baki':'Left',
                'food-zone-fruit':ms?'🍎 Buah':'🍎 Fruit',
                'food-zone-vegetable':ms?'🥕 Sayur':'🥕 Vegetable',
                'sort-food-back':'Back ↩️'
            };
            Object.entries(map).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.innerText=value;});
            if(document.getElementById('learn-food-screen')?.classList.contains('active')) renderFoodFlashcard(false);
        }
        function startLearnFood(cat){
            currentFoodCategory=cat;currentLearnFoodList=foodDatabase.filter(x=>x.cat===cat);currentLearnFoodIdx=0;
            showScreen('learn-food-screen');updateFoodLanguage();renderFoodFlashcard(true);
        }
        function renderFoodFlashcard(speak=false){
            const item=currentLearnFoodList[currentLearnFoodIdx];if(!item)return;
            const ms=currentGlobalLang==='ms', fruit=currentFoodCategory==='fruit';
            document.getElementById('learn-food-title').innerText=fruit?(ms?'Belajar Buah 🍎':'Learn Fruit 🍎'):(ms?'Belajar Sayur 🥕':'Learn Vegetable 🥕');
            document.getElementById('learn-food-progress').innerText=`${fruit?(ms?'Buah':'Fruit'):(ms?'Sayur':'Vegetable')} ${currentLearnFoodIdx+1} ${ms?'daripada':'of'} ${currentLearnFoodList.length}`;
            const image=document.getElementById('learn-food-image');image.src=item.img;image.alt=foodName(item);
            document.getElementById('learn-food-name-bm').innerText=item.bm;document.getElementById('learn-food-name-en').innerText=item.en;
            document.getElementById('prev-food-btn').style.display=currentLearnFoodIdx===0?'none':'inline-block';
            document.getElementById('next-food-btn').innerText=currentLearnFoodIdx===currentLearnFoodList.length-1?(ms?'Tamat 🏁':'Finish 🏁'):'Next ➡';
            if(speak)setTimeout(playFoodSound,120);
        }
        function playFoodSound(){
            const item=currentLearnFoodList[currentLearnFoodIdx];if(!item||!('speechSynthesis'in window))return;
            speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(foodName(item));u.lang=currentGlobalLang==='ms'?'ms-MY':'en-US';u.rate=.72;speechSynthesis.speak(u);
        }
        function prevFoodFlash(){if(currentLearnFoodIdx>0){currentLearnFoodIdx--;renderFoodFlashcard(true);}}
        function nextFoodFlash(){
            if(currentLearnFoodIdx<currentLearnFoodList.length-1){currentLearnFoodIdx++;renderFoodFlashcard(true);}
            else{alert(currentGlobalLang==='ms'?'Syabas! Anda telah tamat belajar topik ini! 🎉':'Great job! You completed this topic! 🎉');openFoodMenu();}
        }

        let sortFoodSets=[],sortFoodSetIndex=0,selectedFoodSortId=null,foodSortDrag=null,foodSortFloat=null;
        function startSortFood(){
            // Six pictures per set: three fruits and three vegetables, like Sort the Transport.
            const pools=Object.fromEntries(['fruit','vegetable'].map(cat=>[cat,foodShuffle(foodDatabase.filter(item=>item.cat===cat))]));
            sortFoodSets=Array.from({length:5},()=>foodShuffle(['fruit','vegetable'].flatMap(cat=>{
                if(pools[cat].length<3)pools[cat]=foodShuffle(foodDatabase.filter(item=>item.cat===cat));
                return pools[cat].splice(0,3);
            })));
            sortFoodSetIndex=0;showScreen('sort-food-screen');updateFoodLanguage();setupFoodSortZones();renderFoodSortSet();
        }
        function setupFoodSortZones(){
            document.querySelectorAll('.food-sort-zone').forEach(zone=>{if(zone.dataset.ready==='1')return;zone.dataset.ready='1';
                zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
                zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
                zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');attemptFoodSortDrop(e.dataTransfer.getData('text/plain')||selectedFoodSortId,zone.dataset.cat);});
                zone.addEventListener('click',()=>{if(selectedFoodSortId)attemptFoodSortDrop(selectedFoodSortId,zone.dataset.cat);});
            });
        }
        function renderFoodSortSet(){
            selectedFoodSortId=null;const set=sortFoodSets[sortFoodSetIndex]||[],bank=document.getElementById('food-sort-bank');bank.innerHTML='';
            document.querySelectorAll('.food-sort-zone .transport-zone-items').forEach(x=>x.innerHTML='');
            document.getElementById('sort-food-feedback').innerText='';document.getElementById('sort-food-set').innerText=sortFoodSetIndex+1;document.getElementById('sort-food-left').innerText=set.length;
            set.forEach(item=>bank.appendChild(makeFoodSortItem(item)));
            updateSortAnswerBoxSize('sort-food-screen','food-sort-bank');
        }
        function makeFoodSortItem(item){
            const node=document.createElement('div');node.className='transport-sort-item food-sort-item';node.dataset.id=item.id;node.draggable=true;node.title=foodName(item);
            const img=document.createElement('img');img.src=item.img;img.alt=foodName(item);img.referrerPolicy='no-referrer';node.appendChild(img);
            node.addEventListener('dragstart',e=>{selectedFoodSortId=item.id;e.dataTransfer.setData('text/plain',item.id);setTimeout(()=>node.classList.add('selected'),0);});
            node.addEventListener('dragend',()=>node.classList.remove('selected'));
            node.addEventListener('click',()=>{document.querySelectorAll('.food-sort-item').forEach(x=>x.classList.remove('selected'));selectedFoodSortId=item.id;node.classList.add('selected');});
            installFoodPointerDrag(node,item);return node;
        }
        function clearFoodHighlights(){document.querySelectorAll('.food-sort-zone.drag-over').forEach(z=>z.classList.remove('drag-over'));}
        function cleanupFoodDrag(){clearFoodHighlights();foodSortDrag?.node?.classList.remove('dragging');foodSortFloat?.remove();foodSortDrag=null;foodSortFloat=null;}
        function installFoodPointerDrag(node,item){
            node.onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();selectedFoodSortId=item.id;node.setPointerCapture?.(e.pointerId);foodSortDrag={node,pointerId:e.pointerId};
                const r=node.getBoundingClientRect();foodSortFloat=document.createElement('div');foodSortFloat.className='transport-sort-floating';foodSortFloat.style.width=r.width+'px';foodSortFloat.style.height=r.height+'px';foodSortFloat.appendChild(node.querySelector('img').cloneNode(true));document.body.appendChild(foodSortFloat);moveFoodFloat(e);};
            node.onpointermove=e=>{if(foodSortDrag?.node!==node)return;e.preventDefault();moveFoodFloat(e);clearFoodHighlights();document.elementFromPoint(e.clientX,e.clientY)?.closest('.food-sort-zone')?.classList.add('drag-over');};
            node.onpointerup=e=>{if(foodSortDrag?.node!==node)return;e.preventDefault();const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('.food-sort-zone');cleanupFoodDrag();if(zone)attemptFoodSortDrop(item.id,zone.dataset.cat);};
            node.onpointercancel=cleanupFoodDrag;
        }
        function moveFoodFloat(e){if(foodSortFloat){foodSortFloat.style.left=e.clientX+'px';foodSortFloat.style.top=e.clientY+'px';}}
        function attemptFoodSortDrop(id,cat){
            const item=foodDatabase.find(x=>x.id===id),node=document.querySelector(`.food-sort-item[data-id="${id}"]`);if(!item||!node||!document.getElementById('food-sort-bank').contains(node))return;
            const fb=document.getElementById('sort-food-feedback');
            if(item.cat!==cat){fb.innerText=currentGlobalLang==='ms'?'Cuba lagi 😊 Pilih kotak yang betul.':'Try again 😊 Choose the correct box.';fb.style.color='#E53935';playWrongSound();return;}
            const thumb=document.createElement('div');thumb.className='transport-zone-thumb';const img=document.createElement('img');img.src=item.img;img.alt=foodName(item);thumb.appendChild(img);
            document.querySelector(`.food-sort-zone[data-cat="${cat}"] .transport-zone-items`).appendChild(thumb);node.remove();selectedFoodSortId=null;playCorrectSound();
            fb.innerText=currentGlobalLang==='ms'?'Betul! 🌟':'Correct! 🌟';fb.style.color='#2E7D32';const left=document.querySelectorAll('#food-sort-bank .food-sort-item').length;document.getElementById('sort-food-left').innerText=left;
            if(left===0){fb.innerText=currentGlobalLang==='ms'?'Hebat! Semua gambar sudah diasingkan. 🎉':'Great! All pictures are sorted. 🎉';if(sortFoodSetIndex<4)setTimeout(()=>{sortFoodSetIndex++;renderFoodSortSet();},700);else setTimeout(finishFoodSort,700);}
        }
        function finishFoodSort(){if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Buah atau Sayur':'Fruit or Vegetable',100);alert(currentGlobalLang==='ms'?'Tahniah! Anda telah lengkapkan semua 5 set! 🎉':'Congratulations! You completed all 5 sets! 🎉');openFoodMenu();}

        // =========================================================
        // TRANSPORT MODULE
        // =========================================================
        const transportDatabase = [
            {id:'car',cat:'land',en:'Car',bm:'Kereta',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQg-MOqudXFQpDEXKX3xhAOVpZvpO3O-06xZdSL1RiXmQ&s=10'},
            {id:'bus',cat:'land',en:'Bus',bm:'Bas',img:'https://upload.wikimedia.org/wikipedia/commons/8/84/LTZ1328-19-20241030-160332.jpg?utm_source=en.wikipedia.org&utm_campaign=index&utm_content=original'},
            {id:'train',cat:'land',en:'Train',bm:'Kereta Api',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCA5JFVd3eULL1V32-6A4dOfqzHgAHqyS2gorrXtuX5g&s=10'},
            {id:'truck',cat:'land',en:'Truck',bm:'Lori',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9J_z-v3faT6_8qRpputMPKDFpk0Mfk2E8hxSOu3jEcw&s=10'},
            {id:'bicycle',cat:'land',en:'Bicycle',bm:'Basikal',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsKDT3WucpPk5py_i4GW4zoIcgpasftNf9joHQfWclZw&s=10'},
            {id:'motorcycle',cat:'land',en:'Motorcycle',bm:'Motosikal',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDbtgo_GP8V2BUi-gVt1-w_7rgbRBjzIzEsjLicI12YQ&s=10'},
            {id:'taxi',cat:'land',en:'Taxi',bm:'Teksi',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHwOr_q7XgtTq-JS9bFkYFzLiAAZeiVKls-b9geAFJ2g&s=10'},
            {id:'tractor',cat:'land',en:'Tractor',bm:'Traktor',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWcJ8vaJG3x--PohI2cPDR8QZ-V7XGQFr9Mn-pgOjxHg&s=10'},
            {id:'van',cat:'land',en:'Van',bm:'Van',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUe_PL0q1WDP_qdYc3vdWTBGwfIvCt5mCMxJAZYsObLg&s=10'},

            {id:'aeroplane',cat:'air',en:'Aeroplane',bm:'Kapal Terbang',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPZBEfB-9su-5zlPTman59zkNViByrcuIHdzOKhc9aYg&s=10'},
            {id:'helicopter',cat:'air',en:'Helicopter',bm:'Helikopter',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSfpIF7UFhaZF8OEutkP3cj0-ZeVOR_e4mqCvTwuatHWQ&s=10'},
            {id:'balloon',cat:'air',en:'Hot Air Balloon',bm:'Belon Udara Panas',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkm0ptWuOnKney02JiCe1aSSEa63lCJLWob57cvy5USA&s=10'},
            {id:'jet',cat:'air',en:'Jet',bm:'Jet',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTo7VKh3J6B9ErgYUta7pK5W4fXiGd7ZcG4-u25BJEQYw&s=10'},
            {id:'seaplane',cat:'air',en:'Seaplane',bm:'Pesawat Laut',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQNozt2sNgl6U1V7iaYLCkBT5eeu2wxzk47bTpwi9AWHA&s=10'},
            {id:'rocket',cat:'air',en:'Rocket',bm:'Roket',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEc45Duldv_3GLkTEHyikhHboZXs-kzdA_oV_Nv8Q3Jg&s=10'},
            {id:'airship',cat:'air',en:'Airship',bm:'Kapal Udara',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpM5T2cKh2N6CioZT1ter8rOtC6JroL9ufWFtZAO5nlQ&s=10'},

            {id:'boat',cat:'water',en:'Boat',bm:'Bot',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQTGlxyePQ6poAGFoFjGQcDH3HteMe2z5CxbHflYKqryA&s=10'},
            {id:'ship',cat:'water',en:'Ship',bm:'Kapal',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSCs9cA0iX-AjAB-dcPxR8w281-547g3wp060sgNCp9Qg&s=10'},
            {id:'sailboat',cat:'water',en:'Sailboat',bm:'Bot Layar',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTk0iREXoqfC3XKCNRj22_qurYaIwG7wfQ5aJG4dXNE2A&s=10'},
            {id:'ferry',cat:'water',en:'Ferry',bm:'Feri',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTHJC4zl6395QQOU-VjxL8JoBK_V0dGGtQ6-QYNIEkLLA&s=10'},
            {id:'submarine',cat:'water',en:'Submarine',bm:'Kapal Selam',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRPz1VD74zPyStJ0SVK_Ii6Ss2I6QZ2k1UOeDQjgNB_gQ&s=10'},
            {id:'kayak',cat:'water',en:'Kayak',bm:'Kayak',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSd0S2VcgJ0zjLvDLl9vIBKXik4dN6ESX41popLNSPa3A&s=10'},
            {id:'yacht',cat:'water',en:'Yacht',bm:'Kapal Layar Mewah',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTc-7ZXL6L-nCMB8t8j8kQOFIL_q7TXnWy7SoBeVXuXXA&s=10'},
            {id:'speedboat',cat:'water',en:'Speedboat',bm:'Bot Laju',img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3ReqopNendcf1w5YEbT0waMpQCnibF4pQLZtxzsUofg&s=10'}
        ];

        const transportCategories = [
            {id:'land', icon:'🚗', en:'Land Transport', bm:'Pengangkutan Darat'},
            {id:'air', icon:'✈️', en:'Air Transport', bm:'Pengangkutan Udara'},
            {id:'water', icon:'🚢', en:'Water Transport', bm:'Pengangkutan Air'}
        ];
        const transportShuffle = arr => [...arr].sort(()=>Math.random()-.5);
        const transportName = item => currentGlobalLang === 'ms' ? item.bm : item.en;
        const transportCatName = cat => currentGlobalLang === 'ms' ? cat.bm : cat.en;

        function openTransportMenu(){
            updateTransportLanguage();
            showScreen('transport-menu-screen');
        }

        function updateTransportLanguage(){
            const ms = currentGlobalLang === 'ms';
            const map = {
                'transport-menu-title': ms ? 'Modul Pengangkutan 🚗' : 'Transport Module 🚗',
                'transport-menu-desc': ms ? 'Pilih aktiviti pengangkutan yang menyeronokkan!' : 'Choose a fun transport activity!',
                'transport-menu-home-btn': ms ? 'Back to Home 🏠' : 'Back to Home 🏠',
                'learn-transport-cat-title': ms ? 'Mari Belajar Pengangkutan 🚗✈️🚢' : "Let's Learn Transport 🚗✈️🚢",
                'learn-transport-cat-desc': ms ? 'Pilih kategori pengangkutan.' : 'Choose a transport category.',
                'learn-transport-cat-back': ms ? 'Back ↩️' : 'Back ↩️',
                'transport-flash-listen': ms ? '🔊 Dengar' : '🔊 Listen',
                'transport-flash-back': ms ? 'Back ↩️' : 'Back ↩️',
                'sort-transport-title': ms ? 'Asingkan Pengangkutan 🚗✈️🚢' : 'Sort the Transport 🚗✈️🚢',
                'sort-transport-desc': ms ? 'Seret semua 6 gambar kenderaan ke dalam kotak yang betul.' : 'Drag all 6 transport pictures into the correct box.',
                'sort-transport-set-label': ms ? 'Set' : 'Set',
                'sort-transport-left-label': ms ? 'Baki' : 'Left',
                'transport-zone-land': ms ? '🚗 Darat' : '🚗 Land',
                'transport-zone-air': ms ? '✈️ Udara' : '✈️ Air',
                'transport-zone-water': ms ? '🚢 Air' : '🚢 Water',
                'sort-transport-next': ms ? 'Next Set ➡' : 'Next Set ➡',
                'sort-transport-back': ms ? 'Back ↩️' : 'Back ↩️',
                'guess-transport-title': ms ? 'Teka Pengangkutan ✅' : 'Guess the Transport ✅',
                'guess-transport-desc': ms ? 'Lihat setiap gambar dan tandakan nama kenderaan yang betul.' : 'Look at each picture and tick the correct transport name.',
                'guess-transport-set-label': ms ? 'Set' : 'Set',
                'guess-transport-score-label': ms ? 'Skor' : 'Score',
                'guess-transport-next': ms ? 'Next Set ➡' : 'Next Set ➡',
                'guess-transport-back': ms ? 'Back ↩️' : 'Back ↩️'
            };
            Object.entries(map).forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.innerText=val; });
            if(document.getElementById('learn-transport-cat-screen')?.classList.contains('active')) renderTransportCategories();
            if(document.getElementById('learn-transport-flash-screen')?.classList.contains('active')) renderTransportFlashcard(false);
        }

        // ---------- Let's Learn Transport ----------
        let currentLearnTransportList = [];
        let currentLearnTransportIdx = 0;
        let currentTransportCategory = 'land';

        function openLearnTransportCategoryScreen(){
            renderTransportCategories();
            updateTransportLanguage();
            showScreen('learn-transport-cat-screen');
        }
        function renderTransportCategories(){
            const c=document.getElementById('transport-categories-container');
            if(!c) return;
            c.innerHTML='';
            transportCategories.forEach(cat=>{
                const b=document.createElement('button');
                b.className='transport-cat-btn';
                b.innerText=`${cat.icon} ${transportCatName(cat)}`;
                b.onclick=()=>{ playClickSound(); startLearnTransportCategory(cat.id); };
                c.appendChild(b);
            });
        }
        function startLearnTransportCategory(catId){
            currentTransportCategory=catId;
            currentLearnTransportList=transportDatabase.filter(t=>t.cat===catId);
            currentLearnTransportIdx=0;
            showScreen('learn-transport-flash-screen');
            updateTransportLanguage();
            renderTransportFlashcard(true);
        }
        function renderTransportFlashcard(speak=false){
            const item=currentLearnTransportList[currentLearnTransportIdx];
            if(!item) return;
            const cat=transportCategories.find(c=>c.id===currentTransportCategory);
            document.getElementById('transport-cat-display-title').innerText=cat ? `${cat.icon} ${transportCatName(cat)}` : '';
            document.getElementById('transport-flash-progress').innerText=currentGlobalLang==='ms'
                ? `Kenderaan ${currentLearnTransportIdx+1} daripada ${currentLearnTransportList.length}`
                : `Transport ${currentLearnTransportIdx+1} of ${currentLearnTransportList.length}`;
            const img=document.getElementById('transport-flash-image');
            img.src=item.img;
            img.onerror=()=>{ img.onerror=null; img.src='https://loremflickr.com/640/480/vehicle?lock=2399'; };
            document.getElementById('transport-flash-name-bm').innerText=item.bm;
            document.getElementById('transport-flash-name-en').innerText=item.en;
            document.getElementById('prev-transport-btn').style.display=currentLearnTransportIdx===0?'none':'inline-block';
            document.getElementById('next-transport-btn').innerText=currentLearnTransportIdx===currentLearnTransportList.length-1
                ? (currentGlobalLang==='ms'?'Tamat 🏁':'Finish 🏁')
                : (currentGlobalLang==='ms'?'Next ➡':'Next ➡');
            if(speak) setTimeout(playTransportFlashSound,120);
        }
        function playTransportFlashSound(){
            const item=currentLearnTransportList[currentLearnTransportIdx]; if(!item) return;
            if('speechSynthesis' in window){
                window.speechSynthesis.cancel();
                const u=new SpeechSynthesisUtterance(transportName(item));
                u.lang=currentGlobalLang==='ms'?'ms-MY':'en-US';u.rate=.72;
                window.speechSynthesis.speak(u);
            }
        }
        function prevTransportFlash(){ if(currentLearnTransportIdx>0){currentLearnTransportIdx--;renderTransportFlashcard(true);} }
        function nextTransportFlash(){
            if(currentLearnTransportIdx<currentLearnTransportList.length-1){currentLearnTransportIdx++;renderTransportFlashcard(true);}
            else { alert(currentGlobalLang==='ms'?'Syabas! Anda telah habiskan kategori ini! 🎉':'Great job! You completed this category! 🎉'); openLearnTransportCategoryScreen(); }
        }

        // ---------- Sort the Transport ----------
        let sortTransportSets=[], sortTransportSetIndex=0, selectedTransportSortId=null;
        function startSortTransport(){
            // Each set has two unique pictures from every category.
            // Refill a shuffled category pool only when fewer than two remain.
            const pools=Object.fromEntries(['land','air','water'].map(cat=>[cat,transportShuffle(transportDatabase.filter(item=>item.cat===cat))]));
            sortTransportSets=Array.from({length:5},()=>transportShuffle(['land','air','water'].flatMap(cat=>{
                if(pools[cat].length<2)pools[cat]=transportShuffle(transportDatabase.filter(item=>item.cat===cat));
                return pools[cat].splice(0,2);
            })));
            sortTransportSetIndex=0;
            showScreen('sort-transport-screen');
            updateTransportLanguage();
            setupSortTransportZones();
            renderSortTransportSet();
        }
        function setupSortTransportZones(){
            document.querySelectorAll('.transport-sort-zone').forEach(zone=>{
                if(zone.dataset.ready==='1') return;
                zone.dataset.ready='1';
                zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
                zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
                zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain')||selectedTransportSortId;attemptSortTransportDrop(id,zone.dataset.cat);});
                zone.addEventListener('click',()=>{if(selectedTransportSortId) attemptSortTransportDrop(selectedTransportSortId,zone.dataset.cat);});
            });
        }
        function renderSortTransportSet(){
            selectedTransportSortId=null;
            const set=sortTransportSets[sortTransportSetIndex]||[];
            const bank=document.getElementById('transport-sort-bank');
            bank.innerHTML='';
            document.querySelectorAll('.transport-sort-zone .transport-zone-items').forEach(x=>x.innerHTML='');
            document.getElementById('sort-transport-feedback').innerText='';
            document.getElementById('sort-transport-next').style.display='none';
            document.getElementById('sort-transport-set').innerText=sortTransportSetIndex+1;
            document.getElementById('sort-transport-left').innerText=set.length;
            transportShuffle(set).forEach(item=>bank.appendChild(makeTransportSortItem(item)));
            updateSortAnswerBoxSize('sort-transport-screen','transport-sort-bank');
        }
        function updateSortAnswerBoxSize(screenId,bankId){
            const screen=document.getElementById(screenId),card=document.querySelector('#'+bankId+' .transport-sort-item');
            if(!screen||!card)return;
            const originalSize=card.getBoundingClientRect().width;
            screen.querySelectorAll('.transport-sort-zone').forEach(zone=>{
                const innerWidth=zone.clientWidth-parseFloat(getComputedStyle(zone).paddingLeft)-parseFloat(getComputedStyle(zone).paddingRight);
                const pictureSize=Math.max(0,Math.min(originalSize,innerWidth));
                zone.style.setProperty('--sort-answer-size',pictureSize+'px');
                zone.style.setProperty('min-height',Math.ceil(pictureSize*2+70)+'px','important');
            });
        }
        window.addEventListener('resize',()=>{
            if(document.getElementById('sort-food-screen')?.classList.contains('active'))updateSortAnswerBoxSize('sort-food-screen','food-sort-bank');
            if(document.getElementById('sort-transport-screen')?.classList.contains('active'))updateSortAnswerBoxSize('sort-transport-screen','transport-sort-bank');
        });
        function makeTransportSortItem(item){
            const d=document.createElement('div');
            d.className='transport-sort-item';d.dataset.id=item.id;d.draggable=true;
            d.title=transportName(item);
            const im=document.createElement('img'); im.src=item.img; im.alt=transportName(item); im.referrerPolicy='no-referrer';
            im.onerror=()=>{im.onerror=null;im.src='https://loremflickr.com/640/480/vehicle?lock=2398';}; d.appendChild(im);
            d.addEventListener('dragstart',e=>{selectedTransportSortId=item.id;e.dataTransfer.setData('text/plain',item.id);setTimeout(()=>d.classList.add('selected'),0);});
            d.addEventListener('dragend',()=>d.classList.remove('selected'));
            d.addEventListener('click',()=>{document.querySelectorAll('.transport-sort-item').forEach(x=>x.classList.remove('selected'));selectedTransportSortId=item.id;d.classList.add('selected');});
            // Pointer drag untuk mouse + touch: konsep sama seperti Add Them Up.
            // Gambar asal kekal saiznya; hanya floating preview ikut jari/kursor.
            installTransportSortPointerDrag(d,item);
            return d;
        }

        let transportSortDrag=null, transportSortFloat=null;
        function clearTransportSortZoneHighlight(){
            document.querySelectorAll('.transport-sort-zone.drag-over').forEach(z=>z.classList.remove('drag-over'));
        }
        function moveTransportSortFloat(e){
            if(!transportSortFloat) return;
            transportSortFloat.style.left=e.clientX+'px';
            transportSortFloat.style.top=e.clientY+'px';
        }
        function highlightTransportSortZone(x,y){
            clearTransportSortZoneHighlight();
            const zone=document.elementFromPoint(x,y)?.closest('.transport-sort-zone');
            if(zone) zone.classList.add('drag-over');
        }
        function cleanupTransportSortPointerDrag(){
            clearTransportSortZoneHighlight();
            if(transportSortDrag?.node) transportSortDrag.node.classList.remove('dragging');
            transportSortFloat?.remove();
            transportSortFloat=null;
            transportSortDrag=null;
        }
        function installTransportSortPointerDrag(node,item){
            node.onpointerdown=e=>{
                if(e.pointerType==='mouse' && e.button!==0) return;
                e.preventDefault();
                selectedTransportSortId=item.id;
                document.querySelectorAll('.transport-sort-item').forEach(x=>x.classList.remove('selected'));
                node.classList.add('selected','dragging');
                node.setPointerCapture?.(e.pointerId);
                const r=node.getBoundingClientRect();
                transportSortDrag={node,item,pointerId:e.pointerId};
                transportSortFloat=document.createElement('div');
                transportSortFloat.className='transport-sort-floating';
                transportSortFloat.style.width=r.width+'px';
                transportSortFloat.style.height=r.height+'px';
                const img=node.querySelector('img')?.cloneNode(true);
                if(img) transportSortFloat.appendChild(img);
                document.body.appendChild(transportSortFloat);
                moveTransportSortFloat(e);
                highlightTransportSortZone(e.clientX,e.clientY);
            };
            node.onpointermove=e=>{
                if(transportSortDrag?.node!==node) return;
                e.preventDefault();
                moveTransportSortFloat(e);
                highlightTransportSortZone(e.clientX,e.clientY);
            };
            const finish=e=>{
                if(transportSortDrag?.node!==node) return;
                e.preventDefault();
                const zone=document.elementFromPoint(e.clientX,e.clientY)?.closest('.transport-sort-zone');
                const id=item.id;
                cleanupTransportSortPointerDrag();
                if(zone) attemptSortTransportDrop(id,zone.dataset.cat);
            };
            node.onpointerup=finish;
            node.onpointercancel=e=>{ if(transportSortDrag?.node===node){ e.preventDefault(); cleanupTransportSortPointerDrag(); } };
        }

        function attemptSortTransportDrop(id,cat){
            if(!id) return;
            const item=transportDatabase.find(t=>t.id===id); const node=document.querySelector(`.transport-sort-item[data-id="${id}"]`);
            if(!item||!node||!document.getElementById('transport-sort-bank').contains(node)) return;
            const fb=document.getElementById('sort-transport-feedback');
            if(item.cat!==cat){
                fb.innerText=currentGlobalLang==='ms'?'Cuba lagi 😊 Pilih kotak yang betul.':'Try again 😊 Choose the correct box.';
                fb.style.color='#E53935'; if(typeof playWrongSound==='function')playWrongSound(); return;
            }
            const thumb=document.createElement('div');thumb.className='transport-zone-thumb';
            const im=document.createElement('img');im.src=item.img;im.alt=transportName(item);im.referrerPolicy='no-referrer';thumb.appendChild(im);
            document.querySelector(`.transport-sort-zone[data-cat="${cat}"] .transport-zone-items`).appendChild(thumb);
            node.remove();selectedTransportSortId=null;
            fb.innerText=currentGlobalLang==='ms'?'Betul! 🌟':'Correct! 🌟'; fb.style.color='#2E7D32'; if(typeof playCorrectSound==='function')playCorrectSound();
            const left=document.getElementById('transport-sort-bank').querySelectorAll('.transport-sort-item').length;
            document.getElementById('sort-transport-left').innerText=left;
            if(left===0){
                fb.innerText=currentGlobalLang==='ms'?'Hebat! Semua kenderaan sudah diasingkan. 🎉':'Great! All transport pictures are sorted. 🎉';
                // Auto terus ke set seterusnya tanpa perlu tekan Next
                if(sortTransportSetIndex<4) setTimeout(()=>{ sortTransportSetIndex++; renderSortTransportSet(); },700);
                else setTimeout(finishSortTransport,700);
            }
        }
        function nextSortTransportSet(){ if(sortTransportSetIndex<4){sortTransportSetIndex++;renderSortTransportSet();} }
        function finishSortTransport(){
            if(window.saveScoreToFirebase) window.saveScoreToFirebase(currentGlobalLang==='ms'?'Asingkan Pengangkutan':'Sort Transport',100);
            alert(currentGlobalLang==='ms'?'Tahniah! Anda telah lengkapkan semua 5 set! 🎉':'Congratulations! You completed all 5 sets! 🎉');
            openTransportMenu();
        }

        // ---------- Guess the Transport ----------
        let guessTransportSets=[],guessTransportSetIndex=0,guessTransportScore=0,guessTransportAnswered=0;
        function startGuessTransport(){
            const targets=transportShuffle(transportDatabase).slice(0,20);
            guessTransportSets=Array.from({length:5},(_,i)=>targets.slice(i*4,i*4+4));
            guessTransportSetIndex=0;guessTransportScore=0;
            showScreen('guess-transport-screen');updateTransportLanguage();renderGuessTransportSet();
        }
        function renderGuessTransportSet(){
            guessTransportAnswered=0;
            const grid=document.getElementById('transport-guess-grid');grid.innerHTML='';
            document.getElementById('guess-transport-set').innerText=guessTransportSetIndex+1;
            document.getElementById('guess-transport-score').innerText=guessTransportScore;
            document.getElementById('guess-transport-feedback').innerText='';
            document.getElementById('guess-transport-next').style.display='none';
            const set=guessTransportSets[guessTransportSetIndex]||[];
            set.forEach(target=>grid.appendChild(makeGuessTransportCard(target)));
        }
        function makeGuessTransportCard(target){
            const card=document.createElement('div');card.className='transport-guess-card';card.dataset.target=target.id;
            const img=document.createElement('img');img.className='transport-guess-img';img.src=target.img;img.alt='Transport';img.referrerPolicy='no-referrer';
            img.onerror=()=>{img.onerror=null;img.src='https://loremflickr.com/640/480/vehicle?lock=2397';};card.appendChild(img);
            const opts=document.createElement('div');opts.className='transport-guess-options';
            const distract=transportShuffle(transportDatabase.filter(t=>t.id!==target.id)).slice(0,2);
            transportShuffle([target,...distract]).forEach(choice=>{
                const b=document.createElement('button');b.className='transport-guess-option';b.dataset.id=choice.id;b.innerText=`☐ ${transportName(choice)}`;
                b.onclick=()=>answerGuessTransport(card,target,choice,b);opts.appendChild(b);
            });
            card.appendChild(opts);return card;
        }
        function scrollToNextGuessTransportCard(card, delay=350){
            // Khas untuk paparan telefon: bawa pengguna terus ke soalan seterusnya.
            if(window.innerWidth > 768) return;
            setTimeout(()=>{
                const nextCard = card.nextElementSibling;
                if(nextCard && nextCard.classList.contains('transport-guess-card')){
                    nextCard.scrollIntoView({ behavior:'smooth', block:'center' });
                }
            }, delay);
        }
        function answerGuessTransport(card,target,choice,button){
            if(card.classList.contains('answered'))return;
            card.classList.add('answered');guessTransportAnswered++;
            const buttons=[...card.querySelectorAll('.transport-guess-option')];
            buttons.forEach(b=>{
                b.disabled=true;
                const item=transportDatabase.find(t=>t.id===b.dataset.id);
                b.innerText=`${b.dataset.id===target.id?'✓':'☐'} ${transportName(item)}`;
                if(b.dataset.id===target.id)b.classList.add('correct');
            });

            const isCorrect = choice.id===target.id;
            if(isCorrect){
                guessTransportScore++;
                if(typeof playCorrectSound==='function')playCorrectSound();
            } else {
                button.classList.add('wrong');
                button.innerText=`✕ ${transportName(choice)}`;
                if(typeof playWrongSound==='function')playWrongSound();
            }
            document.getElementById('guess-transport-score').innerText=guessTransportScore;

            // Jawapan betul: terus scroll ke soalan seterusnya pada telefon.
            // Jawapan salah: jawapan betul kekal dipaparkan selama 2 saat dahulu.
            if(guessTransportAnswered<4){
                scrollToNextGuessTransportCard(card, isCorrect ? 350 : 2000);
                return;
            }

            const fb=document.getElementById('guess-transport-feedback');
            fb.innerText=currentGlobalLang==='ms'?'Set selesai! 🌟':'Set complete! 🌟';
            fb.style.color='#2E7D32';

            // Soalan terakhir: beri masa yang sama sebelum masuk set seterusnya.
            const nextDelay = isCorrect ? 700 : 2000;
            if(guessTransportSetIndex<4){
                setTimeout(()=>{
                    guessTransportSetIndex++;
                    renderGuessTransportSet();
                    if(window.innerWidth<=768){
                        const firstCard=document.querySelector('#transport-guess-grid .transport-guess-card');
                        if(firstCard) firstCard.scrollIntoView({behavior:'smooth',block:'center'});
                    }
                },nextDelay);
            } else {
                setTimeout(finishGuessTransport,nextDelay);
            }
        }
        function nextGuessTransportSet(){ if(guessTransportSetIndex<4){guessTransportSetIndex++;renderGuessTransportSet();} }
        function finishGuessTransport(){
            const pct=Math.round(guessTransportScore/20*100);
            if(window.saveScoreToFirebase)window.saveScoreToFirebase(currentGlobalLang==='ms'?'Teka Pengangkutan':'Guess Transport',pct);
            alert(currentGlobalLang==='ms'?`🎉 Selesai! Skor anda: ${guessTransportScore}/20 (${pct}%)`:`🎉 Finished! Your score: ${guessTransportScore}/20 (${pct}%)`);
            openTransportMenu();
        }


        // Jobs & Profession
        const jobsData=[
            ['doctor','Doktor','Doctor','Fyv8CVf'],['police','Polis','Police Officer','Q0eLi14'],['teacher','Guru','Teacher','MJWlTbX'],
            ['chef','Chef','Chef','aSfI5EK'],['soldier','Tentera','Soldier','7XnkHwG'],['architect','Arkitek','Architect','dkXcL1v'],
            ['pilot','Juruterbang','Pilot','2dDABFA'],['firefighter','Ahli Bomba','Firefighter','ioV0A7D'],['artist','Pelukis','Artist','XueDbsm'],
            ['reporter','Wartawan','Reporter','d1sERsG'],['farmer','Petani','Farmer','w9ljsfb'],['lawyer','Peguam','Lawyer','cgH6zbQ'],
            ['barber','Tukang Gunting Rambut','Barber','zRQmoI0'],['cashier','Juruwang','Cashier','5LEgfaj'],
            ['nurse','Jururawat','Nurse','ZafxByC'],
['postman','Posmen','Postman','ZaV1CG4'],
['waiter','Pelayan','Waiter','D0L809Z'],
['plumber','Tukang Paip','Plumber','Ko1H0sq'],
['flight_attendant','Pramugari','Flight Attendant','Lf7PyrL'],
['tailor','Tukang Jahit','Tailor','vvS679G'],
['gardener','Tukang Kebun','Gardener','zlqoj42']
        ].map(([id,ms,en,img])=>({id,ms,en,img:'https://i.imgur.com/'+img+'.jpeg'}));
        const jobsName=j=>currentGlobalLang==='ms'?j.ms:j.en;
        const jobsShuffle=a=>[...a].sort(()=>Math.random()-.5);
        let jobsLearnIndex=0,jobsQuizMode='',jobsQuizOrder=[],jobsSet=0,jobsAnswered=0,jobsQuizToken=0,jobsTimer=0;
        function openJobsMenu(){jobsQuizToken++;clearTimeout(jobsTimer);document.getElementById('jobs-pop').hidden=true;showScreen('jobs-menu-screen');document.getElementById('jobs-menu-title').textContent=currentGlobalLang==='ms'?'Pekerjaan & Profesion 👩‍⚕️':'Jobs & Profession 👩‍⚕️';document.getElementById('jobs-menu-desc').textContent=currentGlobalLang==='ms'?'Pilih aktiviti pekerjaan!':'Choose an activity!'}
        function updateJobsLanguage(){
            const ms=currentGlobalLang==='ms';
            const menu=document.getElementById('jobs-menu-screen');
            document.getElementById('jobs-menu-title').textContent=ms?'Pekerjaan & Profesion 👩‍⚕️':'Jobs & Profession 👩‍⚕️';
            document.getElementById('jobs-menu-desc').textContent=ms?'Pilih aktiviti pekerjaan!':'Choose an activity!';
            const menuButtons=menu.querySelectorAll('.transport-menu-btn');
            [ms?'Pekerjaan':'Jobs',ms?'Pilih Pekerjaan Yang Betul':'Choose the Correct Job',ms?'Siapakah Saya?':'Who Am I?'].forEach((name,i)=>{menuButtons[i].setAttribute('aria-label',name);menuButtons[i].querySelector('img').alt=name});
            menu.querySelector('.home-btn').textContent=ms?'Kembali ke Utama 🏠':'Back to Home 🏠';
            const learn=document.getElementById('jobs-learn-screen');
            learn.querySelector('.sound-btn').textContent=ms?'🔊 Dengar':'🔊 Listen';
            learn.querySelector('.home-btn').textContent=ms?'Kembali ↩️':'Back ↩️';
            document.getElementById('jobs-prev').textContent=ms?'⬅ Sebelum':'⬅ Prev';
            if(learn.classList.contains('active'))renderJobsLearn();
            const quiz=document.getElementById('jobs-quiz-screen');
            quiz.querySelector('.home-btn').textContent=ms?'Kembali ↩️':'Back ↩️';
            if(quiz.classList.contains('active')){
                document.getElementById('jobs-quiz-title').textContent=jobsQuizMode==='choose'?(ms?'Pilih Pekerjaan Yang Betul':'Choose the Correct Job'):(ms?'Siapakah Saya?':'Who Am I?');
                const count=jobsQuizMode==='choose'?1:4;
                document.getElementById('jobs-quiz-status').textContent=jobsQuizMode==='choose'?(ms?'Soalan ':'Question ')+(jobsSet+1)+'/10': 'Set '+(jobsSet+1)+'/3 · '+count+(ms?' soalan':' questions');
                quiz.querySelectorAll('#jobs-quiz-grid .transport-guess-card').forEach(card=>{
                    const target=jobsData.find(j=>j.id===card.dataset.jobId);
                    if(!target)return;
                    const prompt=card.querySelector('.jobs-prompt');
                    if(prompt){prompt.querySelector('span').textContent=jobsName(target);prompt.querySelector('.jobs-audio-btn').setAttribute('aria-label',(ms?'Dengar ':'Listen to ')+jobsName(target))}
                    const image=card.querySelector('.transport-guess-img');
                    if(image)image.alt=ms?'Pekerjaan apakah ini?':'What job is this?';
                    card.querySelectorAll('.jobs-pick, .transport-guess-option').forEach(button=>{
                        const choice=jobsData.find(j=>j.id===button.dataset.jobId);
                        if(!choice)return;
                        if(button.classList.contains('jobs-pick')){button.setAttribute('aria-label',jobsName(choice));button.querySelector('img').alt=jobsName(choice)}
                        else button.textContent='☐ '+jobsName(choice);
                    });
                });
            }
            const pop=document.getElementById('jobs-pop');
            if(!pop.hidden){const target=jobsData.find(j=>j.id===pop.dataset.jobId);if(target)document.getElementById('jobs-pop-name').textContent=jobsName(target)}
        }
        function jobsSpeak(j, rate=.75){
            if(!('speechSynthesis' in window))return;
            speechSynthesis.cancel();
            const u=new SpeechSynthesisUtterance(jobsName(j));u.lang=currentGlobalLang==='ms'?'ms-MY':'en-US';u.rate=rate;
            speechSynthesis.speak(u);
        }
        function startJobsLearn(){jobsLearnIndex=0;showScreen('jobs-learn-screen');renderJobsLearn();speakCurrentJob()}
        function renderJobsLearn(){
            const j=jobsData[jobsLearnIndex];
            document.getElementById('jobs-learn-title').textContent=currentGlobalLang==='ms'?'Kenali Pekerjaan':'Jobs';
            document.getElementById('jobs-progress').textContent=(jobsLearnIndex+1)+' / '+jobsData.length;
            document.getElementById('jobs-image').src=j.img;
            document.getElementById('jobs-caption').textContent=jobsName(j);
            document.getElementById('jobs-prev').style.display=jobsLearnIndex?'inline-block':'none';
            document.getElementById('jobs-next').textContent=jobsLearnIndex===jobsData.length-1?(currentGlobalLang==='ms'?'Tamat 🏁':'Finish 🏁'):'Next ➡';
        }
        function speakCurrentJob(){jobsSpeak(jobsData[jobsLearnIndex])}
        function moveJobsLearn(delta){if(delta>0&&jobsLearnIndex===jobsData.length-1){openJobsMenu();return}jobsLearnIndex=Math.max(0,jobsLearnIndex+delta);renderJobsLearn();speakCurrentJob()}
        function startJobsQuiz(mode){
            jobsQuizToken++;clearTimeout(jobsTimer);jobsQuizMode=mode;jobsQuizOrder=jobsShuffle(jobsData).slice(0,mode==='choose'?10:12);jobsSet=0;
            document.getElementById('jobs-quiz-screen').classList.toggle('jobs-choose-mode',mode==='choose');
            showScreen('jobs-quiz-screen');renderJobsSet();
        }
        function renderJobsSet(){
            const token=jobsQuizToken; jobsAnswered=0;
            const grid=document.getElementById('jobs-quiz-grid');grid.replaceChildren();
            document.getElementById('jobs-quiz-title').textContent=jobsQuizMode==='choose'?(currentGlobalLang==='ms'?'Pilih Pekerjaan Yang Betul':'Choose the Correct Job'):(currentGlobalLang==='ms'?'Siapakah Saya?':'Who Am I?');
            const questionsPerSet=jobsQuizMode==='choose'?1:4;
            const totalSets=jobsQuizMode==='choose'?10:3;
            document.getElementById('jobs-quiz-status').textContent=jobsQuizMode==='choose'?(currentGlobalLang==='ms'?'Soalan ':'Question ')+(jobsSet+1)+'/10':'Set '+(jobsSet+1)+'/'+totalSets+' · '+(currentGlobalLang==='ms'?questionsPerSet+' soalan':questionsPerSet+' questions');
            jobsQuizOrder.slice(jobsSet*questionsPerSet,(jobsSet+1)*questionsPerSet).forEach(target=>{
                const card=document.createElement('div');card.className='transport-guess-card '+(jobsQuizMode==='choose'?'jobs-choose-card':'jobs-who-card');card.dataset.jobId=target.id;
                const options=jobsShuffle([target,...jobsShuffle(jobsData.filter(x=>x.id!==target.id)).slice(0,jobsQuizMode==='choose'?3:2)]);
                if(jobsQuizMode==='choose'){
                    const prompt=document.createElement('div');prompt.className='jobs-prompt';
                    const label=document.createElement('span');label.textContent=jobsName(target);prompt.appendChild(label);
                    const listen=document.createElement('button');listen.type='button';listen.className='jobs-audio-btn';listen.textContent='🔊';listen.setAttribute('aria-label',(currentGlobalLang==='ms'?'Dengar ':'Listen to ')+jobsName(target));listen.title='Listen / Dengar';listen.onclick=()=>jobsSpeak(target, .4);prompt.appendChild(listen);card.appendChild(prompt);
                    options.forEach(choice=>{
                        const b=document.createElement('button');b.className='jobs-pick';b.dataset.jobId=choice.id;b.setAttribute('aria-label',jobsName(choice));
                        const img=document.createElement('img');img.src=choice.img;img.alt=jobsName(choice);b.appendChild(img);
                        b.onclick=()=>answerJobs(card,target,choice,b,token);card.appendChild(b);
                    });
                }else{
                    const img=document.createElement('img');img.className='transport-guess-img';img.src=target.img;img.alt=currentGlobalLang==='ms'?'Pekerjaan apakah ini?':'What job is this?';card.appendChild(img);
                    const opts=document.createElement('div');opts.className='transport-guess-options';
                    options.forEach(choice=>{
                        const b=document.createElement('button');b.className='transport-guess-option';b.dataset.jobId=choice.id;b.textContent='☐ '+jobsName(choice);
                        b.onclick=()=>answerJobs(card,target,choice,b,token);opts.appendChild(b);
                    });card.appendChild(opts);
                }
                grid.appendChild(card);
            });
        }
        function answerJobs(card,target,choice,button,token){
            if(token!==jobsQuizToken||card.classList.contains('answered'))return;
            if(choice.id!==target.id){playWrongSound();button.classList.add('wrong');return}
            card.classList.add('answered');button.classList.add('correct');playCorrectSound();jobsAnswered++;
            const pop=document.getElementById('jobs-pop');pop.dataset.jobId=target.id;document.getElementById('jobs-pop-image').src=target.img;document.getElementById('jobs-pop-name').textContent=jobsName(target);pop.hidden=false;
            jobsSpeak(target);
            jobsTimer=setTimeout(()=>{
                if(token!==jobsQuizToken)return;
                pop.hidden=true;
                if(jobsAnswered===(jobsQuizMode==='choose'?1:4)){
                    if(jobsSet===(jobsQuizMode==='choose'?9:2)){alert(currentGlobalLang==='ms'?'🎉 Syabas! Selesai!':'🎉 Well done!')}
                    else{jobsSet++;renderJobsSet();window.scrollTo({top:0,behavior:'instant'})}
                }else if(jobsQuizMode==='who'||window.innerWidth<=768){
                    const next=[...document.querySelectorAll('#jobs-quiz-grid .transport-guess-card')].find(el=>!el.classList.contains('answered'));
                    if(next)next.scrollIntoView({behavior:'smooth',block:'start'});
                }
            },2300);
        }

    