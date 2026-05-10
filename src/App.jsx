import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { db } from "./db.js";

// Kept only for one-time migration of existing localStorage data.
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
    appBg:       "#000000",
    surface:     "#1C1C1E",
    surfaceDeep: "#2C2C2E",
    inputBg:     "#1C1C1E",
    statChipBg:  "#1C1C1E",
    border:      "rgba(84,84,88,0.65)",
    text:        "#FFFFFF",
    textMuted:   "rgba(235,235,245,0.60)",
    textDim:     "rgba(235,235,245,0.30)",
    textDimmer:  "rgba(235,235,245,0.18)",
    btnAltBg:    "#2C2C2E",
    btnAltText:  "rgba(235,235,245,0.60)",
    scrollTrack: "#1C1C1E",
    scrollThumb: "#48484A",
    navBg:       "rgba(28,28,30,0.92)",
    tabBg:       "rgba(22,22,24,0.92)",
    red:         "#FF453A",
    orange:      "#FF9F0A",
    green:       "#30D158",
    blue:        "#0A84FF",
  },
  light: {
    appBg:       "#F2F2F7",
    surface:     "#FFFFFF",
    surfaceDeep: "#F2F2F7",
    inputBg:     "#FFFFFF",
    statChipBg:  "#FFFFFF",
    border:      "rgba(60,60,67,0.29)",
    text:        "#000000",
    textMuted:   "rgba(60,60,67,0.60)",
    textDim:     "rgba(60,60,67,0.30)",
    textDimmer:  "rgba(60,60,67,0.18)",
    btnAltBg:    "#F2F2F7",
    btnAltText:  "rgba(60,60,67,0.60)",
    scrollTrack: "#E5E5EA",
    scrollThumb: "#C7C7CC",
    navBg:       "rgba(242,242,247,0.92)",
    tabBg:       "rgba(249,249,249,0.92)",
    red:         "#FF3B30",
    orange:      "#FF9500",
    green:       "#34C759",
    blue:        "#007AFF",
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
  if (days < 0)  return "#FF3B30";
  if (days === 0) return "#FF9500";
  if (days <= 2)  return "#FF9F0A";
  return "#34C759";
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
  const [showQR,         setShowQR]         = useState(false);
  const [qrDataUrl,      setQrDataUrl]      = useState(null);
  const [smsQrUrl,       setSmsQrUrl]       = useState(null);
  const [lastExportedAt, setLastExportedAt] = useState(null);
  // Skip the first save-effect run — it fires with default state before the load effect's
  // setState calls have been applied, which would overwrite saved data with empty defaults.
  const saveSkipRef = useRef(true);

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
    async function load() {
      // One-time migration: if localStorage has existing data and Dexie is empty, import it.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          const puts = [];
          if (saved.contacts?.length) await db.contacts.bulkPut(saved.contacts);
          if (saved.profiles)        puts.push({ key: "profiles",        value: saved.profiles });
          else if (saved.myInfo)     puts.push({ key: "profiles",        value: [{ id: "default", ...defaultMyInfo, ...saved.myInfo }] });
          if (saved.activeProfileId) puts.push({ key: "activeProfileId", value: saved.activeProfileId });
          if (saved.msgTemplate)     puts.push({ key: "msgTemplate",     value: saved.msgTemplate });
          if (saved.themeMode)       puts.push({ key: "themeMode",       value: saved.themeMode });
          if (saved.categories)      puts.push({ key: "categories",      value: saved.categories });
          if (saved.lastExportedAt)  puts.push({ key: "lastExportedAt",  value: saved.lastExportedAt });
          if (puts.length) await db.settings.bulkPut(puts);
          localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
          console.error("localStorage migration failed:", err);
        }
      }

      // Load from Dexie.
      const [storedContacts, profiles, activeId, template, theme, cats, lastExp] = await Promise.all([
        db.contacts.toArray(),
        db.settings.get("profiles"),
        db.settings.get("activeProfileId"),
        db.settings.get("msgTemplate"),
        db.settings.get("themeMode"),
        db.settings.get("categories"),
        db.settings.get("lastExportedAt"),
      ]);

      if (storedContacts.length)  setContacts(storedContacts);
      if (profiles?.value)        setProfiles(profiles.value);
      if (activeId?.value)        setActiveProfileId(activeId.value);
      if (template?.value)        setMsgTemplate(template.value);
      if (theme?.value)           setThemeMode(theme.value);
      if (lastExp?.value)         setLastExportedAt(lastExp.value);
      setCategories(cats?.value || DEFAULT_CATEGORIES);

      // Backup banner.
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      const now = Date.now();
      if (!dismissedUntil || now >= Number(dismissedUntil)) {
        const lastExport = lastExp?.value ? new Date(lastExp.value).getTime() : 0;
        if (now - lastExport > 7 * 24 * 60 * 60 * 1000) setShowBackupBanner(true);
      }

      // Warn if storage is getting full (>80% used).
      if (navigator.storage?.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        if (usage / quota > 0.8) {
          showToast(`Storage ${Math.round((usage / quota) * 100)}% full — export a backup soon`, "error");
        }
      }
    }
    load().catch(err => {
      console.error("Failed to load saved data:", err);
      showToast("Could not read saved data", "error");
    });
  }, []);

  useEffect(() => {
    if (saveSkipRef.current) { saveSkipRef.current = false; return; }
    const onQuota = (err) => {
      if (err.name === "QuotaExceededError") showToast("Storage full — export a backup to free space", "error");
      else showToast("Could not save changes", "error");
    };
    db.contacts.bulkPut(contacts).catch(onQuota);
    db.settings.bulkPut([
      { key: "profiles",        value: profiles },
      { key: "activeProfileId", value: activeProfileId },
      { key: "msgTemplate",     value: msgTemplate },
      { key: "themeMode",       value: themeMode },
      { key: "categories",      value: categories },
      { key: "lastExportedAt",  value: lastExportedAt },
    ]).catch(onQuota);
  }, [contacts, profiles, activeProfileId, msgTemplate, themeMode, categories, lastExportedAt]);

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

  useEffect(() => {
    if (view !== "qr" || !myInfo.phone) { setSmsQrUrl(null); return; }
    const phone = myInfo.phone.replace(/\D/g, "");
    const e164  = phone.length === 10 ? `+1${phone}` : `+${phone}`;
    const body  = `Hi ${myInfo.name || "there"}! Just visited ${myInfo.store || "the store"} today — wanted to stay in touch 😊`;
    QRCode.toDataURL(`sms:${e164}?body=${encodeURIComponent(body)}`, {
      width: 300, margin: 2, color: { dark: "#000000", light: "#ffffff" },
    }).then(setSmsQrUrl).catch(() => showToast("Could not generate QR", "error"));
  }, [view, myInfo.phone, myInfo.name, myInfo.store]);

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
    const existing = editId ? contacts.find(c => c.id === editId) : null;
    const record = {
      id: existing?.id || crypto.randomUUID(),
      name: form.name.trim(),
      phone: form.phone.trim().replace(/\D/g, ""),
      interest: form.interest,
      notes: form.notes.trim(),
      followUpDate: followUpDate.toISOString().split("T")[0],
      addedDate: existing?.addedDate || new Date().toISOString().split("T")[0],
      texted: existing?.texted || false,
      done: false,
      consentTimestamp: existing?.consentTimestamp || new Date().toISOString(),
    };
    if (editId) {
      setContacts(cs => cs.map(c => c.id === editId ? { ...c, ...record } : c));
      showToast("Contact updated");
    } else {
      setContacts(cs => [record, ...cs]);
      showToast("Contact added");
      // Request persistent storage on first save so the browser won't evict data.
      navigator.storage?.persist?.();
    }
    setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 });
    setEditId(null);
    setView("dashboard");
  }
  function markTexted(id)  { setContacts(cs => cs.map(c => c.id === id ? { ...c, texted: true } : c)); showToast("Marked as texted ✓"); }
  function markDone(id)    { setContacts(cs => cs.map(c => c.id === id ? { ...c, done: true }   : c)); showToast("Marked complete"); }
  function deleteContact(id) { setContacts(cs => cs.filter(c => c.id !== id)); db.contacts.delete(id); showToast("Deleted"); }
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
    const data = JSON.stringify({
      contacts, profiles, activeProfileId, msgTemplate, themeMode, categories, lastExportedAt: now,
    }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `followup-backup-${now.split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastExportedAt(now);
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
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.contacts) return showToast("Invalid backup file", "error");
        // Clear existing Dexie contacts before restore so old records don't persist.
        await db.contacts.clear();
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
    { label: "Total",      val: activeContacts.length, color: th.textMuted, f: "all"       },
    { label: "Overdue",    val: overdue,               color: th.red,        f: "overdue"   },
    { label: "Today",      val: dueToday,              color: th.orange,     f: "today"     },
    { label: "Not Texted", val: notTexted,             color: th.blue,       f: "not_texted"},
  ];

  function navTo(v) {
    if (v === "add") { setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }
    setView(v);
  }

  // ─── Shared sub-components ─────────────────────────────────────────────────

  const Banners = (
    <>
      {showUpdateBanner && (
        <div data-testid="update-banner" style={{ background: `${th.blue}18`, borderBottom: `0.5px solid ${th.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 14, color: th.blue, fontWeight: 500 }}>🆕 New version available</div>
          <button data-testid="update-banner-apply" onClick={applyUpdate}
            style={{ background: th.blue, color: "#ffffff", border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
            Update
          </button>
        </div>
      )}
      {showBackupBanner && (
        <div data-testid="backup-banner" style={{ background: `${th.orange}14`, borderBottom: `0.5px solid ${th.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 14, color: th.orange, lineHeight: 1.4, fontWeight: 500 }}>
            ⚠️ No backup in 7+ days
          </div>
          <button data-testid="backup-banner-now" onClick={() => { setShowMyInfo(true); setShowBackupBanner(false); }}
            style={{ background: th.orange, color: "#ffffff", border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
            Backup now
          </button>
          <button data-testid="backup-banner-dismiss" onClick={dismissBackupBanner}
            style={{ background: "none", border: "none", color: th.textDim, fontSize: 20, lineHeight: 1, padding: "0 4px" }}>
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
      <div key={c.id} style={{ background: th.surface, borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.2px" }}>{c.name}</div>
            <div style={{ fontSize: 14, color: th.textMuted, marginTop: 2 }}>{c.interest || "No interest noted"}</div>
            {c.notes && <div style={{ fontSize: 13, color: th.textDim, marginTop: 4, fontStyle: "italic" }}>"{c.notes}"</div>}
          </div>
          <div style={{ textAlign: "right", minWidth: 76, marginLeft: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: uc, background: uc + "22", borderRadius: 20, padding: "4px 10px", display: "inline-block", letterSpacing: "-0.1px" }}>
              {urgencyLabel(days)}
            </div>
            <div style={{ fontSize: 11, color: th.textDim, marginTop: 4 }}>{formatDate(c.followUpDate)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a href={smsLink(c.phone, c.name)} onClick={() => markTexted(c.id)}
            style={{ flex: 2, background: c.texted ? `${th.green}18` : `${th.green}22`, color: c.texted ? th.textMuted : th.green, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none", letterSpacing: "-0.1px" }}>
            {c.texted ? "✓ Texted" : "📱 Text"}
          </a>
          <a data-testid={`call-${c.id}`} href={`tel:${c.phone}`} title="Call"
            style={{ flex: 1, background: `${th.blue}18`, color: th.blue, borderRadius: 12, padding: "10px", fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            📞
          </a>
          <button onClick={() => editContact(c)}
            style={{ flex: 1, background: th.btnAltBg, color: th.textMuted, border: "none", borderRadius: 12, padding: "10px", fontSize: 14, fontWeight: 500 }}>
            Edit
          </button>
          <button onClick={() => markDone(c.id)}
            style={{ flex: 1, background: "rgba(212,168,83,0.14)", color: "#d4a853", border: "none", borderRadius: 12, padding: "10px", fontSize: 13, fontWeight: 600 }}>
            Done ✓
          </button>
          <button onClick={() => deleteContact(c.id)}
            style={{ background: `${th.red}18`, color: th.red, border: "none", borderRadius: 12, padding: "10px 12px", fontSize: 14 }}>
            🗑
          </button>
        </div>
        <div style={{ fontSize: 11, color: th.textDimmer, marginTop: 10, letterSpacing: "-0.1px" }}>
          Added {formatDate(c.addedDate)} · Consent logged in-person
        </div>
      </div>
    );
  };

  const SettingsPanel = (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 24, letterSpacing: "-0.4px" }}>Settings</div>

      {/* Profiles */}
      <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>Profiles</div>
      <div style={{ background: th.surface, borderRadius: 14, overflow: "hidden", marginBottom: 8, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {profiles.map((p, idx) => (
          <div key={p.id} data-testid={`profile-row-${p.id}`}>
            {idx > 0 && <div style={{ height: "0.5px", background: th.border, marginLeft: 16 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: p.id === activeProfileId ? 600 : 400, color: th.text }}>{p.name || "(no name)"}</div>
                {p.store && <div style={{ fontSize: 13, color: th.textMuted }}>{p.store}</div>}
              </div>
              {p.id !== activeProfileId && (
                <button data-testid={`switch-profile-${p.id}`} onClick={() => setActiveProfileId(p.id)}
                  style={{ background: "rgba(212,168,83,0.18)", color: "#d4a853", border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 14, fontWeight: 600 }}>
                  Switch
                </button>
              )}
              {p.id === activeProfileId && <div style={{ fontSize: 13, color: "#d4a853", fontWeight: 600 }}>Active</div>}
              {profiles.length > 1 && (
                <button data-testid={`delete-profile-${p.id}`} onClick={() => deleteProfile(p.id)}
                  style={{ background: "none", color: th.red, border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 14 }}>
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button data-testid="add-profile-btn" onClick={addProfile}
        style={{ width: "100%", background: "none", color: "#d4a853", border: "none", borderRadius: 14, padding: "12px", fontSize: 16, fontWeight: 500, marginBottom: 24 }}>
        + Add Profile
      </button>

      {/* My Info */}
      <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>My Info</div>
      <div style={{ background: th.surface, borderRadius: 14, overflow: "hidden", marginBottom: 24, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {[["name","Name"],["title","Title"],["store","Store"],["phone","Phone"],["email","Email"]].map(([k, label], i) => (
          <div key={k}>
            {i > 0 && <div style={{ height: "0.5px", background: th.border, marginLeft: 16 }} />}
            <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
              <div style={{ fontSize: 16, color: th.text, width: 80, flexShrink: 0, paddingTop: 14, paddingBottom: 14 }}>{label}</div>
              <input data-testid={`myinfo-${k}`} value={myInfo[k] || ""}
                onChange={e => updateActiveProfile(mi => ({ ...mi, [k]: e.target.value }))}
                style={{ flex: 1, background: "none", border: "none", padding: "14px 0", color: th.textMuted, fontSize: 16, textAlign: "right", outline: "none" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Appearance */}
      <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>Appearance</div>
      <div style={{ background: th.surface, borderRadius: 14, overflow: "hidden", marginBottom: 24, padding: "4px", display: "flex", gap: 4, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {["auto","light","dark"].map(mode => (
          <button key={mode} data-testid={`theme-${mode}`} onClick={() => setThemeMode(mode)}
            style={{ flex: 1, background: themeMode === mode ? "#d4a853" : "none", color: themeMode === mode ? "#000000" : th.textMuted, border: "none", borderRadius: 10, padding: "9px 4px", fontSize: 14, fontWeight: themeMode === mode ? 700 : 400, textTransform: "capitalize" }}>
            {mode === "auto" ? "Auto" : mode === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>Interest Categories</div>
      <div style={{ background: th.surface, borderRadius: 14, overflow: "hidden", marginBottom: 8, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {categories.map((cat, i) => (
          <div key={cat}>
            {i > 0 && <div style={{ height: "0.5px", background: th.border, marginLeft: 16 }} />}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px" }}>
              <div style={{ flex: 1, fontSize: 16, color: th.text }}>{cat}</div>
              <button data-testid={`delete-category-${cat}`} onClick={() => setCategories(cs => cs.filter(c => c !== cat))}
                style={{ background: "none", color: th.red, border: "none", fontSize: 14, padding: "0 0 0 12px" }}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input data-testid="new-category-input" value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newCategory.trim()) { setCategories(cs => [...cs, newCategory.trim()]); setNewCategory(""); } }}
          placeholder="Add a category…"
          style={{ flex: 1, background: th.surface, border: `0.5px solid ${th.border}`, borderRadius: 12, padding: "12px 14px", color: th.text, fontSize: 16, outline: "none" }} />
        <button data-testid="add-category-btn"
          onClick={() => { if (newCategory.trim()) { setCategories(cs => [...cs, newCategory.trim()]); setNewCategory(""); } }}
          style={{ background: "#d4a853", color: "#000000", border: "none", borderRadius: 12, padding: "12px 18px", fontSize: 16, fontWeight: 600 }}>
          Add
        </button>
      </div>

      {/* Message Template */}
      <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>Text Message Template</div>
      <div style={{ background: th.surface, borderRadius: 14, overflow: "hidden", marginBottom: 12, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        <textarea data-testid="template-textarea" value={msgTemplate}
          onChange={e => setMsgTemplate(e.target.value)} rows={4}
          style={{ width: "100%", background: "none", border: "none", padding: "14px 16px", color: th.text, fontSize: 15, resize: "none", lineHeight: 1.6, outline: "none" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {[["{name}","customer name"],["{myName}","your name"],["{store}","store name"],["{phone}","your phone"],["{title}","your title"]].map(([v, hint]) => (
          <button key={v} onClick={() => setMsgTemplate(prev => prev + v)} title={hint}
            style={{ background: th.btnAltBg, color: "#d4a853", border: "none", borderRadius: 20, padding: "6px 12px", fontSize: 13, fontWeight: 500 }}>
            {v}
          </button>
        ))}
      </div>
      <div style={{ background: th.surface, borderRadius: 14, padding: "14px 16px", marginBottom: 8, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 11, color: th.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>Preview — sent to "{previewName}"</div>
        <div style={{ fontSize: 14, color: th.textMuted, lineHeight: 1.6 }}>{msgPreview}</div>
      </div>
      <button onClick={() => { setMsgTemplate(DEFAULT_TEMPLATE); showToast("Template reset"); }}
        style={{ background: "none", border: "none", color: th.textMuted, fontSize: 14, padding: "0 4px 24px", textDecoration: "underline" }}>
        Reset to default
      </button>

      {/* Backup */}
      <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>Backup & Restore</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <button onClick={exportData}
          style={{ flex: 1, background: `${th.green}18`, color: th.green, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 600 }}>
          ⬇️ Export Backup
        </button>
        <label style={{ flex: 1, background: `${th.blue}18`, color: th.blue, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 600, textAlign: "center", cursor: "pointer" }}>
          ⬆️ Restore
          <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ fontSize: 12, color: th.textDimmer, marginBottom: 28, lineHeight: 1.5, paddingLeft: 4 }}>
        All data stored locally on your device only. Never shared.
      </div>

      <button onClick={() => setShowMyInfo(false)}
        style={{ width: "100%", background: "#d4a853", color: "#000000", border: "none", borderRadius: 14, padding: "16px", fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px" }}>
        Done
      </button>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div data-testid="app-root" data-theme={effectiveTheme}
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif",
        background: th.appBg,
        color: th.text,
        minHeight: "100dvh",
        display: isDesktop ? "flex" : "block",
        maxWidth: isDesktop ? "none" : 480,
        margin: isDesktop ? 0 : "0 auto",
        // Push content below Dynamic Island / notch on mobile PWA
        paddingTop: isDesktop ? 0 : "env(safe-area-inset-top)",
      }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        html, body {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
          background: ${th.appBg};
          overscroll-behavior-y: contain;
          -webkit-tap-highlight-color: transparent;
          min-height: 100dvh;
        }
        input, select, textarea { font-family: inherit; }
        button { cursor: pointer; font-family: inherit; touch-action: manipulation; }
        a { font-family: inherit; touch-action: manipulation; }
        input, select, textarea, button { -webkit-appearance: none; appearance: none; }
        select { background-image: none; }
        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; -ms-overflow-style: none; }
        .contact-grid {
          display: grid;
          grid-template-columns: ${isWide ? "repeat(2, 1fr)" : "1fr"};
          gap: ${isWide ? "0 16px" : "0"};
        }
      `}</style>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: "fixed", top: "max(calc(env(safe-area-inset-top) + 12px), 20px)", left: "50%", transform: "translateX(-50%)", background: effectiveTheme === "dark" ? "rgba(44,44,46,0.96)" : "rgba(255,255,255,0.96)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", color: toast.type === "error" ? th.red : th.green, padding: "11px 20px", borderRadius: 14, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 24px rgba(0,0,0,0.30)", whiteSpace: "nowrap", maxWidth: "calc(100vw - 40px)", textAlign: "center", border: `0.5px solid ${th.border}` }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center" }}
          onClick={() => setShowMyInfo(false)}>
          <div style={{
            background: th.appBg,
            width: "100%",
            maxWidth: isDesktop ? 560 : 480,
            borderRadius: isDesktop ? 20 : "20px 20px 0 0",
            padding: "0 20px 0",
            paddingBottom: isDesktop ? 0 : "calc(env(safe-area-inset-bottom))",
            maxHeight: isDesktop ? "90dvh" : "92dvh",
            overflowY: "auto",
            margin: isDesktop ? "0 16px" : "0 auto",
          }} onClick={e => e.stopPropagation()}>
            {/* iOS sheet grabber handle */}
            {!isDesktop && (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: th.border }} />
              </div>
            )}
            <div style={{ padding: isDesktop ? "24px 0" : "8px 0 24px" }}>
              {SettingsPanel}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT
      ══════════════════════════════════════════════════════════════════ */}
      {isDesktop && (
        <aside style={{
          width: 260,
          minWidth: 260,
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
          background: th.surface,
          borderRight: `0.5px solid ${th.border}`,
          display: "flex",
          flexDirection: "column",
          padding: "28px 16px 24px",
        }}>
          {/* Logo + profile */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#d4a853", lineHeight: 1, letterSpacing: "-0.5px" }}>Follow-Up</div>
            <div style={{ fontSize: 13, color: th.textMuted, marginTop: 6, lineHeight: 1.5 }}>
              {myInfo.name && <span style={{ fontWeight: 600, color: th.text }}>{myInfo.name} · </span>}
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
            {[
              { icon: "👥", label: "Contacts",       active: view === "dashboard", action: () => navTo("dashboard") },
              { icon: "＋", label: "Add Contact",     active: view === "add",       action: () => navTo("add") },
              { icon: "🔳", label: "Get Number (QR)", active: view === "qr",        action: () => navTo("qr") },
              { icon: "🔔", label: `Follow-ups${overdue > 0 ? ` (${overdue})` : ""}`, active: false, action: () => { setFilter("overdue"); setView("dashboard"); }, urgent: overdue > 0 },
              { icon: "🔍", label: "Lookup",          active: view === "lookup",    action: () => navTo("lookup") },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "none", background: item.active ? "rgba(212,168,83,0.15)" : "none", color: item.active ? "#d4a853" : item.urgent ? th.red : th.textMuted, fontSize: 15, fontWeight: item.active ? 600 : 400, textAlign: "left", width: "100%", letterSpacing: "-0.1px" }}>
                <span style={{ fontSize: 19, width: 26, textAlign: "center" }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Stats */}
          <div style={{ fontSize: 11, color: th.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>Overview</div>
          <div style={{ background: th.btnAltBg, borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
            {stats.map((s, i) => (
              <div key={s.f}>
                {i > 0 && <div style={{ height: "0.5px", background: th.border, marginLeft: 14 }} />}
                <button onClick={() => { setFilter(filter === s.f ? "all" : s.f); setView("dashboard"); }}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "none", background: filter === s.f ? s.color + "18" : "none" }}>
                  <span style={{ fontSize: 14, color: filter === s.f ? s.color : th.textMuted }}>{s.label}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: s.color }}>{s.val}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <button data-testid="qr-btn" onClick={openQR}
              style={{ background: th.btnAltBg, color: th.textMuted, border: "none", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
              ⬛ vCard QR
            </button>
            <button onClick={shareCard}
              style={{ background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "none", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 600 }}>
              Share Card
            </button>
            <button data-testid="settings-btn" onClick={() => setShowMyInfo(true)}
              style={{ background: th.btnAltBg, color: th.textMuted, border: "none", borderRadius: 12, padding: "10px 14px", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
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
        height: isDesktop ? "100dvh" : "auto",
        overflowY: isDesktop ? "auto" : "visible",
        paddingBottom: isDesktop ? 0 : "calc(env(safe-area-inset-bottom) + 90px)",
      }}>
        {Banners}

        {/* ── Mobile-only header ─────────────────────────────────────────── */}
        {!isDesktop && (
          <div style={{ background: th.navBg, backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderBottom: `0.5px solid ${th.border}`, position: "sticky", top: 0, zIndex: 40 }}>
            {/* Nav bar row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 10px" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#d4a853", letterSpacing: "-0.5px", lineHeight: 1 }}>Follow-Up</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button data-testid="qr-btn" onClick={openQR}
                  style={{ background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "none", borderRadius: 20, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
                  Share Card
                </button>
                <button data-testid="settings-btn" onClick={() => setShowMyInfo(true)}
                  style={{ background: th.btnAltBg, color: th.textMuted, border: "none", borderRadius: 20, width: 34, height: 34, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ⚙️
                </button>
              </div>
            </div>
            {/* Stat filter chips */}
            <div style={{ display: "flex", gap: 8, padding: "0 16px 12px", overflowX: "auto" }}>
              {stats.map(s => (
                <button key={s.f} onClick={() => setFilter(filter === s.f ? "all" : s.f)}
                  style={{ flex: "0 0 auto", background: filter === s.f ? s.color + "22" : th.btnAltBg, border: `1px solid ${filter === s.f ? s.color + "88" : th.border}`, borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.val}</span>
                  <span style={{ fontSize: 12, color: filter === s.f ? s.color : th.textMuted, fontWeight: filter === s.f ? 600 : 400 }}>{s.label}</span>
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
                {view === "dashboard" ? "Contacts" : view === "add" ? (editId ? "Edit Contact" : "New Contact") : view === "qr" ? "Get Customer Number" : "Furniture Lookup"}
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
          <div style={{ padding: isDesktop ? "24px 28px" : "16px 16px", maxWidth: isDesktop ? 560 : "none" }}>
            {!isDesktop && (
              <div style={{ fontSize: 28, fontWeight: 700, color: th.text, marginBottom: 20, letterSpacing: "-0.5px" }}>
                {editId ? "Edit Contact" : "New Customer"}
              </div>
            )}

            {/* Grouped input card */}
            <div style={{ background: th.surface, borderRadius: 14, overflow: "hidden", marginBottom: 16, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
              {[["name","Customer Name","text","Full name"],["phone","Phone Number","tel","Mobile number"]].map(([k, label, type, placeholder], i) => (
                <div key={k}>
                  {i > 0 && <div style={{ height: "0.5px", background: th.border, marginLeft: 16 }} />}
                  <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
                    <div style={{ fontSize: 16, color: th.textMuted, width: 110, flexShrink: 0, paddingTop: 14, paddingBottom: 14 }}>{label}</div>
                    <input data-testid={`input-${k}`} type={type} value={form[k]} placeholder={placeholder}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      style={{ flex: 1, background: "none", border: "none", padding: "14px 0", color: th.text, fontSize: 16, textAlign: "right", outline: "none" }} />
                  </div>
                </div>
              ))}
              <div style={{ height: "0.5px", background: th.border, marginLeft: 16 }} />
              <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
                <div style={{ fontSize: 16, color: th.textMuted, width: 110, flexShrink: 0, paddingTop: 14, paddingBottom: 14 }}>Interested In</div>
                <select data-testid="select-interest" value={form.interest}
                  onChange={e => setForm(f => ({ ...f, interest: e.target.value }))}
                  style={{ flex: 1, background: "none", border: "none", padding: "14px 0", color: form.interest ? th.text : th.textMuted, fontSize: 16, textAlign: "right", outline: "none" }}>
                  <option value="">Select…</option>
                  {categories.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ background: th.surface, borderRadius: 14, marginBottom: 16, overflow: "hidden", boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
              <textarea data-testid="textarea-notes" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                placeholder="Budget, style preference, timeline…"
                style={{ width: "100%", background: "none", border: "none", padding: "14px 16px", color: th.text, fontSize: 16, resize: "none", outline: "none", lineHeight: 1.5 }} />
            </div>

            {/* Follow-up interval */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6, paddingLeft: 4 }}>Follow Up In</div>
              <div style={{ display: "flex", gap: 8 }}>
                {FOLLOW_UP_INTERVALS.map(i => (
                  <button key={i.days} onClick={() => setForm(f => ({ ...f, followUpDays: i.days }))}
                    style={{ flex: 1, background: form.followUpDays === i.days ? "#d4a853" : th.surface, color: form.followUpDays === i.days ? "#000000" : th.textMuted, border: "none", borderRadius: 12, padding: "10px 4px", fontSize: 13, fontWeight: form.followUpDays === i.days ? 700 : 400, boxShadow: effectiveTheme === "dark" ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
                    {i.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: `${th.green}14`, borderRadius: 12, padding: "10px 14px", marginBottom: 24, marginTop: 16, fontSize: 13, color: th.green, lineHeight: 1.5 }}>
              🔒 In-person verbal consent logged · {new Date().toLocaleDateString()}
            </div>

            <button onClick={saveContact}
              style={{ width: "100%", background: "#d4a853", color: "#000000", border: "none", borderRadius: 14, padding: "16px", fontSize: 17, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.2px" }}>
              {editId ? "Save Changes" : "Add Customer"}
            </button>
            <button onClick={() => { setView("dashboard"); setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }}
              style={{ width: "100%", background: "none", color: th.textMuted, border: "none", borderRadius: 14, padding: "14px", fontSize: 17 }}>
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

        {/* ── Get Number QR view ─────────────────────────────────────────── */}
        {view === "qr" && (
          <div style={{ padding: isDesktop ? "24px 28px" : "16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {!isDesktop && (
              <div style={{ textAlign: "center", marginBottom: 8, width: "100%" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#d4a853" }}>Get Their Number</div>
                <div style={{ fontSize: 13, color: th.textMuted, marginTop: 3 }}>Have your customer scan this with their camera</div>
              </div>
            )}

            {!myInfo.phone ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>📵</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: th.text, marginBottom: 8 }}>Add your phone number first</div>
                <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
                  Customers need your number to text you. Add it in Settings.
                </div>
                <button onClick={() => setShowMyInfo(true)}
                  style={{ background: "#d4a853", color: "#0f0f13", border: "none", borderRadius: 10, padding: "13px 28px", fontSize: 15, fontWeight: 600 }}>
                  Open Settings
                </button>
              </div>
            ) : (
              <>
                {/* QR code on white card — high contrast for easy scanning */}
                <div style={{ background: "#ffffff", borderRadius: 24, padding: 20, margin: "12px 0 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
                  {smsQrUrl ? (
                    <img src={smsQrUrl} alt="Scan to text me"
                      style={{ width: 260, height: 260, display: "block", borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 260, height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>
                      Generating…
                    </div>
                  )}
                </div>

                {/* Step instructions */}
                <div style={{ textAlign: "center", maxWidth: 300, marginBottom: 16 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: th.text, marginBottom: 6 }}>
                    📷 Scan → tap Send
                  </div>
                  <div style={{ fontSize: 13, color: th.textMuted, lineHeight: 1.6 }}>
                    Opens a pre-written text to {myInfo.name || "you"}.<br />
                    Customer just hits <strong>Send</strong> — you get their number instantly.
                  </div>
                </div>

                {/* Message preview bubble */}
                <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16, padding: "12px 16px", maxWidth: 320, width: "100%", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: th.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Message they'll send you</div>
                  <div style={{ background: "#34c759", borderRadius: "14px 14px 4px 14px", padding: "10px 14px", display: "inline-block", maxWidth: "100%" }}>
                    <div style={{ fontSize: 14, color: "#ffffff", lineHeight: 1.5 }}>
                      Hi {myInfo.name || "there"}! Just visited {myInfo.store || "the store"} today — wanted to stay in touch 😊
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: th.textDimmer, textAlign: "center" }}>
                  Texts sent to {myInfo.phone}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom tab bar (iOS style) ───────────────────────────── */}
      {!isDesktop && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: th.tabBg, backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderTop: `0.5px solid ${th.border}`, display: "flex", padding: "8px 0 0", paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)", zIndex: 50 }}>
          {[
            { icon: "👥", label: "Contacts",    onClick: () => setView("dashboard"),                         active: view === "dashboard" },
            { icon: "🔳", label: "Get #",       onClick: () => setView("qr"),                                active: view === "qr" },
            { icon: "＋", label: "Add",          onClick: () => navTo("add"),                                 active: view === "add",    accent: true },
            { icon: "🔔", label: overdue > 0 ? `${overdue} Due` : "Alerts", onClick: () => { setFilter("overdue"); setView("dashboard"); }, active: filter === "overdue" && view === "dashboard", urgent: overdue > 0 },
            { icon: "🔍", label: "Lookup",      onClick: () => setView("lookup"),                            active: view === "lookup" },
          ].map(tab => (
            <button key={tab.label} onClick={tab.onClick}
              style={{ flex: 1, background: "none", border: "none", color: tab.active ? "#d4a853" : tab.urgent ? th.red : th.textDim, fontSize: 10, fontWeight: tab.active ? 600 : 400, padding: "2px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontSize: tab.accent ? 26 : 22, lineHeight: 1.2 }}>{tab.icon}</div>
              <div style={{ letterSpacing: "-0.1px" }}>{tab.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
