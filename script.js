/* ================================================================
   ARCHIVIO MONUMENT — script.js
   Indice:
     1. Gestione tab e navigazione
     2. Caricamento/scaricamento differito degli iframe YouTube
     3. Logica password — tab Classified
     4. Toggle effetto CRT
     5. Orologio di sistema
     6. Inizializzazione
   ================================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------------------
     1. GESTIONE TAB E NAVIGAZIONE

     Generica per progettazione: legge tutti i bottoni con classe
     .tab-btn e tutte le sezioni con classe .tab-content, collegati
     tramite data-tab / id. Aggiungere una nuova serie in futuro
     non richiede toccare questo file — basta seguire la stessa
     convenzione di markup in index.html.
     -------------------------------------------------------------- */

  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  function activateTab(tabId) {
    const nextContent = document.getElementById(tabId);
    if (!nextContent) return;

    // Prima di nascondere il tab corrente, ferma eventuali video in
    // riproduzione al suo interno per evitare sovrapposizioni audio.
    tabContents.forEach((content) => {
      if (content.classList.contains('active') && content.id !== tabId) {
        unloadIframes(content);
      }
    });

    // Aggiorna lo stato visivo/aria dei bottoni
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    // Aggiorna quale sezione è visibile
    tabContents.forEach((content) => {
      content.classList.toggle('active', content.id === tabId);
    });

    // Carica gli iframe della nuova sezione attiva (se presenti)
    loadIframes(nextContent);

    // Sposta il focus sulla sezione per utenti da tastiera/screen reader
    nextContent.focus({ preventScroll: true });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });


  /* --------------------------------------------------------------
     2. CARICAMENTO / SCARICAMENTO IFRAME

     Gli iframe YouTube hanno il vero URL in data-src, non in src.
     Il src viene impostato solo quando il tab diventa attivo
     (evita autoplay indesiderato e riduce il carico iniziale) e
     viene svuotato quando il tab viene lasciato (ferma l'audio).
     -------------------------------------------------------------- */

  function loadIframes(container) {
    container.querySelectorAll('iframe[data-src]').forEach((iframe) => {
      if (!iframe.getAttribute('src')) {
        iframe.setAttribute('src', iframe.dataset.src);
      }
    });
  }

  function unloadIframes(container) {
    container.querySelectorAll('iframe[data-src]').forEach((iframe) => {
      iframe.removeAttribute('src');
    });
  }


  /* --------------------------------------------------------------
     3. LOGICA PASSWORD — TAB CLASSIFIED

     Codici accettati (case-insensitive): 1999, MONUMENT.
     Aggiungere altri codici validi è sufficiente inserirli
     nell'array ACCESS_CODES qui sotto.
     -------------------------------------------------------------- */

  const ACCESS_CODES = ['1999', 'monument'];

  const passwordForm = document.getElementById('passwordForm');
  const passwordInput = document.getElementById('passwordInput');
  const passwordGate = document.getElementById('passwordGate');
  const classifiedContent = document.getElementById('classifiedContent');
  const gateError = document.getElementById('gateError');

  let failedAttempts = 0;

  if (passwordForm) {
    passwordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = passwordInput.value.trim().toLowerCase();

      if (code.length > 0 && ACCESS_CODES.includes(code)) {
        unlockClassified();
      } else {
        rejectCode();
      }
    });
  }

  function unlockClassified() {
    passwordGate.hidden = true;
    classifiedContent.hidden = false;
    classifiedContent.classList.add('just-unlocked');

    // Se un iframe è presente nella sezione classified e appena
    // rivelata, caricalo ora (coerente con la logica del punto 2)
    loadIframes(classifiedContent);
  }

  function rejectCode() {
    failedAttempts += 1;
    gateError.textContent = `ACCESSO NEGATO — TENTATIVO ${failedAttempts}`;
    passwordGate.classList.remove('shake');
    // forza il replay dell'animazione anche su click ripetuti
    void passwordGate.offsetWidth;
    passwordGate.classList.add('shake');
    passwordInput.value = '';
    passwordInput.focus();
  }


  /* --------------------------------------------------------------
     4. TOGGLE EFFETTO CRT
     -------------------------------------------------------------- */

  const scanlineToggle = document.getElementById('scanlineToggle');
  let crtEnabled = true;

  if (scanlineToggle) {
    scanlineToggle.addEventListener('click', () => {
      crtEnabled = !crtEnabled;
      document.body.classList.toggle('crt-disabled', !crtEnabled);
      scanlineToggle.textContent = crtEnabled
        ? 'DISATTIVA EFFETTO CRT'
        : 'ATTIVA EFFETTO CRT';
      scanlineToggle.setAttribute('aria-pressed', String(crtEnabled));
    });
  }


  /* --------------------------------------------------------------
     5. OROLOGIO DI SISTEMA (puro dettaglio atmosferico)
     -------------------------------------------------------------- */

  const headerClock = document.getElementById('headerClock');
  const lastSync = document.getElementById('lastSync');

  function updateClock() {
    if (!headerClock) return;
    const now = new Date();
    headerClock.textContent = now.toLocaleTimeString('it-IT');
  }


  /* --------------------------------------------------------------
     6. INIZIALIZZAZIONE
     -------------------------------------------------------------- */

  function init() {
    updateClock();
    setInterval(updateClock, 1000);

    if (lastSync) {
      lastSync.textContent = new Date().toLocaleTimeString('it-IT');
    }

    // Carica gli iframe del tab attivo di default al primo avvio
    const initialActive = document.querySelector('.tab-content.active');
    if (initialActive) {
      loadIframes(initialActive);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
