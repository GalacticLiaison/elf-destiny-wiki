// Elf Destiny Wiki — Suggest-Edit + Bug-Report Worker
//
// Deploy in the Cloudflare Workers dashboard (workers.cloudflare.com).
// Secrets to add via Settings → Variables → Secrets:
//   GITHUB_PAT            — fine-grained PAT (Issues + Discussions read/write)
//   DISCORD_CLIENT_SECRET — from discord.com/developers/applications
//   DISCORD_BOT_TOKEN     — bot token from the same Discord application
//                           (needs Send Messages in Threads + Create Public Threads
//                            on the #error-reports forum channel)

const ALLOWED_ORIGIN        = 'https://galacticliaison.github.io';
const REPO_OWNER            = 'GalacticLiaison';
const REPO_NAME             = 'elf-destiny-wiki';
const ISSUE_LABEL           = 'wiki-suggestion';
const REPO_NODE_ID          = 'R_kgDOShPfEA';
const DISC_CAT_ID           = 'DIC_kwDOShPfEM4C9Y3q';
const DISCORD_CLIENT_ID     = '1506415042369945660';
const DISCORD_GUILD_ID      = '1179053540161880074';
const CALLBACK_URL          = 'https://wiki-auth-69.galacticliaison.workers.dev/callback';
const BUG_REPORT_CHANNEL_ID = '1203067993018597416'; // #error-reports forum channel

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/callback') {
      return handleDiscordCallback(url, env);
    }

    if (request.method === 'POST' && url.pathname === '/') {
      if (request.headers.get('Origin') !== ALLOWED_ORIGIN) {
        return new Response('Forbidden', { status: 403 });
      }
      return handleIssueCreate(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/bug-report') {
      if (request.headers.get('Origin') !== ALLOWED_ORIGIN) {
        return new Response('Forbidden', { status: 403 });
      }
      return handleBugReportCreate(request, env);
    }

    return new Response('Not found', { status: 404 });
  }
};

// ── Discord OAuth callback ────────────────────────────────────────────────

async function handleDiscordCallback(url, env) {
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return popupResponse({ type: 'discord-auth', state: state || '', username: null,
      error: 'Invalid OAuth response — please try again.' });
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  CALLBACK_URL,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    return popupResponse({ type: 'discord-auth', state, username: null,
      error: 'Discord error ' + tokenRes.status + ': ' + errBody });
  }

  const { access_token } = await tokenRes.json();

  const [userRes, guildsRes] = await Promise.all([
    fetch('https://discord.com/api/users/@me',        { headers: { 'Authorization': 'Bearer ' + access_token } }),
    fetch('https://discord.com/api/users/@me/guilds', { headers: { 'Authorization': 'Bearer ' + access_token } }),
  ]);

  const user   = await userRes.json();
  const guilds = await guildsRes.json();

  const isMember = Array.isArray(guilds) && guilds.some(g => g.id === DISCORD_GUILD_ID);
  if (!isMember) {
    return popupResponse({ type: 'discord-auth', state, username: null,
      error: 'You must be a member of the Elf Destiny Discord server to submit suggestions.' });
  }

  const displayName = (user.global_name || user.username) + ' (@' + user.username + ')';
  return popupResponse({ type: 'discord-auth', state, username: displayName, error: null });
}

function popupResponse(data) {
  const html =
    '<!DOCTYPE html><html><head><title>Authenticating…</title></head><body>' +
    '<p style="font-family:sans-serif;text-align:center;margin-top:3rem;color:#555">Authenticating…</p>' +
    '<script>try{window.opener&&window.opener.postMessage(' +
      JSON.stringify(data) + ',"' + ALLOWED_ORIGIN + '");}catch(e){}window.close();<\/script>' +
    '</body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// ── Issue creation ────────────────────────────────────────────────────────

async function handleIssueCreate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const { pageUrl, pageTitle, selectedText, suggestion, submitter } = body;
  if (!pageUrl || !pageTitle || !selectedText || !suggestion || !submitter) {
    return json({ ok: false, error: 'Missing fields' }, 400);
  }

  const issueTitle = 'Wiki suggestion: ' + pageTitle;
  const issueBody  =
    '**Page:** ' + pageUrl + '\n\n' +
    '**Selected text:**\n> ' + selectedText.replace(/\n/g, '\n> ') + '\n\n' +
    '**Suggestion:**\n' + suggestion + '\n\n' +
    '**Submitted by:** ' + submitter + '\n\n' +
    '---\n*Submitted via the wiki suggestion tool*';

  const issueRes = await ghFetch(env.GITHUB_PAT,
    'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/issues',
    { title: issueTitle, body: issueBody, labels: [ISSUE_LABEL] }
  );

  if (!issueRes.ok) {
    return json({ ok: false, error: 'GitHub Issues API error: ' + issueRes.status }, 502);
  }

  const issue = await issueRes.json();

  try { await postToDiscussion(env.GITHUB_PAT, pageUrl, issueTitle, issue.html_url); }
  catch (_) {}

  return json({ ok: true, issueUrl: issue.html_url });
}

// ── GitHub helpers ────────────────────────────────────────────────────────

function ghFetch(pat, url, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + pat,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
      'User-Agent':    'elf-destiny-wiki-suggest',
    },
    body: JSON.stringify(body),
  });
}

function ghGraphQL(pat, query, variables) {
  return fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + pat,
      'Content-Type':  'application/json',
      'User-Agent':    'elf-destiny-wiki-suggest',
    },
    body: JSON.stringify({ query, variables }),
  }).then(r => r.json());
}

async function postToDiscussion(pat, pageUrl, issueTitle, issueUrl) {
  const pathname    = new URL(pageUrl).pathname;
  const searchQuery = 'repo:' + REPO_OWNER + '/' + REPO_NAME + ' ' + pathname + ' in:title';

  const data = await ghGraphQL(pat,
    `query FindDiscussion($q: String!) {
       search(type: DISCUSSION, query: $q, first: 1) {
         nodes { ... on Discussion { id } }
       }
     }`,
    { q: searchQuery }
  );

  const nodes = data?.data?.search?.nodes;
  let discussionId;

  if (nodes && nodes.length > 0) {
    discussionId = nodes[0].id;
  } else {
    const created = await ghGraphQL(pat,
      `mutation CreateDiscussion($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
         createDiscussion(input: { repositoryId: $repoId, categoryId: $catId, title: $title, body: $body }) {
           discussion { id }
         }
       }`,
      { repoId: REPO_NODE_ID, catId: DISC_CAT_ID, title: pathname,
        body: 'Suggestions and discussion for this wiki page.' }
    );
    discussionId = created?.data?.createDiscussion?.discussion?.id;
    if (!discussionId) return;
  }

  const commentBody =
    'A suggestion was submitted for this page and filed as a GitHub issue:\n' +
    '**[' + issueTitle + '](' + issueUrl + ')**';

  await ghGraphQL(pat,
    `mutation AddComment($discussionId: ID!, $body: String!) {
       addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
         comment { url }
       }
     }`,
    { discussionId, body: commentBody }
  );
}

// ── Bug-report (Discord forum thread) creation ────────────────────────────

let cachedForumTags = null; // cached for the worker instance lifetime

async function handleBugReportCreate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const { pageUrl, pageSlug, pageTitle, gameTag, severity,
          description, selectedText, selectionUrl, submitter } = body;

  if (!pageUrl || !pageSlug || !pageTitle || !gameTag ||
      !severity || !description || !submitter) {
    return json({ ok: false, error: 'Missing fields' }, 400);
  }

  let tagIds;
  try {
    tagIds = await resolveForumTagIds(env, gameTag, severity);
  } catch (e) {
    return json({ ok: false, error: 'Could not resolve forum tags: ' + e.message }, 502);
  }

  const threadName = buildBugThreadName(pageTitle, description);
  const threadBody = buildBugThreadBody({
    pageTitle, pageUrl, selectionUrl, selectedText,
    description, submitter, severity, pageSlug,
  });

  const createRes = await fetch(
    'https://discord.com/api/v10/channels/' + BUG_REPORT_CHANNEL_ID + '/threads',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bot ' + env.DISCORD_BOT_TOKEN,
        'Content-Type':  'application/json',
        'User-Agent':    'elf-destiny-wiki-bug-report',
      },
      body: JSON.stringify({
        name: threadName,
        message: { content: threadBody },
        applied_tags: tagIds,
      }),
    }
  );

  if (!createRes.ok) {
    const errBody = await createRes.text();
    return json({ ok: false, error: 'Discord API error ' + createRes.status + ': ' + errBody }, 502);
  }

  const thread = await createRes.json();
  const threadUrl = 'https://discord.com/channels/' + DISCORD_GUILD_ID + '/' + thread.id;
  return json({ ok: true, threadUrl: threadUrl, threadId: thread.id });
}

async function resolveForumTagIds(env, gameTag, severity) {
  if (!cachedForumTags) {
    const res = await fetch(
      'https://discord.com/api/v10/channels/' + BUG_REPORT_CHANNEL_ID,
      { headers: {
          'Authorization': 'Bot ' + env.DISCORD_BOT_TOKEN,
          'User-Agent':    'elf-destiny-wiki-bug-report',
      } }
    );
    if (!res.ok) throw new Error('channel fetch failed (' + res.status + ')');
    const channel = await res.json();
    cachedForumTags = channel.available_tags || [];
  }

  const gameTagObj = cachedForumTags.find(
    t => t.name.toLowerCase() === gameTag.toLowerCase()
  );
  if (!gameTagObj) throw new Error('game tag not found: ' + gameTag);

  // Severity input is "Sev 1" / "Sev 2" / "Sev 3"; forum tag names are
  // "Sev 1 - Crashes Game" etc. (may contain extra whitespace).
  const sevMatch = severity.match(/^sev\s*(\d)/i);
  if (!sevMatch) throw new Error('invalid severity format: ' + severity);
  const sevPattern = new RegExp('^sev\\s*' + sevMatch[1] + '\\b', 'i');
  const sevTagObj = cachedForumTags.find(t => sevPattern.test(t.name));
  if (!sevTagObj) throw new Error('severity tag not found: ' + severity);

  const unresolvedObj = cachedForumTags.find(
    t => t.name.toLowerCase() === 'unresolved'
  );

  const ids = [gameTagObj.id, sevTagObj.id];
  if (unresolvedObj) ids.push(unresolvedObj.id);
  return ids;
}

function buildBugThreadName(pageTitle, description) {
  const flat = description.replace(/\s+/g, ' ').trim();
  const snippet = flat.length > 50 ? flat.slice(0, 47) + '…' : flat;
  let name = '[wiki] ' + pageTitle + ': ' + snippet;
  if (name.length > 100) name = name.slice(0, 97) + '…'; // Discord thread name limit
  return name;
}

function buildBugThreadBody({ pageTitle, pageUrl, selectionUrl, selectedText,
                              description, submitter, severity, pageSlug }) {
  const linkUrl = selectionUrl || pageUrl;
  let body =
    '**Reported from wiki page:** [' + pageTitle + '](' + linkUrl + ')\n' +
    '**Reporter:** ' + submitter + '\n' +
    '**Severity:** ' + severity + '\n\n';

  if (selectedText) {
    const MAX_SEL = 1200; // leave room for the rest under Discord's 2000-char message limit
    const trimmed = selectedText.length > MAX_SEL
      ? selectedText.slice(0, MAX_SEL) + '…'
      : selectedText;
    body += '**Highlighted from wiki:**\n> ' + trimmed.replace(/\n/g, '\n> ') + '\n\n';
  }

  body += '---\n\n' + description + '\n\n<!-- wiki-page-slug: ' + pageSlug + ' -->';

  if (body.length > 1990) body = body.slice(0, 1987) + '…';
  return body;
}

// ── Response helper ───────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
