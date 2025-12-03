import React, { useEffect, useState } from "react";
import { useSearchParams } from 'react-router-dom'; // For auto-selecting file
import {
  fetchConsents,
  createConsent,
  revokeConsent,
  fetchEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
} from "../api/consentApi";
import { useAuthStore } from "../store/authStore";
import { cryptoService } from "../lib/crypto";
import { getContract } from "../lib/blockchain";
import { Shield, AlertTriangle, UserPlus, FileKey, Trash2, CheckCircle, XCircle, FileText, Activity } from "lucide-react";

export default function ConsentAndEmergency() {
  const [consents, setConsents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [myFiles, setMyFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();

  // form state: consent
  const [granteeEmail, setGranteeEmail] = useState("");
  const [doctorEthAddress, setDoctorEthAddress] = useState("");
  const [scope, setScope] = useState("all_records");
  const [selectedFileId, setSelectedFileId] = useState(""); 
  const [level, setLevel] = useState("view");
  const [emergencyOnly, setEmergencyOnly] = useState(false);

  // form state: emergency contact
  const [contactEmail, setContactEmail] = useState("");
  const [priority, setPriority] = useState(1);
  const [canApprove, setCanApprove] = useState(true);

  const { user, token, userPrivateKey } = useAuthStore();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      
      const [c, ec, filesResp] = await Promise.all([
        fetchConsents(),
        fetchEmergencyContacts(),
        fetch(`${API_URL}/my-records`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if(filesResp.ok) {
        setMyFiles(await filesResp.json());
      }

      setConsents(c);
      setContacts(ec);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().then(() => {
        // Auto-select file if redirected from Dashboard
        const preSelectedId = searchParams.get("reportId");
        if (preSelectedId) {
            setScope("specific_record");
            setSelectedFileId(preSelectedId);
        }
    });
  }, []);

  // --- UNIFIED SHARE FUNCTION ---
  async function handleCreateConsent(e) {
    e.preventDefault();
    if (!userPrivateKey) return alert("Security Key missing. Please relogin.");
    if (!doctorEthAddress) return alert("Blockchain Audit requires the Doctor's ETH Address.");

    try {
      setError("");
      
      // 1. Get Doctor Keys & ID
      const keyRes = await fetch(`${API_URL}/users/public-key?email=${encodeURIComponent(granteeEmail)}`, {
         headers: { Authorization: `Bearer ${token}` } 
      });
      if(!keyRes.ok) throw new Error("Recipient not found or has no key setup.");
      const { public_key: doctorPubKey } = await keyRes.json();
      
      const idRes = await fetch(`${API_URL}/auth/user/id?email=${encodeURIComponent(granteeEmail)}`, {
         headers: { Authorization: `Bearer ${token}` }
      });
      const { id: doctorId } = await idRes.json();

      // 2. Determine Files to Share
      let filesToShare = [];
      if (scope === 'specific_record') {
        const file = myFiles.find(f => f.id === selectedFileId);
        if (!file) throw new Error("Selected file not found.");
        filesToShare.push(file);
      } else {
        filesToShare = myFiles;
        if(!confirm(`You are about to create blockchain audit trails for ${filesToShare.length} files. This will require ${filesToShare.length} wallet signatures. Continue?`)) return;
      }

      // 3. Process Crypto Share & Blockchain Audit
      const contract = await getContract(); 

      for (const file of filesToShare) {
         console.log(`Processing file: ${file.filename}`);
         
         // A. Crypto Share (Send Key to Server)
         const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, file.enc_aes_key_patient);
         const docKey = await cryptoService.wrapKeyWithRSA(doctorPubKey, aesKey);
         
         await fetch(`${API_URL}/share-record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                report_id: file.id,
                doctor_id: doctorId,
                encrypted_key_for_doctor: docKey
            })
         });

         // B. Blockchain Audit (Grant Access On-Chain)
         try {
             console.log(`🔗 Granting Access on Blockchain...`);
             const tx = await contract.grantAccess(file.id, doctorEthAddress);
             await tx.wait();
             console.log("✅ Blockchain Confirmed");
         } catch (chainErr) {
             console.error("Blockchain Error:", chainErr);
             alert(`File ${file.filename} shared locally, but Blockchain Audit failed: ${chainErr.message}`);
         }
      }

      // 4. Create Policy Record (Store ETH Address for Revocation)
      const payload = {
        grantee_id: doctorId,
        grantee_eth_address: doctorEthAddress, // <--- IMPORTANT: Stored for auto-revoke
        scope,
        record_id: scope === "specific_record" ? selectedFileId : null,
        level,
        emergency_only: emergencyOnly,
        expires_at: null,
      };

      await createConsent(payload);

      // Reset Form
      setGranteeEmail("");
      setSelectedFileId("");
      setDoctorEthAddress("");
      setEmergencyOnly(false);
      alert(`Access Granted! Blockchain Audit Log created.`);
      await loadData();

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to process consent.");
    }
  }

  // --- AUTO REVOKE (Uses Stored Address) ---
  async function handleRevokeConsent(consent) {
    if(!confirm("Revoke this consent? This will remove the doctor's access immediately.")) return;
    
    // 1. Auto-Fetch ETH Address
    const ethAddr = consent.grantee_eth_address;

    try {
      setError("");
      
      // 2. Blockchain Revocation
      if (ethAddr) {
          try {
              const contract = await getContract();
              let reportIdsToRevoke = [];

              if (consent.scope === 'specific_record' && consent.record_id) {
                  reportIdsToRevoke.push(consent.record_id);
              } else {
                  // NOTE: 'all_records' revocation is complex on-chain. 
                  // For MVP, we skip automatic loop to save gas/time or user can handle manually.
                  // We prioritize destroying the keys on the server.
                  console.warn("Bulk revocation on blockchain skipped for UX. Keys will be destroyed.");
              }

              for (const rid of reportIdsToRevoke) {
                  console.log(`Revoking ${rid} for ${ethAddr} on-chain...`);
                  const tx = await contract.revokeAccess(rid, ethAddr);
                  await tx.wait(); 
                  console.log(`🚫 Revoked on Blockchain`);
              }
          } catch (chainErr) {
              console.error("Blockchain Revoke Error:", chainErr);
              alert("Blockchain transaction failed. Proceeding with server revocation to ensure security.");
          }
      } else {
          console.warn("No ETH address found in consent record. Skipping blockchain revoke.");
      }

      // 3. Server Revocation (Destroys Keys & Updates Policy)
      await revokeConsent(consent.id);
      await loadData();

    } catch (err) {
      setError(err.message || "Failed to revoke consent.");
    }
  }

  // --- EMERGENCY CONTACTS ---
  async function handleAddContact(e) {
    e.preventDefault();
    try {
      setError("");
      const idRes = await fetch(`${API_URL}/auth/user/id?email=${encodeURIComponent(contactEmail)}`, {
         headers: { Authorization: `Bearer ${token}` }
      });
      if(!idRes.ok) throw new Error("User not found");
      const { id: contactId } = await idRes.json();

      const payload = {
        contact_id: contactId,
        can_approve: canApprove,
        priority: parseInt(priority, 10) || 1,
      };

      await addEmergencyContact(payload);
      setContactEmail("");
      setPriority(1);
      setCanApprove(true);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to add emergency contact.");
    }
  }

  async function handleDeleteContact(id) {
    if(!confirm("Remove this contact?")) return;
    try {
      setError("");
      await deleteEmergencyContact(id);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete emergency contact.");
    }
  }

  if (loading && consents.length === 0 && myFiles.length === 0) {
    return <div className="p-10 text-center text-slate-500">Loading secure policies...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      
      <div>
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Shield className="w-8 h-8 text-emerald-600" />
          Consent & Emergency Protocols
        </h1>
        <p className="text-slate-500 mt-2">
          Grant cryptographic access and manage emergency overrides.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5"/> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT COL: CONSENT */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileKey className="w-5 h-5 text-blue-600"/> Grant New Access
            </h2>
            <form onSubmit={handleCreateConsent} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-400">Doctor/User Email</label>
                <input
                  type="email"
                  value={granteeEmail}
                  onChange={(e) => setGranteeEmail(e.target.value)}
                  placeholder="doctor@hospital.com"
                  className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Doctor's ETH Address (For Audit)
                </label>
                <input
                  type="text"
                  value={doctorEthAddress}
                  onChange={(e) => setDoctorEthAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400">Scope</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="all_records">All Records</option>
                    <option value="specific_record">Specific Record</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400">Level</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="view">View Only</option>
                    <option value="edit">Edit / Append</option>
                  </select>
                </div>
              </div>

              {scope === "specific_record" && (
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400">Select File</label>
                  <select
                    value={selectedFileId}
                    onChange={(e) => setSelectedFileId(e.target.value)}
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-slate-700"
                    required
                  >
                    <option value="">-- Choose a report --</option>
                    {myFiles.map(file => (
                        <option key={file.id} value={file.id}>
                            {file.filename} ({new Date(file.created_at).toLocaleDateString()})
                        </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={emergencyOnly}
                  onChange={(e) => setEmergencyOnly(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Emergency Only (Break-Glass)</span>
              </label>

              <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-blue-600 transition shadow-lg">
                Sign & Encrypt & Audit
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Active Consents</h3>
            {consents.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No active consents.</p>
            ) : (
              consents.map((c) => (
                <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-700">User ID: {c.grantee_id}</p>
                    <div className="flex flex-col gap-1 mt-1">
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                        {c.scope === 'all_records' ? (
                            <span className="text-blue-600 font-bold">All Records</span>
                        ) : (
                            <span className="flex items-center gap-1"><FileText className="w-3 h-3"/> One Record</span>
                        )} 
                        {' • '} 
                        {c.emergency_only ? <span className="text-red-500 font-bold">Emergency Only</span> : "Standard"}
                        </p>
                        {c.grantee_eth_address && (
                            <p className="text-[10px] text-emerald-600 font-mono flex items-center gap-1">
                                <Activity className="w-3 h-3"/> {c.grantee_eth_address.substring(0,6)}...{c.grantee_eth_address.substring(38)}
                            </p>
                        )}
                    </div>
                  </div>
                  {c.active && (
                    <button onClick={() => handleRevokeConsent(c)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg" title="Revoke Access">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COL: EMERGENCY */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600"/> Add Emergency Contact
            </h2>
            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-400">Contact Email</label>
                <input
                  type="text"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="family@example.com"
                  className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400">Priority</label>
                  <input
                    type="number"
                    min="1"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div className="flex items-end">
                   <label className="flex items-center gap-2 p-3 w-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canApprove}
                      onChange={(e) => setCanApprove(e.target.checked)}
                      className="w-5 h-5 text-emerald-600 rounded"
                    />
                    <span className="text-xs font-bold text-slate-600">Can Approve?</span>
                  </label>
                </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg">
                Add Contact
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Emergency Contacts</h3>
            {contacts.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No contacts set.</p>
            ) : (
              contacts.map((c) => (
                <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 text-emerald-700 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        {c.priority}
                    </div>
                    <div>
                        <p className="font-bold text-slate-700">User ID: {c.contact_id}</p>
                        <p className="text-xs text-slate-500">
                            {c.can_approve ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle className="w-3 h-3"/> Approver</span> : "Notifier Only"}
                        </p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteContact(c.id)} className="text-slate-400 p-2 hover:bg-slate-100 hover:text-red-500 rounded-lg">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}