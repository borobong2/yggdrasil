import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureSuggestions } from './CaptureSuggestions.js';
import { CaptureDeliveryPlan } from './CaptureDeliveryPlan.js';
import { LoginView } from './LoginView.js';
import { PatSettings } from './PatSettings.js';
import { DocumentsWorkspace } from './DocumentsWorkspace.js';
import { EvidenceList } from './EvidenceList.js';
import { PlanningView } from './PlanningView.js';
import { BoardView } from './BoardView.js';
import type { Capture } from '../contracts/items.js';

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [text, setText] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('yggdrasil-session') ?? '');
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  function saveToken(next: string) {
    setToken(next);
    if (next) sessionStorage.setItem('yggdrasil-session', next);
    else sessionStorage.removeItem('yggdrasil-session');
  }

  async function load() {
    const response = await fetch('/api/captures', { headers });
    if (response.ok) setCaptures(await response.json());
  }

  useEffect(() => void load(), [token]);

  async function capture(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/captures', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) return;
    setText('');
    await load();
  }

  return <main>
    <h1>Inbox</h1>
    <LoginView token={token} onSave={saveToken} />
    <PatSettings token={token} />
    <DocumentsWorkspace token={token} />
    <EvidenceList token={token} />
    <form onSubmit={capture}>
      <label htmlFor="capture">Capture a thought</label>
      <textarea id="capture" value={text} onChange={(event) => setText(event.target.value)} required />
      <button>Capture</button>
    </form>
    <ul>{captures.map((capture) => <li key={capture.id}>{capture.text}<CaptureSuggestions captureId={capture.id} token={token} /><CaptureDeliveryPlan captureId={capture.id} token={token} /></li>)}</ul>
    <PlanningView token={token} />
    <BoardView token={token} />
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
