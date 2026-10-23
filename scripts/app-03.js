
      (function () {
        let ready = false;
        window.kiddoraStartupReady = function () {
          ready = true;
          document.getElementById('kiddora-load-error').style.display = 'none';
        };
        window.kiddoraStartupError = function (message) {
          const box = document.getElementById('kiddora-load-error');
          document.getElementById('kiddora-load-error-text').textContent = message;
          box.style.display = 'block';
          if (typeof window.showScreen === 'function') window.showScreen('login-screen');
        };
        setTimeout(function () {
          if (!ready) window.kiddoraStartupError(
            'KIDDORA belum berjaya dimuatkan. Semak sambungan internet, kemudian cuba semula. / KIDDORA could not load. Check your connection and retry.');
        }, 12000);
        window.addEventListener('error', function (e) {
          if (e.target && e.target.tagName === 'SCRIPT' && e.target.type === 'module') {
            window.kiddoraStartupError('Sambungan untuk membuka KIDDORA gagal. Cuba semula apabila internet stabil.');
          }
        }, true);
      })();
    