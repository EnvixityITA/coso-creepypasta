/* ================================================================
   ARCHIVIO MONUMENT — script.js
   Indice:
     1. Gestione tab e navigazione
     2. Caricamento/scaricamento differito degli iframe YouTube
     3. Aree protette da password (Classified, Admin)
     4. Pannello Admin — richieste di nuove serie (localStorage)
     5. Toggle effetto CRT
     6. Orologio di sistema
     7. Inizializzazione
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

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    tabContents.forEach((content) => {
      content.classList.toggle('active', content.id === tabId);
    });

    loadIframes(nextContent);
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
     3. AREE PROTETTE DA PASSWORD

     Funzione generica riutilizzata sia dal tab Classified sia dal
     tab Admin — aggiungere in futuro un'altra area riservata non
     richiede altro che una nuova chiamata a setupPasswordGate().

     NOTA IMPORTANTE SULLA SICUREZZA: essendo un sito statico senza
     server, questo è (e non può che essere) un controllo lato
     client. Scoraggia i visitatori occasionali, ma chiunque apra
     il codice sorgente di questo file può leggere i codici in
     ACCESS_CODES/ADMIN_CODES o saltare direttamente il controllo
     dagli strumenti sviluppatore del browser. Va bene per un
     easter egg narrativo (Classified) o per tenere il pannello
     Admin fuori dalla vista dei visitatori occasionali, ma non va
     trattato come una vera protezione di dati sensibili: per
     quello serve un'autenticazione lato server.
     -------------------------------------------------------------- */

  function setupPasswordGate(config) {
    const form = document.getElementById(config.formId);
    const input = document.getElementById(config.inputId);
    const gate = document.getElementById(config.gateId);
    const content = document.getElementById(config.contentId);
    const errorEl = document.getElementById(config.errorId);
    let attempts = 0;

    if (!form || !input || !gate || !content) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = input.value.trim().toLowerCase();

      if (code.length > 0 && config.codes.includes(code)) {
        gate.hidden = true;
        content.hidden = false;
        content.classList.remove('just-unlocked');
        void content.offsetWidth; // forza il replay dell'animazione
        content.classList.add('just-unlocked');
        if (typeof config.onUnlock === 'function') {
          config.onUnlock();
        }
      } else {
        attempts += 1;
        if (errorEl) {
          errorEl.textContent = `ACCESSO NEGATO — TENTATIVO ${attempts}`;
        }
        gate.classList.remove('shake');
        void gate.offsetWidth;
        gate.classList.add('shake');
        input.value = '';
        input.focus();
      }
    });
  }

  // Codici di accesso — modifica questi array per cambiare le password.
  // Il confronto è case-insensitive (l'input viene messo in minuscolo).
  const CLASSIFIED_CODES = ['1999', 'monument'];
  const ADMIN_CODES = ['3011'];

  setupPasswordGate({
    formId: 'passwordForm',
    inputId: 'passwordInput',
    gateId: 'passwordGate',
    contentId: 'classifiedContent',
    errorId: 'gateError',
    codes: CLASSIFIED_CODES,
    onUnlock: () => loadIframes(document.getElementById('classifiedContent'))
  });

  setupPasswordGate({
    formId: 'adminForm',
    inputId: 'adminInput',
    gateId: 'adminGate',
    contentId: 'adminContent',
    errorId: 'adminGateError',
    codes: ADMIN_CODES,
    onUnlock: () => renderRequests()
  });


  /* --------------------------------------------------------------
     4. PANNELLO ADMIN — RICHIESTE DI NUOVE SERIE

     I dati sono salvati in localStorage: restano solo su questo
     browser/dispositivo. Non essendoci un server, non esiste un
     vero "invio" della richiesta altrove — è pensato come coda/
     promemoria personale per chi gestisce l'archivio (torni sul
     tab Admin in un secondo momento e ritrovi le richieste
     salvate), non come modulo pubblico multi-utente. Se in futuro
     serve raccogliere richieste da persone su altri dispositivi,
     questo form andrebbe collegato a un servizio esterno (es. un
     form-endpoint o un piccolo backend) al posto di localStorage.
     -------------------------------------------------------------- */

  const REQUESTS_STORAGE_KEY = 'archivioMonument.seriesRequests';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function getStoredRequests() {
    try {
      const raw = localStorage.getItem(REQUESTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Impossibile leggere le richieste salvate:', err);
      return [];
    }
  }

  function saveStoredRequests(requests) {
    try {
      localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    } catch (err) {
      console.error('Impossibile salvare la richiesta (storage pieno o non disponibile):', err);
    }
  }

  function deleteRequest(id) {
    const requests = getStoredRequests().filter((r) => String(r.id) !== String(id));
    saveStoredRequests(requests);
    renderRequests();
  }

  function renderRequests() {
    const container = document.getElementById('requestsList');
    if (!container) return;

    const requests = getStoredRequests();

    if (requests.length === 0) {
      container.innerHTML = '<p class="empty-state">Nessuna richiesta salvata al momento.</p>';
      return;
    }

    container.innerHTML = requests.map((req) => {
      const episodesHtml = (req.episodes || []).length
        ? '<ul class="request-episodes">' + req.episodes.map((ep) =>
            '<li>' + (escapeHtml(ep.name) || 'Episodio') +
            (ep.link ? ' — <a href="' + escapeHtml(ep.link) + '" target="_blank" rel="noopener">' + escapeHtml(ep.link) + '</a>' : '') +
            '</li>'
          ).join('') + '</ul>'
        : '';

      const linkHtml = req.seriesLink
        ? '<p class="request-link"><a href="' + escapeHtml(req.seriesLink) + '" target="_blank" rel="noopener">' + escapeHtml(req.seriesLink) + '</a></p>'
        : '';

      const notesHtml = req.notes
        ? '<p class="request-notes">' + escapeHtml(req.notes) + '</p>'
        : '';

      const savedAt = req.createdAt ? new Date(req.createdAt).toLocaleString('it-IT') : '';

      return (
        '<div class="request-card">' +
          '<div class="request-card-header">' +
            '<span class="entity-name">' + escapeHtml(req.seriesName) + '</span>' +
            '<button type="button" class="request-delete" data-id="' + escapeHtml(req.id) + '">ELIMINA</button>' +
          '</div>' +
          linkHtml +
          episodesHtml +
          notesHtml +
          '<p class="request-meta">Salvato il ' + savedAt + '</p>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('.request-delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteRequest(btn.dataset.id));
    });
  }

  // --- Righe episodio dinamiche nel form di richiesta ---

  const episodesList = document.getElementById('episodesList');
  const addEpisodeBtn = document.getElementById('addEpisodeBtn');

  function createEpisodeRow() {
    const row = document.createElement('div');
    row.className = 'episode-row';
    row.innerHTML =
      '<input type="text" class="episode-name" placeholder="Nome episodio">' +
      '<input type="url" class="episode-link" placeholder="Link YouTube">' +
      '<button type="button" class="episode-remove" aria-label="Rimuovi episodio">×</button>';

    row.querySelector('.episode-remove').addEventListener('click', () => {
      if (episodesList.children.length > 1) {
        row.remove();
      } else {
        row.querySelectorAll('input').forEach((input) => { input.value = ''; });
      }
    });

    return row;
  }

  function resetEpisodesList() {
    if (!episodesList) return;
    episodesList.innerHTML = '';
    episodesList.appendChild(createEpisodeRow());
  }

  if (addEpisodeBtn) {
    addEpisodeBtn.addEventListener('click', () => {
      episodesList.appendChild(createEpisodeRow());
    });
  }

  // --- Invio del form di richiesta ---

  const requestForm = document.getElementById('requestForm');

  if (requestForm) {
    requestForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const seriesName = document.getElementById('reqSeriesName').value.trim();
      if (!seriesName) return;

      const seriesLink = document.getElementById('reqSeriesLink').value.trim();
      const notes = document.getElementById('reqNotes').value.trim();

      const episodes = Array.from(episodesList.querySelectorAll('.episode-row'))
        .map((row) => ({
          name: row.querySelector('.episode-name').value.trim(),
          link: row.querySelector('.episode-link').value.trim()
        }))
        .filter((ep) => ep.name || ep.link);

      const newRequest = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        seriesName: seriesName,
        seriesLink: seriesLink,
        episodes: episodes,
        notes: notes,
        createdAt: new Date().toISOString()
      };

      const requests = getStoredRequests();
      requests.unshift(newRequest); // le più recenti in cima
      saveStoredRequests(requests);

      requestForm.reset();
      resetEpisodesList();
      renderRequests();
    });
  }


  /* --------------------------------------------------------------
     5. TOGGLE EFFETTO CRT
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
     6. OROLOGIO DI SISTEMA (puro dettaglio atmosferico)
     -------------------------------------------------------------- */

  const headerClock = document.getElementById('headerClock');
  const lastSync = document.getElementById('lastSync');

  function updateClock() {
    if (!headerClock) return;
    const now = new Date();
    headerClock.textContent = now.toLocaleTimeString('it-IT');
  }


  /* --------------------------------------------------------------
     7. INIZIALIZZAZIONE
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

    // Prepara una riga episodio vuota nel form di richiesta
    resetEpisodesList();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
