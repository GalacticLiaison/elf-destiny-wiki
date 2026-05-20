(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var WORKER_URL        = 'https://wiki-auth-69.galacticliaison.workers.dev/';
  var WORKER_ORIGIN     = 'https://wiki-auth-69.galacticliaison.workers.dev';
  var DISCORD_CLIENT_ID = '1506415042369945660';
  var CALLBACK_URL      = 'https://wiki-auth-69.galacticliaison.workers.dev/callback';

  // ── State ─────────────────────────────────────────────────────────────────
  var tooltip, modal, modalForm, modalSuccess, modalError, submitBtn;
  var verifiedUsername = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function pageTitle() {
    return document.title.replace(/\s*[-–]\s*Elf Destiny Wiki\s*$/i, '').trim();
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function buildTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = 'sw-tooltip';
    tooltip.innerHTML =
      '<button type="button" class="sw-tt-suggest">✏️ Suggest an edit</button>' +
      '<button type="button" class="sw-tt-bug">🐛 Report error in mod</button>';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    tooltip.querySelector('.sw-tt-suggest').addEventListener('click', function (e) {
      e.stopPropagation();
      hideTooltip();
      openModal();
    });

    tooltip.querySelector('.sw-tt-bug').addEventListener('click', function (e) {
      e.stopPropagation();
      var sel = window.getSelection();
      var selectedText = sel ? sel.toString().trim() : '';
      hideTooltip();
      if (!window.openBugReportModal) return;

      var basePath = window.location.href.split('#')[0];
      var fragment = '#:~:text=' + encodeURIComponent(selectedText.slice(0, 80));
      var slug = window.location.pathname
        .replace(/^\/elf-destiny-wiki\//, '')
        .replace(/\/$/, '') || 'index';

      window.openBugReportModal({
        pageUrl:      window.location.href,
        pageTitle:    pageTitle(),
        pageSlug:     slug,
        selectedText: selectedText,
        selectionUrl: basePath + fragment,
      });
    });
  }

  function showTooltip(rect) {
    tooltip.style.display = '';
    var left = rect.left + rect.width / 2;
    var top  = rect.top - tooltip.offsetHeight - 10;
    if (top < 8) top = rect.bottom + 10;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltip.offsetWidth - 8));
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'sw-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sw-modal-title');
    modal.innerHTML =
      '<div id="sw-modal-dialog">' +
        '<h2 id="sw-modal-title">Suggest an edit</h2>' +
        '<form id="sw-modal-form" novalidate>' +
          '<p class="sw-page-url"></p>' +
          '<label>Selected text</label>' +
          '<blockquote class="sw-selection"></blockquote>' +
          '<label for="sw-suggestion">Your suggestion <span aria-hidden="true">*</span></label>' +
          '<textarea id="sw-suggestion" rows="4" required placeholder="Describe what should change…"></textarea>' +
          '<label>Discord identity <span aria-hidden="true">*</span></label>' +
          '<div id="sw-discord-auth"></div>' +
          '<p id="sw-discord-error"></p>' +
          '<p class="sw-error" role="alert"></p>' +
          '<div class="sw-actions">' +
            '<button type="submit" id="sw-submit" disabled>Submit</button>' +
            '<button type="button" id="sw-cancel">Cancel</button>' +
          '</div>' +
        '</form>' +
        '<div id="sw-modal-success">' +
          '<p>✓ Thanks! Your suggestion has been filed.</p>' +
          '<a id="sw-issue-link" href="#" target="_blank" rel="noopener">View issue on GitHub →</a>' +
          '<div class="sw-actions">' +
            '<button type="button" id="sw-close-success">Close</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    modal.style.display = 'none';
    document.body.appendChild(modal);

    modalForm    = modal.querySelector('#sw-modal-form');
    modalSuccess = modal.querySelector('#sw-modal-success');
    modalError   = modal.querySelector('.sw-error');
    submitBtn    = modal.querySelector('#sw-submit');

    modalSuccess.style.display = 'none';
    modalError.style.display   = 'none';

    // Use event delegation for the Discord button — it gets replaced on each modal open
    modalForm.addEventListener('click', function (e) {
      if (e.target.id === 'sw-discord-btn') startDiscordAuth();
    });

    modalForm.addEventListener('submit', onSubmit);
    modal.querySelector('#sw-cancel').addEventListener('click', closeModal);
    modal.querySelector('#sw-close-success').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
    });
  }

  function renderDiscordBtn() {
    modal.querySelector('#sw-discord-auth').innerHTML =
      '<button type="button" id="sw-discord-btn">Login with Discord</button>';
    modal.querySelector('#sw-discord-error').textContent = '';
  }

  function openModal() {
    var sel = window.getSelection();
    var selectedText = sel ? sel.toString().trim() : '';

    verifiedUsername = null;
    modal.querySelector('.sw-page-url').textContent = window.location.href;
    modal.querySelector('.sw-selection').textContent = selectedText;
    modal.querySelector('#sw-suggestion').value = '';
    modalError.style.display   = 'none';
    modalForm.style.display    = '';
    modalSuccess.style.display = 'none';
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submit';
    renderDiscordBtn();
    modal.style.display = '';
    setTimeout(function () { modal.querySelector('#sw-suggestion').focus(); }, 50);
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  // ── Discord OAuth ─────────────────────────────────────────────────────────
  function startDiscordAuth() {
    var state = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('sw-auth-state', state);

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
    if (data.state !== sessionStorage.getItem('sw-auth-state')) return;

    var discordError = modal.querySelector('#sw-discord-error');

    if (data.error) {
      discordError.textContent = data.error;
      return;
    }

    verifiedUsername = data.username;
    discordError.textContent = '';
    modal.querySelector('#sw-discord-auth').innerHTML =
      '<span id="sw-discord-verified">✓ ' + verifiedUsername + '</span>';
    submitBtn.disabled = false;
    modal.querySelector('#sw-suggestion').focus();
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function onSubmit(e) {
    e.preventDefault();
    var suggestion   = modal.querySelector('#sw-suggestion').value.trim();
    var selectedText = modal.querySelector('.sw-selection').textContent.trim();
    if (!suggestion || !verifiedUsername) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';
    modalError.style.display = 'none';

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageUrl:      window.location.href,
        pageTitle:    pageTitle(),
        selectedText: selectedText,
        suggestion:   suggestion,
        submitter:    verifiedUsername,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Unknown error');
        modal.querySelector('#sw-issue-link').href = data.issueUrl;
        modalForm.style.display    = 'none';
        modalSuccess.style.display = '';
      })
      .catch(function () {
        modalError.textContent   = 'Something went wrong — please try again or open an issue directly on GitHub.';
        modalError.style.display = '';
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Submit';
      });
  }

  // ── Selection detection ───────────────────────────────────────────────────
  document.addEventListener('mouseup', function () {
    setTimeout(function () {
      var sel  = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (text.length > 5 && sel.rangeCount > 0) {
        showTooltip(sel.getRangeAt(0).getBoundingClientRect());
      } else {
        hideTooltip();
      }
    }, 50);
  });

  document.addEventListener('mousedown', function (e) {
    if (tooltip && !tooltip.contains(e.target)) hideTooltip();
  });

  window.addEventListener('scroll', hideTooltip, { passive: true });
  window.addEventListener('message', onAuthMessage);

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { buildTooltip(); buildModal(); });
  } else {
    buildTooltip();
    buildModal();
  }

}());
