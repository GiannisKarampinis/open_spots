const { useState } = React;

function App() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState({ loading: false, message: '', error: false, payload: null });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, message: 'Sending request...', error: false, payload: null });

    try {
      const response = await fetch('/api/v1/accounts/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || JSON.stringify(data));
      }

      setStatus({ loading: false, message: 'Registration successful!', error: false, payload: data });
      setForm({ username: '', email: '', password: '' });
    } catch (error) {
      setStatus({ loading: false, message: error.message || 'Request failed.', error: true, payload: null });
    }
  };

  return (
    <div>
      <h1>React Register Demo</h1>
      <p>Use this page as a starting point for migrating your HTML form to React.</p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" value={form.username} onChange={handleChange} required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
        </div>
        <button className="button" type="submit" disabled={status.loading}>
          {status.loading ? 'Submitting...' : 'Register'}
        </button>
      </form>

      {status.message && (
        <div className={`status ${status.error ? 'error' : 'success'}`}>{status.message}</div>
      )}

      {status.payload && (
        <div className="code">{JSON.stringify(status.payload, null, 2)}</div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
