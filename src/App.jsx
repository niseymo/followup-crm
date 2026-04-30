import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

const STORAGE_KEY = "furniture_crm_v1";
const DISMISS_KEY = "followup_backup_dismissed_until";

const DEFAULT_CATEGORIES = [
  "Sofa / Sectional", "Bedroom Set", "Dining Table", "Home Office",
  "Mattress", "Accent Chairs", "Storage / Shelving", "Outdoor",
  "Kids Furniture", "Just Browsing"
];

const FOLLOW_UP_INTERVALS = [
  { label: "Tomorrow", days: 1 },
  { label: "3 Days",   days: 3 },
  { label: "1 Week",   days: 7 },
  { label: "2 Weeks",  days: 14 },
  { label: "1 Month",  days: 30 },
];

const DEFAULT_TEMPLATE = `Hi {name}! This is {myName} from {store}. Great meeting you today — feel free to reach out if you have any questions about what you saw. 😊`;

const THEMES = {
  dark: {
    appBg:      "#0f0f13",
    surface:    "#1a1a2e",
    surfaceDeep:"#16213e",
    inputBg:    "#0f0f1a",
    statChipBg: "#1e1e2e",
    border:     "#2a2a3a",
    text:       "#f0ede8",
    textMuted:  "#7a7a9a",
    textDim:    "#5a5a7a",
    textDimmer: "#4a4a6a",
    btnAltBg:   "#252535",
    btnAltText: "#a0a0c0",
    scrollTrack:"#1a1a22",
    scrollThumb:"#3a3a4a",
  },
  light: {
    appBg:      "#f2f0eb",
    surface:    "#ffffff",
    surfaceDeep:"#f0eee8",
    inputBg:    "#f8f7f3",
    statChipBg: "#f0eeea",
    border:     "#dddbd6",
    text:       "#1a1a2e",
    textMuted:  "#6a6a80",
    textDim:    "#888890",
    textDimmer: "#9a9aaa",
    btnAltBg:   "#eeecea",
    btnAltText: "#4a4a6a",
    scrollTrack:"#e0ddd8",
    scrollThumb:"#c0bdb8",
  },
};

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 480);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function urgencyColor(days) {
  if (days < 0)  return "#e74c3c";
  if (days === 0) return "#e67e22";
  if (days <= 2)  return "#f39c12";
  return "#27ae60";
}
function urgencyLabel(days) {
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

const defaultMyInfo = { name: "", title: "Sales Associate", store: "", phone: "", email: "" };

export default function App() {
  const windowWidth = useWindowWidth();
  const isDesktop   = windowWidth >= 768;
  const isWide      = windowWidth >= 1100;

  const [view,            setView]            = useState("dashboard");
  const [contacts,        setContacts]        = useState([]);
  const [profiles,        setProfiles]        = useState([{ id: "default", ...defaultMyInfo }]);
  const [activeProfileId, setActiveProfileId] = useState("default");
  const [msgTemplate,     setMsgTemplate]     = useState(DEFAULT_TEMPLATE);
  const [themeMode,       setThemeMode]       = useState("auto");
  const [categories,      setCategories]      = useState(DEFAULT_CATEGORIES);
  const [newCategory,     setNewCategory]     = useState("");
  const [form,            setForm]            = useState({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 });
  const [editId,          setEditId]          = useState(null);
  const [search,          setSearch]          = useState("");
  const [filter,          setFilter]          = useState("all");
  const [showMyInfo,      setShowMyInfo]      = useState(false);
  const [toast,           setToast]           = useState(null);
  const [lookupQuery,     setLookupQuery]     = useState("");
  const [lookupAnswer,    setLookupAnswer]    = useState(null);
  const [lookupLoading,   setLookupLoading]   = useState(false);
  const lookupInputRef = useRef(null);
  const [showBackupBanner, setShowBackupBanner] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const waitingSWRef = useRef(null);
  const [showQR,    setShowQR]    = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  const effectiveTheme = themeMode === "auto"
    ? (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : themeMode;
  const th = THEMES[effectiveTheme];

  const myInfo = profiles.find(p => p.id === activeProfileId) || profiles[0] || defaultMyInfo;

  function updateActiveProfile(updater) {
    setProfiles(ps => ps.map(p =>
      p.id === activeProfileId
        ? { ...p, ...(typeof updater === "function" ? updater(p) : updater) }
        : p
    ));
  }
  function addProfile() {
    const id = `profile-${Date.now()}`;
    setProfiles(ps => [...ps, { id, ...defaultMyInfo }]);
    setActiveProfileId(id);
  }
  function deleteProfile(id) {
    setProfiles(ps => {
      const next = ps.filter(p => p.id !== id);
      return next.length ? next : [{ id: "default", ...defaultMyInfo }];
    });
    if (activeProfileId === id) setActiveProfileId(profiles.find(p => p.id !== id)?.id || "default");
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.contacts) setContacts(saved.contacts);
      if (saved.profiles) {
        setProfiles(saved.profiles);
        if (saved.activeProfileId) setActiveProfileId(saved.activeProfileId);
      } else if (saved.myInfo) {
        setProfiles([{ id: "default", ...defaultMyInfo, ...saved.myInfo }]);
        setActiveProfileId("default");
      }
      if (saved.msgTemplate) setMsgTemplate(saved.msgTemplate);
      if (saved.themeMode)   setThemeMode(saved.themeMode);
      setCategories(saved.categories || DEFAULT_CATEGORIES);

      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      const now = Date.now();
      if (dismissedUntil && now < Number(dismissedUntil)) return;
      const lastExport = saved.lastExportedAt ? new Date(saved.lastExportedAt).getTime() : 0;
      if (now - lastExport > 7 * 24 * 60 * 60 * 1000) setShowBackupBanner(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...saved, contacts, profiles, activeProfileId, msgTemplate, themeMode, categories,
      }));
    } catch {}
  }, [contacts, profiles, activeProfileId, msgTemplate, themeMode, categories]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      function trackWaiting(sw) {
        if (!sw || !navigator.serviceWorker.controller) return;
        waitingSWRef.current = sw;
        setShowUpdateBanner(true);
      }
      if (reg.waiting) trackWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw.addEventListener("statechange", () => { if (sw.state === "installed") trackWaiting(sw); });
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
  }, []);

  function applyUpdate() {
    waitingSWRef.current?.postMessage({ type: "SKIP_WAITING" });
    setShowUpdateBanner(false);
  }
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }
  function saveContact() {
    if (!form.name.trim() || !form.phone.trim()) return showToast("Name and phone required", "error");
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + Number(form.followUpDays));
    const record = {
      id: editId || Date.now().toString(),
      name: form.name.trim(),
      phone: form.phone.trim().replace(/\D/g, ""),
      interest: form.interest,
      notes: form.notes.trim(),
      followUpDate: followUpDate.toISOString().split("T")[0],
      addedDate: editId
        ? (contacts.find(c => c.id === editId)?.addedDate || new Date().toISOString().split("T")[0])
        : new Date().toISOString().split("T")[0],
      texted: editId ? (contacts.find(c => c.id === editId)?.texted || false) : false,
      done: false,
    };
    if (editId) {
      setContacts(cs => cs.map(c => c.id === editId ? { ...c, ...record } : c));
      showToast("Contact updated");
    } else {
      setContacts(cs => [record, ...cs]);
      showToast("Contact added");
    }
    setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 });
    setEditId(null);
    setView("dashboard");
  }
  function markTexted(id)  { setContacts(cs => cs.map(c => c.id === id ? { ...c, texted: true } : c)); showToast("Marked as texted ✓"); }
  function markDone(id)    { setContacts(cs => cs.map(c => c.id === id ? { ...c, done: true }   : c)); showToast("Marked complete"); }
  function deleteContact(id) { setContacts(cs => cs.filter(c => c.id !== id)); showToast("Deleted"); }
  function editContact(c) {
    const days = Math.max(1, daysUntil(c.followUpDate));
    setForm({ name: c.name, phone: c.phone, interest: c.interest, notes: c.notes, followUpDays: days });
    setEditId(c.id);
    setView("add");
  }

  async function runLookup(q) {
    const query = (q || lookupQuery).trim();
    if (!query) return;
    setLookupLoading(true);
    setLookupAnswer(null);
    try {
      const res  = await fetch("/api/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setLookupAnswer(data.answer);
    } catch (err) {
      setLookupAnswer(`Error: ${err.message}`);
    } finally {
      setLookupLoading(false);
    }
  }

  function exportData() {
    const now  = new Date().toISOString();
    const data = JSON.stringify({ contacts, myInfo, msgTemplate, exportedAt: now }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `followup-backup-${now.split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, lastExportedAt: now }));
    } catch {}
    setShowBackupBanner(false);
    showToast("Backup downloaded ✓");
  }
  function dismissBackupBanner() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    setShowBackupBanner(false);
  }
  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.contacts) return showToast("Invalid backup file", "error");
        setContacts(parsed.contacts);
        if (parsed.profiles) {
          setProfiles(parsed.profiles);
          if (parsed.activeProfileId) setActiveProfileId(parsed.activeProfileId);
        } else if (parsed.myInfo) {
          setProfiles([{ id: "default", ...defaultMyInfo, ...parsed.myInfo }]);
          setActiveProfileId("default");
        }
        if (parsed.msgTemplate) setMsgTemplate(parsed.msgTemplate);
        showToast(`Restored ${parsed.contacts.length} contacts ✓`);
      } catch { showToast("Could not read file", "error"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function buildMessage(name) {
    return msgTemplate
      .replace(/\{name\}/g,   name)
      .replace(/\{myName\}/g, myInfo.name  || "your sales associate")
      .replace(/\{store\}/g,  myInfo.store || "the store")
      .replace(/\{phone\}/g,  myInfo.phone || "")
      .replace(/\{title\}/g,  myInfo.title || "Sales Associate");
  }
  function smsLink(phone, name) {
    return `sms:${phone}?body=${encodeURIComponent(buildMessage(name))}`;
  }
  function buildVCard() {
    return [
      "BEGIN:VCARD", "VERSION:3.0",
      `FN:${myInfo.name || ""}`,
      `TITLE:${myInfo.title || ""}`,
      myInfo.store ? `ORG:${myInfo.store}` : null,
      myInfo.phone ? `TEL;TYPE=CELL:${myInfo.phone}` : null,
      myInfo.email ? `EMAIL:${myInfo.email}` : null,
      "END:VCARD",
    ].filter(Boolean).join("\r\n");
  }
  async function openQR() {
    try {
      const url = await QRCode.toDataURL(buildVCard(), { width: 280, margin: 2, color: { dark: th.text, light: th.surface } });
      setQrDataUrl(url);
      setShowQR(true);
    } catch { showToast("Could not generate QR code", "error"); }
  }
  async function shareCard() {
    const vcf  = buildVCard();
    const blob = new Blob([vcf], { type: "text/vcard" });
    const file = new File([blob], `${myInfo.name || "contact"}.vcf`, { type: "text/vcard" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: myInfo.name || "Contact" });
    } else if (navigator.share) {
      const text = `${myInfo.name}\n${myInfo.title}${myInfo.store ? ` · ${myInfo.store}` : ""}\n📞 ${myInfo.phone}${myInfo.email ? `\n✉️ ${myInfo.email}` : ""}`;
      await navigator.share({ title: "My Contact Info", text });
    } else {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
      showToast("Contact card downloaded ✓");
    }
  }

  const activeContacts = contacts.filter(c => !c.done);
  const filtered = activeContacts.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const days = daysUntil(c.followUpDate);
    if (filter === "overdue")    return matchSearch && days < 0;
    if (filter === "today")      return matchSearch && days === 0;
    if (filter === "upcoming")   return matchSearch && days > 0;
    if (filter === "not_texted") return matchSearch && !c.texted;
    return matchSearch;
  }).sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));

  const overdue   = activeContacts.filter(c => daysUntil(c.followUpDate) < 0).length;
  const dueToday  = activeContacts.filter(c => daysUntil(c.followUpDate) === 0).length;
  const notTexted = activeContacts.filter(c => !c.texted).length;
  const previewName = "Sarah";
  const msgPreview  = buildMessage(previewName);

  const stats = [
    { label: "Total",      val: activeContacts.length, color: "#7a7aaa", f: "all"       },
    { label: "Overdue",    val: overdue,               color: "#e74c3c", f: "overdue"   },
    { label: "Today",      val: dueToday,              color: "#f39c12", f: "today"     },
    { label: "Not Texted", val: notTexted,             color: "#3498db", f: "not_texted"},
  ];

  function navTo(v) {
    if (v === "add") { setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }
    setView(v);
  }

  // ─── Shared sub-components ─────────────────────────────────────────────────

  const Banners = (
    <>
      {showUpdateBanner && (
        <div data-testid="update-banner" style={{ background: "#003a5a", borderBottom: "1px solid #006090", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, color: "#60c0f0" }}>🆕 New version available</div>
          <button data-testid="update-banner-apply" onClick={applyUpdate}
            style={{ background: "#60c0f0", color: "#001a2e", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            Tap to update
          </button>
        </div>
      )}
      {showBackupBanner && (
        <div data-testid="backup-banner" style={{ background: "#3a2e00", borderBottom: "1px solid #7a6000", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, color: "#f0c040", lineHeight: 1.4 }}>
            ⚠️ Back up your data — it's been over 7 days since your last export.
          </div>
          <button data-testid="backup-banner-now" onClick={() => { setShowMyInfo(true); setShowBackupBanner(false); }}
            style={{ background: "#f0c040", color: "#1a1200", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
            Backup now
          </button>
          <button data-testid="backup-banner-dismiss" onClick={dismissBackupBanner}
            style={{ background: "none", border: "none", color: "#7a6000", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>
            ×
          </button>
        </div>
      )}
    </>
  );

  const ContactCard = (c) => {
    const days = daysUntil(c.followUpDate);
    const uc   = urgencyColor(days);
    return (
      <div key={c.id} style={{ background: th.surface, border: `1px solid ${days < 0 ? "#e74c3c44" : th.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            <div style={{ fontSize: 13, color: th.textMuted, marginTop: 2 }}>{c.interest || "No interest noted"}</div>
            {c.notes && <div style={{ fontSize: 12, color: th.textDim, marginTop: 4, fontStyle: "italic" }}>"{c.notes}"</div>}
          </div>
          <div style={{ textAlign: "right", minWidth: 70, marginLeft: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: uc, background: uc + "22", borderRadius: 6, padding: "3px 8px", display: "inline-block" }}>
              {urgencyLabel(days)}
            </div>
            <div style={{ fontSize: 10, color: th.textDim, marginTop: 3 }}>{formatDate(c.followUpDate)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <a href={smsLink(c.phone, c.name)} onClick={() => markTexted(c.id)}
            style={{ flex: 1, minWidth: 80, background: c.texted ? "#1e3a2a" : "#1e4a3a", color: c.texted ? "#5a9a7a" : "#2ecc71", border: `1px solid ${c.texted ? "#2a5a3a" : "#2ecc71"}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
            {c.texted ? "✓ Texted" : "📱 Text Now"}
          </a>
          <a data-testid={`call-${c.id}`} href={`tel:${c.phone}`} title="Call"
            style={{ background: "#1a2a3a", color: "#60a0e0", border: "1px solid #2a3a5a", borderRadius: 8, padding: "8px 10px", fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center" }}>
            📞
          </a>
          <button onClick={() => editContact(c)}
            style={{ flex: 1, minWidth: 60, background: th.btnAltBg, color: th.btnAltText, border: `1px solid ${th.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>
            Edit
          </button>
          <button onClick={() => markDone(c.id)}
            style={{ flex: 1, minWidth: 60, background: th.btnAltBg, color: th.textMuted, border: `1px solid ${th.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>
            Done ✓
          </button>
          <button onClick={() => deleteContact(c.id)}
            style={{ background: "#2a1a1a", color: "#e74c3c", border: "1px solid #3a2a2a", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
            🗑
          </button>
        </div>
        <div style={{ fontSize: 10, color: th.textDimmer, marginTop: 8 }}>
          Added {formatDate(c.addedDate)} · Consent: in-person {formatDate(c.addedDate)}
        </div>
      </div>
    );
  };

  const SettingsPanel = (
    <div style={{ padding: isDesktop ? "0" : "0" }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#d4a853", marginBottom: 16 }}>Settings</div>

      {/* Profiles */}
      <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Profiles</div>
      {profiles.map(p => (
        <div key={p.id} data-testid={`profile-row-${p.id}`}
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, background: p.id === activeProfileId ? "#d4a85322" : th.btnAltBg, border: `1px solid ${p.id === activeProfileId ? "#d4a853" : th.border}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: p.id === activeProfileId ? 600 : 400, color: th.text }}>{p.name || "(no name)"}</div>
            {p.store && <div style={{ fontSize: 11, color: th.textMuted }}>{p.store}</div>}
          </div>
          {p.id !== activeProfileId && (
            <button data-testid={`switch-profile-${p.id}`} onClick={() => setActiveProfileId(p.id)}
              style={{ background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600 }}>
              Switch
            </button>
          )}
          {p.id === activeProfileId && <div style={{ fontSize: 11, color: "#d4a853", fontWeight: 600 }}>Active</div>}
          {profiles.length > 1 && (
            <button data-testid={`delete-profile-${p.id}`} onClick={() => deleteProfile(p.id)}
              style={{ background: "#2a1a1a", color: "#e74c3c", border: "1px solid #3a2a2a", borderRadius: 6, padding: "5px 8px", fontSize: 11 }}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button data-testid="add-profile-btn" onClick={addProfile}
        style={{ width: "100%", background: th.btnAltBg, color: th.textMuted, border: `1px dashed ${th.border}`, borderRadius: 10, padding: "10px", fontSize: 13, marginBottom: 16 }}>
        + Add another profile
      </button>

      {/* My Info */}
      <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>My Info — {myInfo.name || "Active Profile"}</div>
      {[["name","Your Name"],["title","Title"],["store","Store Name"],["phone","Your Phone"],["email","Your Email (optional)"]].map(([k, label]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: th.textDim, marginBottom: 4 }}>{label}</div>
          <input data-testid={`myinfo-${k}`} value={myInfo[k] || ""}
            onChange={e => updateActiveProfile(mi => ({ ...mi, [k]: e.target.value }))}
            style={{ width: "100%", background: th.inputBg, border: `1px solid ${th.border}`, borderRadius: 8, padding: "10px 12px", color: th.text, fontSize: 15 }} />
        </div>
      ))}

      {/* Categories */}
      <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 16, marginTop: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Interest Categories</div>
        {categories.map(cat => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, fontSize: 14, color: th.text }}>{cat}</div>
            <button data-testid={`delete-category-${cat}`} onClick={() => setCategories(cs => cs.filter(c => c !== cat))}
              style={{ background: "#2a1a1a", color: "#e74c3c", border: "1px solid #3a2a2a", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input data-testid="new-category-input" value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newCategory.trim()) { setCategories(cs => [...cs, newCategory.trim()]); setNewCategory(""); } }}
            placeholder="Add a category…"
            style={{ flex: 1, background: th.inputBg, border: `1px solid ${th.border}`, borderRadius: 8, padding: "8px 10px", color: th.text, fontSize: 14 }} />
          <button data-testid="add-category-btn"
            onClick={() => { if (newCategory.trim()) { setCategories(cs => [...cs, newCategory.trim()]); setNewCategory(""); } }}
            style={{ background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>
            Add
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 16, marginTop: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Appearance</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["auto","light","dark"].map(mode => (
            <button key={mode} data-testid={`theme-${mode}`} onClick={() => setThemeMode(mode)}
              style={{ flex: 1, background: themeMode === mode ? "#d4a853" : th.btnAltBg, color: themeMode === mode ? "#0f0f13" : th.text, border: `1px solid ${themeMode === mode ? "#d4a853" : th.border}`, borderRadius: 8, padding: "9px 4px", fontSize: 13, fontWeight: themeMode === mode ? 700 : 400, textTransform: "capitalize" }}>
              {mode === "auto" ? "Auto" : mode === "light" ? "☀️ Light" : "🌙 Dark"}
            </button>
          ))}
        </div>
      </div>

      {/* Message Template */}
      <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 16, marginTop: 8 }}>
        <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Text Message Template</div>
        <textarea data-testid="template-textarea" value={msgTemplate}
          onChange={e => setMsgTemplate(e.target.value)} rows={5}
          style={{ width: "100%", background: th.inputBg, border: `1px solid ${th.border}`, borderRadius: 8, padding: "10px 12px", color: th.text, fontSize: 14, resize: "vertical", lineHeight: 1.6 }} />
        <div style={{ fontSize: 11, color: th.textDim, marginTop: 8, marginBottom: 6 }}>Tap to insert a variable:</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {[["{name}","customer name"],["{myName}","your name"],["{store}","store name"],["{phone}","your phone"],["{title}","your title"]].map(([v, hint]) => (
            <button key={v} onClick={() => setMsgTemplate(prev => prev + v)} title={hint}
              style={{ background: th.btnAltBg, color: th.btnAltText, border: `1px solid ${th.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 500 }}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ background: th.inputBg, border: `1px solid ${th.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: th.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Preview — sent to "{previewName}"</div>
          <div style={{ fontSize: 13, color: th.textMuted, lineHeight: 1.6 }}>{msgPreview}</div>
        </div>
        <button onClick={() => { setMsgTemplate(DEFAULT_TEMPLATE); showToast("Template reset"); }}
          style={{ background: "none", border: "none", color: th.textDim, fontSize: 12, padding: 0, textDecoration: "underline", cursor: "pointer" }}>
          Reset to default
        </button>
      </div>

      {/* Backup */}
      <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 16, marginTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Backup & Restore</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportData}
            style={{ flex: 1, background: "#1e3a2a", color: "#2ecc71", border: "1px solid #2a5a3a", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 600 }}>
            ⬇️ Export Backup
          </button>
          <label style={{ flex: 1, background: "#1a2a3a", color: "#3498db", border: "1px solid #2a3a5a", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 600, textAlign: "center", cursor: "pointer" }}>
            ⬆️ Restore
            <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ fontSize: 11, color: th.textDimmer, marginTop: 8, lineHeight: 1.5 }}>
          📋 All data stored locally on your device only. Never shared externally.
        </div>
      </div>

      <button onClick={() => setShowMyInfo(false)}
        style={{ width: "100%", background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 600 }}>
        Done
      </button>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div data-testid="app-root" data-theme={effectiveTheme}
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        background: th.appBg,
        color: th.text,
        minHeight: "100vh",
        display: isDesktop ? "flex" : "block",
        // Mobile: centered narrow column; desktop: full viewport
        maxWidth: isDesktop ? "none" : 480,
        margin: isDesktop ? 0 : "0 auto",
      }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; }
        input, select, textarea { font-family: inherit; }
        button { cursor: pointer; font-family: inherit; }
        a { font-family: inherit; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${th.scrollTrack}; }
        ::-webkit-scrollbar-thumb { background: ${th.scrollThumb}; border-radius: 2px; }
        .contact-grid {
          display: grid;
          grid-template-columns: ${isWide ? "repeat(2, 1fr)" : "1fr"};
          gap: ${isWide ? "0 16px" : "0"};
        }
      `}</style>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#c0392b" : "#1e7e5a", color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontSize: 14, fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>
      )}

      {/* ── QR Modal ──────────────────────────────────────────────────────── */}
      {showQR && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowQR(false)}>
          <div data-testid="qr-modal"
            style={{ background: th.surface, borderRadius: 20, padding: 28, textAlign: "center", maxWidth: 340, width: "100%" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#d4a853", marginBottom: 4 }}>Scan to Add Contact</div>
            <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 20 }}>
              {myInfo.name || "Your contact"}{myInfo.store ? ` · ${myInfo.store}` : ""}
            </div>
            {qrDataUrl && (
              <img data-testid="qr-image" src={qrDataUrl} alt="Contact QR code"
                style={{ width: 252, height: 252, borderRadius: 12, display: "block", margin: "0 auto 20px" }} />
            )}
            <div style={{ fontSize: 11, color: th.textDim, marginBottom: 20, lineHeight: 1.5 }}>
              Customer scans this with their camera app to save your contact info directly to their phone.
            </div>
            <button onClick={() => setShowQR(false)}
              style={{ width: "100%", background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 10, padding: "12px", fontSize: 15, fontWeight: 600 }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Settings Modal ────────────────────────────────────────────────── */}
      {showMyInfo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center" }}>
          <div style={{
            background: th.surface,
            width: "100%",
            maxWidth: isDesktop ? 560 : 480,
            borderRadius: isDesktop ? 16 : "20px 20px 0 0",
            padding: 24,
            maxHeight: isDesktop ? "90vh" : "92vh",
            overflowY: "auto",
            margin: isDesktop ? "0 16px" : "0 auto",
          }}>
            {SettingsPanel}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT
      ══════════════════════════════════════════════════════════════════ */}
      {isDesktop && (
        <aside style={{
          width: 240,
          minWidth: 240,
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
          background: th.surface,
          borderRight: `1px solid ${th.border}`,
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px 20px",
        }}>
          {/* Logo */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#d4a853", lineHeight: 1 }}>Follow-Up</div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 6 }}>
              {myInfo.name && <span style={{ fontWeight: 600, color: th.text }}>{myInfo.name}<br/></span>}
              {myInfo.store && <span>{myInfo.store}<br/></span>}
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 20 }}>
            {[
              { icon: "📋", label: "Contacts",   active: view === "dashboard", action: () => navTo("dashboard") },
              { icon: "➕", label: "Add Contact", active: view === "add",       action: () => navTo("add") },
              { icon: "🔔", label: `Follow-ups${overdue > 0 ? ` (${overdue})` : ""}`, active: false, action: () => { setFilter("overdue"); setView("dashboard"); }, urgent: overdue > 0 },
              { icon: "🔍", label: "Lookup",      active: view === "lookup",    action: () => navTo("lookup") },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "none", background: item.active ? "#d4a85322" : "none", color: item.active ? "#d4a853" : item.urgent ? "#e74c3c" : th.textMuted, fontSize: 14, fontWeight: item.active ? 600 : 400, textAlign: "left", width: "100%" }}>
                <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Stats */}
          <div style={{ fontSize: 11, color: th.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Overview</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
            {stats.map(s => (
              <button key={s.f} onClick={() => { setFilter(filter === s.f ? "all" : s.f); setView("dashboard"); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderRadius: 10, border: `1px solid ${filter === s.f ? s.color : "transparent"}`, background: filter === s.f ? s.color + "22" : th.btnAltBg, cursor: "pointer" }}>
                <span style={{ fontSize: 13, color: th.textMuted }}>{s.label}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</span>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <button data-testid="qr-btn" onClick={openQR}
              style={{ background: th.btnAltBg, color: th.text, border: `1px solid ${th.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
              <span>⬛</span> My QR Code
            </button>
            <button onClick={shareCard}
              style={{ background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600 }}>
              Share Card
            </button>
            <button data-testid="settings-btn" onClick={() => setShowMyInfo(true)}
              style={{ background: th.btnAltBg, color: th.textMuted, border: `1px solid ${th.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              ⚙️ Settings
            </button>
          </div>
        </aside>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA (both mobile + desktop)
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        minWidth: 0,
        height: isDesktop ? "100vh" : "auto",
        overflowY: isDesktop ? "auto" : "visible",
        paddingBottom: isDesktop ? 0 : 80,
      }}>
        {Banners}

        {/* ── Mobile-only header ─────────────────────────────────────────── */}
        {!isDesktop && (
          <div style={{ background: `linear-gradient(135deg, ${th.surface} 0%, ${th.surfaceDeep} 100%)`, padding: "20px 20px 16px", borderBottom: `1px solid ${th.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#d4a853", letterSpacing: "-0.3px" }}>Follow-Up</div>
                <div style={{ fontSize: 12, color: th.textMuted, marginTop: 2 }}>
                  {myInfo.name ? `${myInfo.name} · ` : ""}{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button data-testid="qr-btn" onClick={openQR}
                  style={{ background: th.btnAltBg, color: th.text, border: `1px solid ${th.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14 }} title="QR">
                  ⬛
                </button>
                <button onClick={shareCard}
                  style={{ background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                  Share Card
                </button>
                <button data-testid="settings-btn" onClick={() => setShowMyInfo(true)}
                  style={{ background: th.btnAltBg, color: th.text, border: "none", borderRadius: 8, padding: "8px 10px", fontSize: 16 }}>
                  ⚙️
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {stats.map(s => (
                <button key={s.f} onClick={() => setFilter(filter === s.f ? "all" : s.f)}
                  style={{ flex: 1, background: filter === s.f ? s.color + "33" : th.statChipBg, border: `1px solid ${filter === s.f ? s.color : th.border}`, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: th.textMuted, marginTop: 1 }}>{s.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Desktop page header ────────────────────────────────────────── */}
        {isDesktop && (
          <div style={{ padding: "24px 28px 0", borderBottom: `1px solid ${th.border}`, paddingBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "#d4a853" }}>
                {view === "dashboard" ? "Contacts" : view === "add" ? (editId ? "Edit Contact" : "New Contact") : "Furniture Lookup"}
              </div>
              {view === "dashboard" && (
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone…"
                  style={{ flex: 1, maxWidth: 360, background: th.inputBg, border: `1px solid ${th.border}`, borderRadius: 10, padding: "9px 14px", color: th.text, fontSize: 14 }} />
              )}
            </div>
            {view === "dashboard" && filter !== "all" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: th.textMuted }}>Filtered: <span style={{ color: "#d4a853" }}>{filter.replace("_", " ")}</span></span>
                <button onClick={() => setFilter("all")} style={{ background: "none", border: "none", color: th.textMuted, fontSize: 12, padding: 0 }}>Clear ×</button>
              </div>
            )}
          </div>
        )}

        {/* ── Dashboard view ─────────────────────────────────────────────── */}
        {view === "dashboard" && (
          <div style={{ padding: isDesktop ? "20px 28px" : "16px 16px 0" }}>
            {!isDesktop && (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  style={{ width: "100%", background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: "11px 14px", color: th.text, fontSize: 14, marginBottom: 12 }} />
                {filter !== "all" && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: th.textMuted }}>Filtered: <span style={{ color: "#d4a853" }}>{filter.replace("_", " ")}</span></div>
                    <button onClick={() => setFilter("all")} style={{ background: "none", border: "none", color: th.textMuted, fontSize: 12 }}>Clear ×</button>
                  </div>
                )}
              </>
            )}

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", color: th.textDim, marginTop: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🛋️</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>No contacts yet</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Add your first customer below</div>
              </div>
            )}

            <div className="contact-grid">
              {filtered.map(c => ContactCard(c))}
            </div>

            {contacts.filter(c => c.done).length > 0 && (
              <div style={{ textAlign: "center", marginTop: 12, marginBottom: 8 }}>
                <button onClick={() => setFilter("done")}
                  style={{ background: "none", border: "none", color: th.textDimmer, fontSize: 12 }}>
                  View {contacts.filter(c => c.done).length} completed →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Add / Edit view ────────────────────────────────────────────── */}
        {view === "add" && (
          <div style={{ padding: isDesktop ? "24px 28px" : "20px", maxWidth: isDesktop ? 560 : "none" }}>
            {!isDesktop && (
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#d4a853", marginBottom: 20 }}>
                {editId ? "Edit Contact" : "New Customer"}
              </div>
            )}

            {[["name","Customer Name *","text"],["phone","Phone Number *","tel"]].map(([k, label, type]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                <input data-testid={`input-${k}`} type={type} value={form[k]}
                  onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  style={{ width: "100%", background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: "12px 14px", color: th.text, fontSize: 15 }} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Interested In</div>
              <select data-testid="select-interest" value={form.interest}
                onChange={e => setForm(f => ({ ...f, interest: e.target.value }))}
                style={{ width: "100%", background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: "12px 14px", color: form.interest ? th.text : th.textDim, fontSize: 15 }}>
                <option value="">Select category...</option>
                {categories.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Notes</div>
              <textarea data-testid="textarea-notes" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                placeholder="Budget, style preference, timeline..."
                style={{ width: "100%", background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: "12px 14px", color: th.text, fontSize: 14, resize: "none" }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Follow Up In</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FOLLOW_UP_INTERVALS.map(i => (
                  <button key={i.days} onClick={() => setForm(f => ({ ...f, followUpDays: i.days }))}
                    style={{ flex: 1, minWidth: 60, background: form.followUpDays === i.days ? "#d4a853" : th.surface, color: form.followUpDays === i.days ? "#0f0f13" : th.textMuted, border: `1px solid ${form.followUpDays === i.days ? "#d4a853" : th.border}`, borderRadius: 8, padding: "9px 4px", fontSize: 12, fontWeight: form.followUpDays === i.days ? 700 : 400 }}>
                    {i.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: "#1a2a1a", border: "1px solid #2a3a2a", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#5a8a5a", lineHeight: 1.5 }}>
              🔒 Consent logged as in-person verbal consent on {new Date().toLocaleDateString()}
            </div>

            <button onClick={saveContact}
              style={{ width: "100%", background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              {editId ? "Save Changes" : "Add Customer"}
            </button>
            <button onClick={() => { setView("dashboard"); setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }}
              style={{ width: "100%", background: "none", color: th.textMuted, border: `1px solid ${th.border}`, borderRadius: 12, padding: "13px", fontSize: 14 }}>
              Cancel
            </button>
          </div>
        )}

        {/* ── Lookup view ────────────────────────────────────────────────── */}
        {view === "lookup" && (
          <div style={{ padding: isDesktop ? "24px 28px" : "20px", maxWidth: isDesktop ? 680 : "none" }}>
            {!isDesktop && (
              <>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#d4a853", marginBottom: 6 }}>Furniture Lookup</div>
                <div style={{ fontSize: 13, color: th.textDim, marginBottom: 20 }}>Ask anything about furniture — specs, styles, materials, care tips.</div>
              </>
            )}
            {isDesktop && (
              <div style={{ fontSize: 13, color: th.textDim, marginBottom: 20 }}>Ask anything about furniture — specs, styles, materials, care tips.</div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input ref={lookupInputRef} value={lookupQuery}
                onChange={e => setLookupQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runLookup()}
                placeholder="e.g. What's eight-way hand-tied?"
                style={{ flex: 1, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: "12px 14px", color: th.text, fontSize: 14 }} />
              <button onClick={() => runLookup()} disabled={lookupLoading || !lookupQuery.trim()}
                style={{ background: lookupLoading || !lookupQuery.trim() ? th.btnAltBg : "#d4a853", color: lookupLoading || !lookupQuery.trim() ? th.textDim : "#0f0f13", border: "none", borderRadius: 10, padding: "0 20px", fontSize: 20, fontWeight: 700, cursor: lookupLoading || !lookupQuery.trim() ? "not-allowed" : "pointer" }}>
                {lookupLoading ? "…" : "→"}
              </button>
            </div>

            {!lookupAnswer && !lookupLoading && (
              <div>
                <div style={{ fontSize: 11, color: th.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Try asking</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    "What's the difference between memory foam and hybrid?",
                    "How to clean microfiber sofa?",
                    "What size rug for a 12x14 living room?",
                    "Solid wood vs engineered wood pros and cons",
                    "What's a good sofa frame to look for?",
                  ].map(q => (
                    <button key={q} onClick={() => { setLookupQuery(q); runLookup(q); }}
                      style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 20, padding: "6px 12px", color: th.btnAltText, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lookupLoading && (
              <div style={{ textAlign: "center", color: th.textDim, marginTop: 40 }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>✨</div>
                <div style={{ fontSize: 14 }}>Looking that up…</div>
              </div>
            )}

            {lookupAnswer && (
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: "16px 18px", marginTop: 4 }}>
                <div style={{ fontSize: 11, color: th.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Answer</div>
                <div style={{ fontSize: 14, color: th.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{lookupAnswer}</div>
                <button onClick={() => { setLookupAnswer(null); setLookupQuery(""); lookupInputRef.current?.focus(); }}
                  style={{ marginTop: 14, background: "none", border: `1px solid ${th.border}`, borderRadius: 8, padding: "7px 16px", color: th.textMuted, fontSize: 12, cursor: "pointer" }}>
                  Ask another
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom nav (hidden on desktop) ─────────────────────────── */}
      {!isDesktop && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: th.surface, borderTop: `1px solid ${th.border}`, display: "flex", padding: "10px 20px 16px", zIndex: 50 }}>
          <button onClick={() => setView("dashboard")}
            style={{ flex: 1, background: "none", border: "none", color: view === "dashboard" ? "#d4a853" : th.textDim, fontSize: 12, fontWeight: 500, padding: "6px 0" }}>
            <div style={{ fontSize: 22 }}>📋</div>
            Contacts
          </button>
          <button onClick={() => navTo("add")}
            style={{ flex: "0 0 60px", background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: "50%", width: 56, height: 56, fontSize: 28, fontWeight: 700, margin: "-20px auto 0", boxShadow: "0 4px 20px rgba(212,168,83,0.4)" }}>
            +
          </button>
          <button onClick={() => setFilter("overdue")}
            style={{ flex: 1, background: "none", border: "none", color: overdue > 0 ? "#e74c3c" : th.textDim, fontSize: 12, fontWeight: 500, padding: "6px 0" }}>
            <div style={{ fontSize: 22 }}>🔔</div>
            {overdue > 0 ? `${overdue} Overdue` : "Follow-ups"}
          </button>
          <button onClick={() => setView("lookup")}
            style={{ flex: 1, background: "none", border: "none", color: view === "lookup" ? "#d4a853" : th.textDim, fontSize: 12, fontWeight: 500, padding: "6px 0" }}>
            <div style={{ fontSize: 22 }}>🔍</div>
            Lookup
          </button>
        </div>
      )}
    </div>
  );
}
