const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/policy';

function getAuthHeaders(extra = {}) {
  // Use 'token' to match useAuthStore
  const token = localStorage.getItem("token"); 
  if (!token) {
    throw new Error("Not authenticated. Please log in again.");
  }

  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchConsents() {
  const res = await fetch(`${API_BASE}/consent`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createConsent(payload) {
  const res = await fetch(`${API_BASE}/consent`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function revokeConsent(consentId) {
  const res = await fetch(`${API_BASE}/consent/${consentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchEmergencyContacts() {
  const res = await fetch(`${API_BASE}/emergency`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addEmergencyContact(payload) {
  const res = await fetch(`${API_BASE}/emergency`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteEmergencyContact(id) {
  const res = await fetch(`${API_BASE}/emergency/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}