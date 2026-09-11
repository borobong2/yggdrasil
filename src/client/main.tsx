import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureSuggestions } from './CaptureSuggestions.js';
import type { Capture } from '../contracts/items.js';

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [text, setText] = useState('');

  async function load() {
    const response = await fetch('/api/captures');
    if (response.ok) setCaptures(await response.json());
  }

  useEffect(() => void load(), []);

  async function capture(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) return;
    setText('');
    await load();
  }

  return <main>
    <h1>Inbox</h1>
    <form onSubmit={capture}>
      <label htmlFor="capture">Capture a thought</label>
      <textarea id="capture" value={text} onChange={(event) => setText(event.target.value)} required />
      <button>Capture</button>
    </form>
    <ul>{captures.map((capture) => <li key={capture.id}>{capture.text}<CaptureSuggestions captureId={capture.id} /></li>)}</ul>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
