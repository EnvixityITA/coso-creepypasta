/* ================================================================
   ARCHIVIO MONUMENT — script.js
   Indice:
     0. Configurazione e inizializzazione Firebase (Firestore)
     1. Gestione tab e navigazione
     2. Caricamento/scaricamento differito degli iframe YouTube
     3. Griglie video per serie (dati episodi base + episodi
        aggiunti da Admin, uniti a runtime, + rendering)
     4. Aree protette da password (Classified, Admin)
     5. Pannello Admin — aggiunta permanente di episodi (Firestore)
     6. Toggle effetto CRT
     7. Orologio di sistema
     8. Inizializzazione
   ================================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------------------
     0. CONFIGURAZIONE E INIZIALIZZAZIONE FIREBASE (FIRESTORE)

     Gli episodi aggiunti dal pannello Admin vengono salvati su
     Firestore invece che in localStorage: così restano permanenti
     e sono visibili a chiunque apra il sito, da qualunque
     dispositivo/browser (compreso l'accesso al pannello Admin da
     un altro PC).

     COME ATTIVARLO:
     1. Vai su https://console.firebase.google.com/u/0/project/creepypasta-48cd8/overview
     2. Impostazioni progetto (icona ingranaggio) → Generali → in
        fondo, sezione "Le tue app". Se non c'è ancora un'app Web,
        creane una (icona </>) — non serve Hosting, basta registrare
        l'app. Copia l'oggetto firebaseConfig mostrato e incollalo
        qui sotto al posto dei valori segnaposto "INSERISCI_...".
     3. Nel menu a sinistra vai su "Firestore Database" → "Crea
        database" (se non esiste già) → modalità produzione va bene,
        qualsiasi regione.
     4. Nella scheda "Regole" di Firestore, incolla queste regole e
        pubblica (permettono a chiunque di leggere/scrivere SOLO
        nella collezione customEpisodes — è lo stesso livello di
        sicurezza "lato client" già usato per i codici Admin/
        Classified: scoraggia i visitatori occasionali ma non è una
        vera autenticazione server-side):

          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /customEpisodes/{episodeId} {
                allow read: if true;
                allow create: if request.resource.data.keys().hasAll(['series','title','videoId'])
                              && request.resource.data.series is string
                              && request.resource.data.title is string
                              && request.resource.data.videoId is string;
                allow delete: if true;
                allow update: if false;
              }
            }
          }

     Finché FIREBASE_CONFIG resta con i valori segnaposto, il resto
     del sito funziona lo stesso (con i soli episodi hardcoded qui
     sotto in SERIES_VIDEOS), ma il pannello Admin mostrerà un
     avviso e non potrà salvare nuovi episodi.
     -------------------------------------------------------------- */

  const FIREBASE_CONFIG = {
    apiKey: '898918488460',
    authDomain: 'creepypasta-48cd8.firebaseapp.com',
    projectId: 'creepypasta-48cd8',
    storageBucket: 'INSERISCI_STORAGE_BUCKET',
    messagingSenderId: 'INSERISCI_SENDER_ID',
    appId: 'INSERISCI_APP_ID'
  };

  const CUSTOM_EPISODES_COLLECTION = 'customEpisodes';

  let db = null;
  let firebaseReady = false;

  function isFirebaseConfigured() {
    return Object.values(FIREBASE_CONFIG).every((value) => typeof value === 'string' && value.indexOf('INSERISCI_') !== 0);
  }

  function initFirebase() {
    if (!isFirebaseConfigured()) {
      setSyncStatus('Firebase non configurato — vedi FIREBASE_CONFIG in script.js. Gli episodi aggiunti da Admin non verranno salvati in modo permanente finché non lo configuri.', 'error');
      return;
    }

    if (typeof firebase === 'undefined') {
      setSyncStatus('SDK Firebase non caricato (controlla la connessione o i tag <script> in index.html).', 'error');
      return;
    }

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      firebaseReady = true;
      setSyncStatus('Connessione stabilita — in ascolto per aggiornamenti in tempo reale…', 'ok');
      listenToCustomEpisodes();
    } catch (err) {
      console.error('Errore inizializzazione Firebase:', err);
      setSyncStatus('Errore di connessione a Firebase — controlla la console per i dettagli.', 'error');
    }
  }

  function setSyncStatus(message, state) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.textContent = message;
    if (state) {
      el.setAttribute('data-state', state);
    } else {
      el.removeAttribute('data-state');
    }
  }

  /* --------------------------------------------------------------
     1. GESTIONE TAB E NAVIGAZIONE

     Generica per progettazione: legge tutti i bottoni con classe
     .tab-btn e tutte le sezioni con classe .tab-content, collegati
     tramite data-tab / id. Aggiungere una nuova serie in futuro
     non richiede toccare questa parte del file — basta seguire la
     stessa convenzione di markup in index.html.
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
     3. GRIGLIE VIDEO PER SERIE

     Ogni serie ha un array di episodi qui sotto. Per aggiungere,
     rimuovere o modificare un episodio basta modificare l'array
     corrispondente — non serve toccare l'HTML.

     Ogni episodio ha:
       - title: testo mostrato sotto il player
       - videoId: il video YouTube. Accetta QUALSIASI formato tu
         abbia sottomano — link di condivisione (youtu.be/...),
         link completo (youtube.com/watch?v=...), link di embed
         già pronto, o il solo ID — extractYouTubeId() qui sotto
         estrae l'ID corretto in ogni caso.

     Finché videoId resta 'INSERISCI_ID' (o vuoto), al posto del
     player viene mostrato un avviso invece di un embed rotto.

     Per aggiungere una nuova serie in futuro: aggiungi qui una
     nuova chiave con lo stesso id della <section> in index.html
     (vedi il commento sopra la <nav> in index.html per gli altri
     passaggi).
     -------------------------------------------------------------- */

  const SERIES_VIDEOS = {
    'vita-carnis': [
      { title: 'Episodio 01 — Intro and The Crawl', videoId: 'https://youtu.be/xNc-jv3d2o0?si=H97zHI5QxgiZvEoj' },
      { title: 'Episodio 02 — Trimmings', videoId: 'https://youtu.be/1vK0rZm4dyk?si=rUO9lAgM9lEvU_nV' },
      { title: 'Episodio 03 — Meatsnakes', videoId: 'https://youtu.be/gsd389jrF8k?si=Da-p2aS8yC1UJtRv' },
      { title: 'Episodio 04 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 05 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 06 — [Titolo da inserire]', videoId: 'INSERISCI_ID' }
    ],
    'mandela': [
      { title: 'Episodio 01 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 02 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 03 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 04 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 05 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 06 — [Titolo da inserire]', videoId: 'INSERISCI_ID' }
    ],
    'local58': [
      { title: 'Episodio 01 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 02 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 03 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 04 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 05 — [Titolo da inserire]', videoId: 'INSERISCI_ID' },
      { title: 'Episodio 06 — [Titolo da inserire]', videoId: 'INSERISCI_ID' }
    ]
  };

  // Nomi visualizzati delle serie — usati per popolare la select nel
  // form Admin. Se aggiungi una nuova serie in SERIES_VIDEOS, aggiungi
  // anche qui la sua etichetta.
  const SERIES_LABELS = {
    'vita-carnis': 'VITA CARNIS',
    'mandela': 'THE MANDELA CATALOGUE',
    'local58': 'LOCAL58'
  };

  // Episodi aggiunti da Admin e caricati da Firestore, tenuti in
  // memoria e ricostruiti a ogni aggiornamento in tempo reale.
  // Forma: { seriesKey: [ { id, title, videoId }, ... ] }
  let customEpisodesBySeries = {};

  // Estrae l'ID video da qualunque formato comune di link YouTube.
  // Un link tipo "https://youtu.be/ID?si=..." NON è imbeddabile
  // direttamente in un iframe: va convertito in "youtube.com/embed/ID".
  function extractYouTubeId(input) {
    if (!input) return '';
    const value = input.trim();

    // Già un ID "nudo" (11 caratteri alfanumerici/underscore/trattino)
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
      return value;
    }

    try {
      const url = new URL(value);

      if (url.hostname.indexOf('youtu.be') !== -1) {
        return url.pathname.replace(/^\//, '').split('?')[0];
      }

      if (url.hostname.indexOf('youtube.com') !== -1) {
        if (url.pathname.indexOf('/embed/') === 0) {
          return url.pathname.replace('/embed/', '').split('?')[0];
        }
        const v = url.searchParams.get('v');
        if (v) return v;
      }
    } catch (err) {
      // non era un URL valido — nessuna azione, si ritorna il valore grezzo sotto
    }

    return value;
  }

  function renderVideoGrid(seriesKey) {
    const container = document.getElementById('videoGrid-' + seriesKey);
    const baseVideos = SERIES_VIDEOS[seriesKey];
    if (!container || !baseVideos) return;

    // Gli episodi aggiunti da Admin (Firestore) vengono accodati dopo
    // quelli base, nell'ordine in cui sono stati pubblicati.
    const customVideos = customEpisodesBySeries[seriesKey] || [];
    const videos = baseVideos.concat(customVideos);

    container.innerHTML = videos.map((video) => {
      const isUnconfigured = !video.videoId || video.videoId.trim() === '' || video.videoId.trim() === 'INSERISCI_ID';

      if (isUnconfigured) {
        return (
          '<div class="video-card">' +
            '<div class="video-embed video-embed--unconfigured">' +
              '<p class="video-placeholder-msg">⚠ VIDEO NON CONFIGURATO<br>Inserisci un link YouTube in SERIES_VIDEOS (script.js)</p>' +
            '</div>' +
            '<p class="video-caption">' + escapeHtml(video.title) + '</p>' +
          '</div>'
        );
      }

      const embedId = extractYouTubeId(video.videoId);
      return (
        '<div class="video-card">' +
          '<div class="video-embed">' +
            '<iframe data-src="https://www.youtube.com/embed/' + encodeURIComponent(embedId) + '" title="' + escapeHtml(video.title) + '" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>' +
          '</div>' +
          '<p class="video-caption">' + escapeHtml(video.title) + '</p>' +
        '</div>'
      );
    }).join('');
  }

  function renderAllGrids() {
    Object.keys(SERIES_VIDEOS).forEach(renderVideoGrid);
  }


  /* --------------------------------------------------------------
     4. AREE PROTETTE DA PASSWORD

     Funzione generica riutilizzata sia dal tab Classified sia dal
     tab Admin — aggiungere in futuro un'altra area riservata non
     richiede altro che una nuova chiamata a setupPasswordGate().

     NOTA IMPORTANTE SULLA SICUREZZA: essendo un sito statico senza
     server, questo è (e non può che essere) un controllo lato
     client. Scoraggia i visitatori occasionali, ma chiunque apra
     il codice sorgente di questo file può leggere i codici in
     CLASSIFIED_CODES/ADMIN_CODES o saltare direttamente il
     controllo dagli strumenti sviluppatore del browser. Va bene
     per un easter egg narrativo (Classified) o per tenere il
     pannello Admin fuori dalla vista dei visitatori occasionali,
     ma non va trattato come una vera protezione di dati sensibili:
     per quello serve un'autenticazione lato server.
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
    onUnlock: () => {
      populateSeriesSelect();
      renderAddedEpisodes();
    }
  });


  /* --------------------------------------------------------------
     5. PANNELLO ADMIN — AGGIUNTA PERMANENTE DI EPISODI (FIRESTORE)

     Gli episodi aggiunti da qui vengono scritti nella collezione
     Firestore customEpisodes (vedi sezione 0 in cima al file) e
     appaiono SUBITO nella griglia video pubblica della serie
     scelta, per tutti i visitatori — non sono più una semplice
     "richiesta" in attesa: sono l'aggiunta stessa. Restano
     rimovibili in qualsiasi momento dall'elenco "EPISODI AGGIUNTI"
     qui sotto (rimozione reale dal database, non solo dalla vista).
     -------------------------------------------------------------- */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // --- Ascolto in tempo reale degli episodi salvati su Firestore ---
  // Ogni documento della collezione customEpisodes rappresenta UN
  // episodio pubblicato tramite il pannello Admin. onSnapshot tiene
  // il sito sincronizzato automaticamente: se un admin aggiunge o
  // rimuove un episodio da un altro dispositivo, questa pagina si
  // aggiorna da sola (griglie pubbliche + elenco Admin) senza bisogno
  // di ricaricare.

  let allCustomEpisodeDocs = []; // ultimo snapshot grezzo, per renderAddedEpisodes

  function listenToCustomEpisodes() {
    if (!db) return;

    db.collection(CUSTOM_EPISODES_COLLECTION)
      .orderBy('createdAt', 'asc')
      .onSnapshot(
        (snapshot) => {
          const bySeries = {};
          const allDocs = [];

          snapshot.forEach((doc) => {
            const data = doc.data();
            const entry = {
              id: doc.id,
              series: data.series,
              title: data.title,
              videoId: data.videoId,
              notes: data.notes || '',
              createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null
            };
            allDocs.push(entry);
            if (!bySeries[entry.series]) bySeries[entry.series] = [];
            bySeries[entry.series].push({ title: entry.title, videoId: entry.videoId });
          });

          customEpisodesBySeries = bySeries;
          allCustomEpisodeDocs = allDocs;

          renderAllGrids();
          renderAddedEpisodes();
          setSyncStatus('Sincronizzato — ' + allDocs.length + ' episodi aggiunti trovati su Firestore.', 'ok');
        },
        (err) => {
          console.error('Errore di lettura da Firestore:', err);
          setSyncStatus('Errore di lettura da Firestore (' + err.code + ') — controlla le regole di sicurezza del database.', 'error');
        }
      );
  }

  function deleteCustomEpisode(id) {
    if (!db) return;
    const btn = document.querySelector('.request-delete[data-id="' + id + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    db.collection(CUSTOM_EPISODES_COLLECTION).doc(id).delete().catch((err) => {
      console.error('Impossibile eliminare l\'episodio:', err);
      setSyncStatus('Errore durante l\'eliminazione — riprova.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'ELIMINA'; }
    });
    // Nessun re-render manuale qui: onSnapshot riceverà il cambiamento
    // e aggiornerà automaticamente griglie ed elenco Admin.
  }

  function renderAddedEpisodes() {
    const container = document.getElementById('addedEpisodesList');
    if (!container) return;

    if (allCustomEpisodeDocs.length === 0) {
      container.innerHTML = '<p class="empty-state">Nessun episodio aggiunto tramite il pannello finora.</p>';
      return;
    }

    // Più recenti in cima
    const docs = allCustomEpisodeDocs.slice().reverse();

    container.innerHTML = docs.map((ep) => {
      const notesHtml = ep.notes
        ? '<p class="request-notes">' + escapeHtml(ep.notes) + '</p>'
        : '';
      const addedAt = ep.createdAt ? ep.createdAt.toLocaleString('it-IT') : '';
      const seriesLabel = SERIES_LABELS[ep.series] || ep.series;

      return (
        '<div class="request-card">' +
          '<div class="request-card-header">' +
            '<span class="entity-name">' + escapeHtml(seriesLabel) + ' — ' + escapeHtml(ep.title) + '</span>' +
            '<button type="button" class="request-delete" data-id="' + escapeHtml(ep.id) + '">ELIMINA</button>' +
          '</div>' +
          '<p class="request-link"><a href="' + escapeHtml(ep.videoId) + '" target="_blank" rel="noopener">' + escapeHtml(ep.videoId) + '</a></p>' +
          notesHtml +
          '<p class="request-meta">Pubblicato il ' + addedAt + '</p>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('.request-delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteCustomEpisode(btn.dataset.id));
    });
  }

  // --- Select "Serie" nel form Admin, popolata da SERIES_VIDEOS ---

  const seriesSelect = document.getElementById('reqSeriesSelect');

  function populateSeriesSelect() {
    if (!seriesSelect) return;
    seriesSelect.innerHTML = Object.keys(SERIES_VIDEOS).map((key) => {
      const label = SERIES_LABELS[key] || key;
      return '<option value="' + escapeHtml(key) + '">' + escapeHtml(label) + '</option>';
    }).join('');
  }

  // --- Righe episodio dinamiche nel form di aggiunta ---

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

  // --- Invio del form: pubblica davvero gli episodi su Firestore ---

  const requestForm = document.getElementById('requestForm');
  const requestSubmitBtn = document.getElementById('requestSubmitBtn');

  function setFormStatus(message, state) {
    const el = document.getElementById('requestFormStatus');
    if (!el) return;
    el.textContent = message;
    if (state) {
      el.setAttribute('data-state', state);
    } else {
      el.removeAttribute('data-state');
    }
  }

  if (requestForm) {
    requestForm.addEventListener('submit', (event) => {
      event.preventDefault();
      setFormStatus('', null);

      if (!firebaseReady || !db) {
        setFormStatus('Firebase non configurato: impossibile pubblicare in modo permanente. Vedi FIREBASE_CONFIG in script.js.', 'error');
        return;
      }

      const series = seriesSelect ? seriesSelect.value : '';
      if (!series || !SERIES_VIDEOS[series]) {
        setFormStatus('Seleziona una serie valida.', 'error');
        return;
      }

      const notes = document.getElementById('reqNotes').value.trim();

      const episodes = Array.from(episodesList.querySelectorAll('.episode-row'))
        .map((row) => ({
          name: row.querySelector('.episode-name').value.trim(),
          link: row.querySelector('.episode-link').value.trim()
        }))
        .filter((ep) => ep.name && ep.link);

      if (episodes.length === 0) {
        setFormStatus('Inserisci almeno un episodio con nome e link YouTube.', 'error');
        return;
      }

      if (requestSubmitBtn) { requestSubmitBtn.disabled = true; }
      setFormStatus('Pubblicazione in corso…', null);

      const batch = db.batch();
      episodes.forEach((ep) => {
        const docRef = db.collection(CUSTOM_EPISODES_COLLECTION).doc();
        batch.set(docRef, {
          series: series,
          title: ep.name,
          videoId: ep.link,
          notes: notes,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      batch.commit()
        .then(() => {
          setFormStatus(episodes.length + ' episodio/i pubblicato/i con successo su ' + (SERIES_LABELS[series] || series) + '.', 'ok');
          requestForm.reset();
          resetEpisodesList();
          populateSeriesSelect();
        })
        .catch((err) => {
          console.error('Errore durante la pubblicazione:', err);
          setFormStatus('Errore durante la pubblicazione (' + err.code + ') — riprova.', 'error');
        })
        .finally(() => {
          if (requestSubmitBtn) { requestSubmitBtn.disabled = false; }
        });
    });
  }


  /* --------------------------------------------------------------
     6. TOGGLE EFFETTO CRT
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
     7. OROLOGIO DI SISTEMA (puro dettaglio atmosferico)
     -------------------------------------------------------------- */

  const headerClock = document.getElementById('headerClock');
  const lastSync = document.getElementById('lastSync');

  function updateClock() {
    if (!headerClock) return;
    const now = new Date();
    headerClock.textContent = now.toLocaleTimeString('it-IT');
  }


  /* --------------------------------------------------------------
     8. INIZIALIZZAZIONE
     -------------------------------------------------------------- */

  function init() {
    // Genera le griglie video di ogni serie da SERIES_VIDEOS (poi
    // ridisegnate automaticamente quando arrivano gli episodi da
    // Firestore, vedi listenToCustomEpisodes)
    renderAllGrids();

    // Connette Firestore e si mette in ascolto degli episodi
    // aggiunti da Admin, su qualunque dispositivo essi vengano
    // pubblicati
    initFirebase();

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

    // Prepara la select delle serie e una riga episodio vuota nel
    // form Admin
    populateSeriesSelect();
    resetEpisodesList();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
