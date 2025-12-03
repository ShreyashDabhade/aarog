// frontend/src/api/consentApi.js
const API_BASE = "http://127.0.0.1:8000/secure/consent";

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("access_token");
  if (!token) {
    throw new Error("Not authenticated. Please log in again.");
  }

  return {
    ...extra,
    Authorization: `Bearer ${token}`,       // 👈 IMPORTANT
  };
}

// ---------- CONSENTS ----------

export async function fetchConsents() {
  const res = await fetch(`${API_BASE}/`, {
    method: "GET",
    headers: getAuthHeaders({
      "Accept": "application/json",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("fetchConsents error:", res.status, text);
    throw new Error(text || "Failed to fetch consents");
  }

  return res.json();
}

export async function createConsent(payload) {
  const res = await fetch(`${API_BASE}/`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
      "Accept": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("createConsent error:", res.status, text);
    throw new Error(text || "Failed to create consent");
  }

  return res.json();
}

export async function revokeConsent(consentId) {
  const res = await fetch(`${API_BASE}/${consentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("revokeConsent error:", res.status, text);
    throw new Error(text || "Failed to revoke consent");
  }

  return res.json();
}

// ---------- EMERGENCY CONTACTS ----------

export async function fetchEmergencyContacts() {
  const res = await fetch(`${API_BASE}/emergency`, {
    method: "GET",
    headers: getAuthHeaders({
      "Accept": "application/json",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("fetchEmergencyContacts error:", res.status, text);
    throw new Error(text || "Failed to fetch emergency contacts");
  }

  return res.json();
}

export async function addEmergencyContact(payload) {
  const res = await fetch(`${API_BASE}/emergency`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
      "Accept": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("addEmergencyContact error:", res.status, text);
    throw new Error(text || "Failed to add emergency contact");
  }

  return res.json();
}

export async function deleteEmergencyContact(id) {
  const res = await fetch(`${API_BASE}/emergency/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("deleteEmergencyContact error:", res.status, text);
    throw new Error(text || "Failed to delete emergency contact");
  }

  return res.json();
}
