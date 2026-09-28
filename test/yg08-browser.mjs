// Run against the built local server on port 3008 with the YG-08 development owner.
// Uses the installed gstack browser; no browser dependency is added to the app.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const binary = process.env.YG08_BROWSE ?? `${homedir()}/.codex/skills/gstack/browse/dist/browse`;
const browse = (...args) => execFileSync(binary, args, { encoding: 'utf8' });
const js = code => browse('js', code);
const check = (condition, label) => {
  js(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(label)}); return 'PASS'; })()`);
  console.log(`PASS ${label}`);
};
const search = q => { browse('fill', '#search-query', q); browse('press', 'Enter'); };
const wait = selector => browse('wait', selector);

browse('newtab', 'http://127.0.0.1:3008');
js("sessionStorage.removeItem('yggdrasil-session')");
browse('reload');
const q = `browser-${Date.now()}`;
js(`(async () => { const response = await fetch('/api/documents', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({title:${JSON.stringify(q)},body:'YG08 browser search body'}) }); if (response.status !== 201) throw new Error('fixture creation failed'); return 'seeded'; })()`);
browse('click', '[aria-keyshortcuts]');
check("document.querySelector('dialog').open && document.activeElement.id === 'search-query'", 'dialog opens and focuses input');
browse('press', 'Escape');
check("!document.querySelector('dialog').open && document.activeElement.hasAttribute('aria-keyshortcuts')", 'Escape restores focus');
browse('press', 'Meta+k');
search(q);
wait('dialog li');
check(`document.querySelector('dialog').textContent.includes(${JSON.stringify(q)}) && document.querySelector('dialog').textContent.includes('YG08 browser search body')`, 'Cmd+K searches persisted document');
browse('screenshot', '--selector', 'dialog', '/tmp/yg08-search.png');
search(`no-results-${q}`);
wait('text=No results found.');
check("document.querySelectorAll('dialog li').length === 0", 'empty result');
browse('press', 'Escape');
check("!document.querySelector('dialog').open", 'Escape closes populated search input');
browse('press', 'Control+k');
check("document.querySelector('dialog').open", 'Ctrl+K opens dialog');

// Deliberately resolve an aborted request after a newer response.
js("window.yg08Fetch = window.fetch; window.fetch = (url, init) => String(url).startsWith('/api/search') ? new Promise(resolve => { window.yg08Pending ??= []; window.yg08Pending.push(resolve); }) : window.yg08Fetch(url, init)");
search('old');
check("document.querySelector('dialog').textContent.includes('Searching…')", 'loading state');
search('new');
js("window.yg08Pending[1](new Response(JSON.stringify([{kind:'document',id:'new',title:'LATEST',preview:'new result'}]),{headers:{'content-type':'application/json'}}))");
wait('dialog li');
js("window.yg08Pending[0](new Response(JSON.stringify([{kind:'document',id:'old',title:'STALE',preview:'old result'}]),{headers:{'content-type':'application/json'}}))");
check("document.querySelector('dialog').textContent.includes('LATEST') && !document.querySelector('dialog').textContent.includes('STALE')", 'late response cannot overwrite newer results');
js("window.fetch = async (url, init) => String(url).startsWith('/api/search') ? new Response('{}',{status:500}) : window.yg08Fetch(url,init)");
search('error');
wait('dialog [role=alert]');
check("document.querySelector('dialog [role=alert]').textContent.includes('Could not search')", 'server failure state');
js("window.fetch = window.yg08Fetch");
browse('press', 'Escape');
// Prepare a session change, then apply it while a search is in flight.
browse('fill', '#bearer-token', 'invalid-yg08-browser-session');
browse('press', 'Meta+k');
search(q);
wait('dialog li');
js("window.fetch = (url, init) => String(url).startsWith('/api/search') ? new Promise(resolve => { window.yg08Late = resolve; }) : window.yg08Fetch(url,init)");
search('pending-before-session-change');
js("document.querySelector('[aria-label=Session] form').requestSubmit()");
check("document.querySelectorAll('dialog li').length === 0 && document.querySelector('#search-query').value === ''", 'session change clears previous owner state');
js("window.yg08Late(new Response(JSON.stringify([{kind:'document',id:'secret',title:'OLD OWNER SECRET',preview:'private'}]),{headers:{'content-type':'application/json'}})); window.fetch = window.yg08Fetch");
check("!document.querySelector('dialog').textContent.includes('OLD OWNER SECRET')", 'late previous-owner response stays hidden');
search(q);
wait('dialog [role=alert]');
check("document.querySelector('dialog [role=alert]').textContent.includes('Sign in')", 'real HTTP 401 sign-in state');
browse('press', 'Escape');
browse('click', 'text=Clear session');
console.log('YG-08 browser acceptance passed');
