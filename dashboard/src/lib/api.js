import { API_BASE } from './constants'

export async function analyzeFile(file) {
  const form = new FormData()
  form.append('file', file)
  
  const res = await fetch(`${API_BASE}/analyze`, { 
    method: 'POST', 
    headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY || '' },
    body: form 
  })
  
  if (!res.ok) {
    throw new Error(`Server error ${res.status}: ${await res.text()}`)
  }
  
  return res.json()
}

let cachedToken = null;
let tokenExpiry = 0;

export async function getAuthToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  
  const res = await fetch(`${API_BASE}/api/auth/token`, {
    method: 'POST',
    headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY || '' }
  });
  
  if (!res.ok) {
    throw new Error('Failed to get auth token');
  }
  
  const data = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 mins
  return cachedToken;
}
