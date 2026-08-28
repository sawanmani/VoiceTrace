import { API_BASE } from './constants'

export async function analyzeFile(file) {
  const form = new FormData()
  form.append('file', file)
  
  const res = await fetch(`${API_BASE}/analyze`, { 
    method: 'POST', 
    body: form 
  })
  
  if (!res.ok) {
    throw new Error(`Server error ${res.status}: ${await res.text()}`)
  }
  
  return res.json()
}
