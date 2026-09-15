import { FormEvent, useState } from 'react';

export function LoginView({ token, onSave }: { token: string; onSave: (token: string) => void }) {
  const [value, setValue] = useState(token);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(value.trim());
  }

  return <section aria-label="Session">
    <h2>Session</h2>
    <p>{token ? 'Bearer session saved for this browser session.' : 'No bearer session active.'}</p>
    <form onSubmit={submit}>
      <label htmlFor="bearer-token">Supabase access token</label>
      <input id="bearer-token" type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" />
      <button>{token ? 'Update session' : 'Use session'}</button>
      {token && <button type="button" onClick={() => { setValue(''); onSave(''); }}>Clear session</button>}
    </form>
  </section>;
}
