// Elf Destiny Wiki — Suggest-Edit Worker
//
// Deploy in the Cloudflare Workers dashboard (workers.cloudflare.com).
// Secrets to add via Settings → Variables → Secrets:
//   GITHUB_PAT            — fine-grained PAT (Issues + Discussions read/write)
//   DISCORD_CLIENT_SECRET — from discord.com/developers/applications

const ALLOWED_ORIGIN    = 'https://galacticliaison.github.io';
const REPO_OWNER        = 'GalacticLiaison';
const REPO_NAME         = 'elf-destiny-wiki';
const ISSUE_LABEL       = 'wiki-suggestion';
const REPO_NODE_ID      = 'R_kgDOShPfEA';
const DISC_CAT_ID       = 'DIC_kwDOShPfEM4C9Y3q';
const DISCORD_CLIENT_ID = '1506415042369945660';  // from Discord Developer Portal
const DISCORD_GUILD_ID  = '1179053540161880074';   // right-click server → Copy Server ID
const CALLBACK_URL      = 'https://wiki-auth-69.galacticliaison.workers.dev/callback';

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

  // Exchange code for access token
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
    return popupResponse({ type: 'discord-auth', state, username: null,
      error: 'Discord authentication failed — please try again.' });
  }

  const { access_token } = await tokenRes.json();

  // Fetch user identity and guild list in parallel
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

// ── Response helper ───────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
