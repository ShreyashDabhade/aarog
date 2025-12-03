import React, { useEffect, useState } from "react";
import {
  fetchConsents,
  createConsent,
  revokeConsent,
  fetchEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
} from "../api/consentApi";
import { useAuthStore } from "../store/authStore";

export default function ConsentAndEmergency() {
  const [consents, setConsents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // form state: consent
  const [granteeEmail, setGranteeEmail] = useState("");
  const [scope, setScope] = useState("all_records");
  const [recordId, setRecordId] = useState("");
  const [level, setLevel] = useState("view");
  const [emergencyOnly, setEmergencyOnly] = useState(false);

  // form state: emergency contact
  const [contactEmail, setContactEmail] = useState("");
  const [priority, setPriority] = useState(1);
  const [canApprove, setCanApprove] = useState(true);

  // logged-in user (for email when re-authenticating)
  const user = useAuthStore((s) => s.user);
  const userEmail =
    user?.email || localStorage.getItem("user_email") || user?.username;

  // --- Helper: email -> user_id via backend ---
  async function getUserIdByEmail(email) {
    const token = localStorage.getItem("access_token") || "";
    const res = await fetch(
      `http://127.0.0.1:8000/auth/user/id?email=${encodeURIComponent(email)}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!res.ok) {
      let msg = "No user found with email: " + email;
      try {
        const data = await res.json();
        if (data.detail) msg = data.detail;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    return data.id;
  }

  // --- Helper: re-authenticate with password before sensitive action ---
  async function reauthenticateWithPassword(actionLabel) {
  // 1️⃣ Get email (from store/localStorage, or ask user)
  let email = userEmail;
  if (!email) {
    email = window.prompt(
      "To continue, please enter the email you use to log in:"
    );
    if (!email) {
      throw new Error("Action cancelled.");
    }
    // Remember it for next time
    localStorage.setItem("user_email", email);
  }

  // 2️⃣ Ask for password
  const password = window.prompt(
    `For security, please re-enter your password to ${actionLabel}.`
  );
  if (!password) {
    throw new Error("Action cancelled.");
  }

  // 3️⃣ Call backend /auth/token to verify
  const res = await fetch("http://127.0.0.1:8000/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: email,
      password: password,
    }),
  });

  if (!res.ok) {
    throw new Error("Password incorrect. Could not confirm this action.");
  }

  // We ignore the new token; we just care that the password is correct.
  return true;
}


  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const [c, ec] = await Promise.all([
        fetchConsents(),
        fetchEmergencyContacts(),
      ]);
      setConsents(c);
      setContacts(ec);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load consent data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // --- Create consent (patient → doctor/family) ---
  async function handleCreateConsent(e) {
    e.preventDefault();
    try {
      setError("");

      // 1) Re-auth with password
      await reauthenticateWithPassword("save this consent");

      // 2) Look up grantee_id from email
      const grantee_id = await getUserIdByEmail(granteeEmail);

      // 3) Build payload for backend
      const payload = {
        grantee_id,
        scope,
        record_id: scope === "specific_record" ? recordId || null : null,
        level,
        emergency_only: emergencyOnly,
        expires_at: null,
      };

      await createConsent(payload);

      // 4) Reset form + reload
      setGranteeEmail("");
      setRecordId("");
      setEmergencyOnly(false);
      await loadData();
    } catch (err) {
      console.error(err);
      // Don't scream for "Action cancelled"
      if (err.message === "Action cancelled.") return;
      setError(err.message || "Failed to create consent.");
    }
  }

  async function handleRevokeConsent(id) {
    try {
      setError("");
      await revokeConsent(id);
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to revoke consent.");
    }
  }

  // --- Add emergency contact (by email) ---
  async function handleAddContact(e) {
    e.preventDefault();
    try {
      setError("");
      console.log("Adding emergency contact:", contactEmail);

      // 1) Re-auth with password
      await reauthenticateWithPassword("add this emergency contact");

      // 2) Look up contact id via email
      const contact_id = await getUserIdByEmail(contactEmail);
      console.log("Resolved contact_id:", contact_id);

      const payload = {
        contact_id,
        can_approve: canApprove,
        priority: parseInt(priority, 10) || 1,
      };

      console.log("Sending payload to backend:", payload);
      await addEmergencyContact(payload);

      // 3) Reset form + reload
      setContactEmail("");
      setPriority(1);
      setCanApprove(true);
      await loadData();
    } catch (err) {
      console.error("Error adding contact:", err);
      if (err.message === "Action cancelled.") return;
      setError(err.message || "Failed to add emergency contact.");
      alert(err.message || "Failed to add emergency contact.");
    }
  }

  async function handleDeleteContact(id) {
    try {
      setError("");
      await deleteEmergencyContact(id);
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete emergency contact.");
    }
  }

  if (loading) {
    return <div style={{ padding: "1rem" }}>Loading consent settings...</div>;
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto" }}>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">
        Consent & Emergency Settings
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Manage who can access your records and who can approve access in an
        emergency.
      </p>

      {error && (
        <div
          style={{
            background: "#ffe5e5",
            color: "#b00020",
            padding: "0.5rem 1rem",
            margin: "1rem 0",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}

      {/* CONSENT CREATION */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 mt-6">
        <h2 className="text-lg font-semibold text-slate-800">
          Create New Consent
        </h2>
        <p className="text-sm text-slate-500">
          Grant a doctor or trusted person access to your records.
        </p>
        <form
          onSubmit={handleCreateConsent}
          style={{ display: "grid", gap: "0.75rem", maxWidth: "400px" }}
        >
          <label className="text-sm font-medium text-slate-700">
            Grantee Email (doctor/family):
            <input
              type="text"
              value={granteeEmail}
              onChange={(e) => setGranteeEmail(e.target.value)}
              placeholder="doctor@example.com"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              required
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Scope:
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="all_records">All my records</option>
              <option value="specific_record">Specific record only</option>
            </select>
          </label>

          {scope === "specific_record" && (
            <label className="text-sm font-medium text-slate-700">
              Record ID:
              <input
                type="text"
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                placeholder="UUID of report"
                required
              />
            </label>
          )}

          <label className="text-sm font-medium text-slate-700">
            Level:
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="view">View only</option>
              <option value="edit">Edit</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={emergencyOnly}
              onChange={(e) => setEmergencyOnly(e.target.checked)}
            />
            Only usable in emergency
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
          >
            Save Consent
          </button>
        </form>
      </section>

      {/* EXISTING CONSENTS */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 mt-8">
        <h2 className="text-lg font-semibold text-slate-800">
          Existing Consents
        </h2>
        {consents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No consents granted yet. Use the form above to grant access.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "0.5rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ccc" }}>ID</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Grantee ID</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Scope</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Record</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Level</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>
                  Emergency only
                </th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Active</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.grantee_id}</td>
                  <td>{c.scope}</td>
                  <td>{c.record_id || "-"}</td>
                  <td>{c.level}</td>
                  <td>{c.emergency_only ? "Yes" : "No"}</td>
                  <td>{c.active ? "Yes" : "No"}</td>
                  <td>
                    {c.active && (
                      <button
                        onClick={() => handleRevokeConsent(c.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* EMERGENCY CONTACTS */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 mt-8">
        <h2 className="text-lg font-semibold text-slate-800">
          Emergency Contacts
        </h2>

        <form
          onSubmit={handleAddContact}
          style={{ display: "grid", gap: "0.75rem", maxWidth: "400px" }}
        >
          <label className="text-sm font-medium text-slate-700">
            Contact Email:
            <input
              type="text"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="family@example.com"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              required
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Priority (1 = first to contact):
            <input
              type="number"
              min="1"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={canApprove}
              onChange={(e) => setCanApprove(e.target.checked)}
            />
            Can approve emergency access
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
          >
            Add Emergency Contact
          </button>
        </form>

        {contacts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No emergency contacts set yet.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "1rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ccc" }}>ID</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Contact ID</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Priority</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Can Approve</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Active</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.contact_id}</td>
                  <td>{c.priority}</td>
                  <td>{c.can_approve ? "Yes" : "No"}</td>
                  <td>{c.active ? "Yes" : "No"}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteContact(c.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
