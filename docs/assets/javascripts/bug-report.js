(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var WORKER_BUG_URL    = 'https://wiki-auth-69.galacticliaison.workers.dev/bug-report';
  var WORKER_ORIGIN     = 'https://wiki-auth-69.galacticliaison.workers.dev';
  var DISCORD_CLIENT_ID = '1506415042369945660';
  var CALLBACK_URL      = 'https://wiki-auth-69.galacticliaison.workers.dev/callback';
  var SITE_PATH_PREFIX  = '/elf-destiny-wiki/';

  // ── State ─────────────────────────────────────────────────────────────────
  var modal, modalForm, modalSuccess, modalError, submitBtn, severitySel, gameSel;
  var verifiedUsername = null;
  var currentSelection = { text: '', url: null };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function pageTitle() {
    return document.title.replace(/\s*[-–]\s*Elf Destiny Wiki\s*$/i, '').trim();
  }

  function pageSlug() {
    var path = window.location.pathname
      .replace(new RegExp('^' + SITE_PATH_PREFIX), '')
      .replace(/\/$/, '');
    return path || 'index';
  }

  function inferGameTag() {
    var p = window.location.pathname;
    if (p.indexOf('/eu5/') !== -1) return 'EU5';
    if (p.indexOf('/ck3/') !== -1) return 'CK3';
    return null;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function buildModal() {
    if (modal) return; // already built (instant-nav safe)
    modal = document.createElement('div');
    modal.id = 'br-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'br-modal-title');
    modal.innerHTML =
      '<div id="br-modal-dialog">' +
        '<h2 id="br-modal-title">Report a mod bug</h2>' +
        '<form id="br-modal-form" novalidate>' +
          '<p class="br-page-url"></p>' +
          '<div class="br-selection-block" style="display:none">' +
            '<label>Quoting this wiki passage</label>' +
            '<blockquote class="br-selection"></blockquote>' +
          '</div>' +
          '<label class="br-game-label" for="br-game">Game <span aria-hidden="true">*</span></label>' +
          '<select id="br-game" class="br-select">' +
            '<option value="">Select game…</option>' +
            '<option value="EU5">EU5</option>' +
            '<option value="CK3">CK3</option>' +
          '</select>' +
          '<label for="br-severity">Severity <span aria-hidden="true">*</span></label>' +
          '<select id="br-severity" class="br-select">' +
            '<option value="Sev 3">Sev 3 — Minor Bug (default)</option>' +
            '<option value="Sev 2">Sev 2 — Severe Bug</option>' +
            '<option value="Sev 1">Sev 1 — Crashes Game</option>' +
          '</select>' +
          '<label for="br-description">What\'s the bug? <span aria-hidden="true">*</span></label>' +
          '<textarea id="br-description" rows="5" required ' +
            'placeholder="Describe what happened, what you expected, and how to reproduce it…"></textarea>' +
          '<label>Discord identity <span aria-hidden="true">*</span></label>' +
          '<div id="br-discord-auth"></div>' +
          '<p id="br-discord-error"></p>' +
          '<p class="br-error" role="alert"></p>' +
          '<div class="br-actions">' +
            '<button type="submit" id="br-submit" disabled>Submit report</button>' +
            '<button type="button" id="br-cancel">Cancel</button>' +
          '</div>' +
        '</form>' +
        '<div id="br-modal-success">' +
          '<p>✓ Thanks! Your bug report has been filed.</p>' +
          '<a id="br-thread-link" href="#" target="_blank" rel="noopener">View thread on Discord →</a>' +
          '<div class="br-actions">' +
            '<button type="button" id="br-close-success">Close</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    modal.style.display = 'none';
    document.body.appendChild(modal);

    modalForm    = modal.querySelector('#br-modal-form');
    modalSuccess = modal.querySelector('#br-modal-success');
    modalError   = modal.querySelector('.br-error');
    submitBtn    = modal.querySelector('#br-submit');
    severitySel  = modal.querySelector('#br-severity');
    gameSel      = modal.querySelector('#br-game');

    modalSuccess.style.display = 'none';
    modalError.style.display   = 'none';

    modalForm.addEventListener('click', function (e) {
      if (e.target.id === 'br-discord-btn') startDiscordAuth();
    });
    modalForm.addEventListener('submit', onSubmit);
    modal.querySelector('#br-cancel').addEventListener('click', closeModal);
    modal.querySelector('#br-close-success').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
    });
  }

  function renderDiscordBtn() {
    modal.querySelector('#br-discord-auth').innerHTML =
      '<button type="button" id="br-discord-btn">Login with Discord</button>';
    modal.querySelector('#br-discord-error').textContent = '';
  }

  function openBugReportModal(opts) {
    opts = opts || {};
    buildModal();

    currentSelection = {
      text: opts.selectedText || '',
      url:  opts.selectionUrl || null,
    };

    verifiedUsername = null;
    modal.querySelector('.br-page-url').textContent = opts.pageUrl || window.location.href;

    var selBlock = modal.querySelector('.br-selection-block');
    if (currentSelection.text) {
      selBlock.style.display = '';
      modal.querySelector('.br-selection').textContent = currentSelection.text;
    } else {
      selBlock.style.display = 'none';
    }

    modal.querySelector('#br-description').value = '';
    modalError.style.display   = 'none';
    modalForm.style.display    = '';
    modalSuccess.style.display = 'none';
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submit report';
    renderDiscordBtn();

    var inferred = inferGameTag();
    var gameLabel = modal.querySelector('.br-game-label');
    if (inferred) {
      gameSel.value = inferred;
      gameSel.style.display = 'none';
      gameLabel.style.display = 'none';
    } else {
      gameSel.value = '';
      gameSel.style.display = '';
      gameLabel.style.display = '';
    }

    severitySel.value = 'Sev 3';

    modal.style.display = '';
    setTimeout(function () { modal.querySelector('#br-description').focus(); }, 50);
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  // ── Discord OAuth ─────────────────────────────────────────────────────────
  function startDiscordAuth() {
    var state = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('br-auth-state', state);

    var params = new URLSearchParams({
      client_id:     DISCORD_CLIENT_ID,
      redirect_uri:  CALLBACK_URL,
      response_type: 'code',
      scope:         'identify guilds',
      state:         state,
    });

    window.open(
      'https://discord.com/oauth2/authorize?' + params.toString(),
      'discord-auth',
      'width=500,height=700'
    );
  }

  function onAuthMessage(event) {
    if (event.origin !== WORKER_ORIGIN) return;
    var data = event.data;
    if (!data || data.type !== 'discord-auth') return;
    if (data.state !== sessionStorage.getItem('br-auth-state')) return;
    if (!modal || modal.style.display === 'none') return;

    var discordError = modal.querySelector('#br-discord-error');

    if (data.error) {
      discordError.textContent = data.error;
      return;
    }

    verifiedUsername = data.username;
    discordError.textContent = '';
    modal.querySelector('#br-discord-auth').innerHTML =
      '<span id="br-discord-verified">✓ ' + verifiedUsername + '</span>';
    submitBtn.disabled = false;
    modal.querySelector('#br-description').focus();
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function onSubmit(e) {
    e.preventDefault();
    var description = modal.querySelector('#br-description').value.trim();
    var gameTag     = gameSel.value;
    var severity    = severitySel.value;

    if (!description || !verifiedUsername || !gameTag) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';
    modalError.style.display = 'none';

    var payload = {
      pageUrl:     currentSelection.url || window.location.href,
      pageSlug:    pageSlug(),
      pageTitle:   pageTitle(),
      gameTag:     gameTag,
      severity:    severity,
      description: description,
      submitter:   verifiedUsername,
    };
    if (currentSelection.text) {
      payload.selectedText = currentSelection.text;
      payload.selectionUrl = currentSelection.url;
    }

    fetch(WORKER_BUG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Unknown error');
        modal.querySelector('#br-thread-link').href = data.threadUrl;
        modalForm.style.display    = 'none';
        modalSuccess.style.display = '';
      })
      .catch(function (err) {
        modalError.textContent = 'Something went wrong: ' + (err.message || 'please try again later.');
        modalError.style.display = '';
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Submit report';
      });
  }

  // ── Footer button delegation (instant-nav safe) ───────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.br-footer-button');
    if (!btn) return;
    e.preventDefault();
    openBugReportModal({
      pageUrl:   window.location.href,
      pageTitle: pageTitle(),
      pageSlug:  pageSlug(),
    });
  });

  window.addEventListener('message', onAuthMessage);

  // ── Public API for the highlight tooltip in suggest-edit.js ───────────────
  window.openBugReportModal = openBugReportModal;
}());
