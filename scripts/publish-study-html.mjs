// Private study content stays outside Git. --prepare is read-only remotely; --publish writes only after schema deployment.
// YGGDRASIL_PAT must be supplied through the environment, never a command-line argument.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const [directory, mode] = process.argv.slice(2);
if (!directory || !['--prepare', '--publish'].includes(mode)) throw Error('Usage: node scripts/publish-study-html.mjs <private-source-directory> --prepare|--publish');
if (!process.env.YGGDRASIL_PAT) throw Error('YGGDRASIL_PAT is required');
const dir = resolve(directory);
const sourceIds = JSON.parse(readFileSync(join(dir, 'published.json'), 'utf8'));
const sourceFile = join(dir, 'html-source-snapshots.json');
const editionsFile = join(dir, 'html-publication.json');
const editions = existsSync(editionsFile) ? JSON.parse(readFileSync(editionsFile, 'utf8')) : {};
const sha = body => createHash('sha256').update(body).digest('hex');
const keys = ['plan', 'llm-core', 'llm-qa', 'llm-mock', 'nlp-core', 'nlp-qa', 'nlp-practice'];
const client = new Client({ name: 'study-html-publication', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.YGGDRASIL_MCP_URL || 'https://yg.justrunlab.com/mcp'), { requestInit: { headers: { authorization: `Bearer ${process.env.YGGDRASIL_PAT}` } } }));
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw Error(name + ': ' + JSON.stringify(result.content).slice(0, 250));
  return JSON.parse(result.content[0].text);
}
try {
  if (mode === '--prepare') {
    const snapshots = {};
    for (const key of keys) {
      if (!sourceIds[key]) throw Error('Missing source ID: ' + key);
      const doc = await call('read_document', { id: sourceIds[key] });
      if (doc.format && doc.format !== 'markdown') throw Error('Source must be Markdown: ' + key);
      writeFileSync(join(dir, key + '.md'), doc.body);
      snapshots[key] = { id: doc.id, title: doc.title, parentId: doc.parentId, hash: sha(doc.body) };
    }
    writeFileSync(sourceFile, JSON.stringify(snapshots, null, 2) + '\n');
    console.log('Prepared 7 current source snapshots. Run generate-study-html.ts, then verify-html-documents.mjs. No remote writes.');
  } else {
    const snapshots = JSON.parse(readFileSync(sourceFile, 'utf8'));
    const generated = JSON.parse(readFileSync(join(dir, 'html-manifest.json'), 'utf8'));
    const tools = await client.listTools();
    if (!tools.tools.find(t => t.name === 'create_document')?.inputSchema?.properties?.format) throw Error('HTML document API is not deployed yet');
    // Preflight the entire batch before any write. Changed sources or user-edited editions require manual regeneration/review.
    const bodies = {};
    for (const key of keys) {
      const source = await call('read_document', { id: snapshots[key].id });
      if (sha(source.body) !== snapshots[key].hash) throw Error('Source changed; prepare and regenerate before publishing: ' + key);
      bodies[key] = readFileSync(join(dir, key + '.html'), 'utf8');
      const provenance = generated.find(entry => entry.file === key + '.html');
      if (provenance?.sourceHash !== snapshots[key].hash || provenance?.htmlHash !== sha(bodies[key])) throw Error('Generated HTML is stale or changed; regenerate before publishing: ' + key);
      if (!bodies[key].startsWith('<!doctype html>') || bodies[key].length > 100_000 || /<script\b/i.test(bodies[key])) throw Error('Invalid HTML edition: ' + key);
      if (editions[key]) {
        const current = await call('read_document', { id: editions[key].id });
        if (sha(current.body) !== editions[key].hash) throw Error('Edition was edited in Yggdrasil; refusing overwrite: ' + key);
      }
    }
    for (const key of keys) {
      const body = bodies[key]; const source = snapshots[key];
      const title = source.title + ' · HTML';
      const doc = editions[key]
        ? await call('update_document', { id: editions[key].id, title, body, format: 'html' })
        : await call('create_document', { title, body, format: 'html', icon: '📖', ...(source.parentId ? { parentId: source.parentId } : {}) });
      editions[key] = { id: doc.id, hash: sha(body), sourceId: source.id, sourceHash: source.hash };
      writeFileSync(editionsFile, JSON.stringify(editions, null, 2) + '\n');
      const verified = await call('read_document', { id: doc.id });
      if (verified.format !== 'html' || verified.body !== body) throw Error('Readback verification failed: ' + key);
      console.log('Verified', key, 'https://yg.justrunlab.com/#document-' + doc.id);
    }
  }
} finally { await client.close(); }
