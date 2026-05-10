import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { db } from "./db.js";

const cn = (...inputs) => twMerge(clsx(inputs));

// Kept only for one-time migration of existing localStorage data.
const STORAGE_KEY = "furniture_crm_v1";
const DISMISS_KEY = "followup_backup_dismissed_until";

const DEFAULT_CATEGORIES = [
  "Sofa / Sectional", "Bedroom Set", "Dining Table", "Home Office",
  "Mattress", "Accent Chairs", "Storage / Shelving", "Outdoor",
  "Kids Furniture", "Just Browsing",
];

const FOLLOW_UP_INTERVALS = [
  { label: "Tomorrow", days: 1 },
  { label: "3 Days",   days: 3 },
  { label: "1 Week",   days: 7 },
  { label: "2 Weeks",  days: 14 },
  { label: "1 Month",  days: 30 },
];

const DEFAULT_TEMPLATE =
  `Hi {name}! This is {myName} from {store}. Great meeting you today — feel free to reach out if you have any questions about what you saw. 😊`;

// ── Static urgency class maps (full strings required for Tailwind purging) ──
const UGY = {
  overdue: { badge: "bg-red-500/15 text-red-500",                                        text: "text-red-500" },
  today:   { badge: "bg-orange-500/15 text-orange-500",                                   text: "text-orange-500" },
  soon:    { badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",                 text: "text-amber-600 dark:text-amber-400" },
  future:  { badge: "bg-green-500/15 text-green-600 dark:text-green-500",                 text: "text-green-600 dark:text-green-500" },
};

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 480);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return Math.round((d - today) / 86400000);
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function urgencyClasses(days) {
  if (days < 0)   return UGY.overdue;
  if (days === 0)  return UGY.today;
  if (days <= 2)   return UGY.soon;
  return UGY.future;
}
function urgencyLabel(days) {
  if (days < 0)   return `${Math.abs(days)}d overdue`;
  if (days === 0)  return "Today";
  if (days === 1)  return "Tomorrow";
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
  const [qrCustomerName, setQrCustomerName] = useState("");
  const [qrItems,        setQrItems]        = useState([]);
  const [qrNewItem,      setQrNewItem]      = useState("");
  const [qrShowCode,     setQrShowCode]     = useState(false);
  const saveSkipRef = useRef(true);

  // Compute the resolved theme for data-theme attribute (used by Playwright tests).
  const effectiveTheme =
    themeMode === "auto"
      ? (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : themeMode;

  // Sync dark class on <html> for Tailwind dark: variants.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const isDark =
        themeMode === "dark" ||
        (themeMode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode]);

  const myInfo = profiles.find(p => p.id === activeProfileId) || profiles[0] || defaultMyInfo;

  const qrSmsBody = (() => {
    const parts = [`Hi ${myInfo.name || "there"}!`];
    if (qrCustomerName) parts.push(`This is ${qrCustomerName}.`);
    if (myInfo.store)   parts.push(`I visited ${myInfo.store} today.`);
    if (qrItems.length) parts.push(`I was looking at: ${qrItems.join(", ")}.`);
    parts.push("Please reach out! 😊");
    return parts.join(" ");
  })();

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

  // ── Data load + migration ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
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

      const [storedContacts, profs, activeId, template, theme, cats, lastExp] = await Promise.all([
        db.contacts.toArray(),
        db.settings.get("profiles"),
        db.settings.get("activeProfileId"),
        db.settings.get("msgTemplate"),
        db.settings.get("themeMode"),
        db.settings.get("categories"),
        db.settings.get("lastExportedAt"),
      ]);

      if (storedContacts.length)  setContacts(storedContacts);
      if (profs?.value)           setProfiles(profs.value);
      if (activeId?.value)        setActiveProfileId(activeId.value);
      if (template?.value)        setMsgTemplate(template.value);
      if (theme?.value)           setThemeMode(theme.value);
      if (lastExp?.value)         setLastExportedAt(lastExp.value);
      setCategories(cats?.value || DEFAULT_CATEGORIES);

      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      const now = Date.now();
      if (!dismissedUntil || now >= Number(dismissedUntil)) {
        const lastExport = lastExp?.value ? new Date(lastExp.value).getTime() : 0;
        if (now - lastExport > 7 * 24 * 60 * 60 * 1000) setShowBackupBanner(true);
        else setShowBackupBanner(false);
      }

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

  // ── Persist to Dexie ──────────────────────────────────────────────────────
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

  // ── Service-worker update detection ───────────────────────────────────────
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

  // ── SMS QR code generation ────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "qr" || !myInfo.phone) { setSmsQrUrl(null); return; }
    const phone = myInfo.phone.replace(/\D/g, "");
    const e164  = phone.length === 10 ? `+1${phone}` : `+${phone}`;
    QRCode.toDataURL(`sms:${e164}?body=${encodeURIComponent(qrSmsBody)}`, {
      width: 300, margin: 2, color: { dark: "#000000", light: "#ffffff" },
    }).then(setSmsQrUrl).catch(() => showToast("Could not generate QR", "error"));
  }, [view, myInfo.phone, qrSmsBody]);

  // ── Handlers ──────────────────────────────────────────────────────────────
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
      const isDark = document.documentElement.classList.contains("dark");
      const url = await QRCode.toDataURL(buildVCard(), {
        width: 280, margin: 2,
        color: { dark: isDark ? "#ffffff" : "#000000", light: isDark ? "#18181b" : "#ffffff" },
      });
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

  function navTo(v) {
    if (v === "add") { setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }
    if (v === "qr")  { setQrCustomerName(""); setQrItems([]); setQrNewItem(""); setQrShowCode(false); }
    setView(v);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
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

  // Static class strings — must be complete for Tailwind purging.
  const STAT_META = [
    { label: "Total",      val: activeContacts.length, valCls: "text-zinc-500 dark:text-zinc-400", inactiveCls: "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400",  activeCls: "bg-zinc-200 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200",  f: "all"        },
    { label: "Overdue",    val: overdue,               valCls: "text-red-500",                      inactiveCls: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-500",                    activeCls: "bg-red-100 dark:bg-red-500/20 border-red-400 dark:border-red-500/50 text-red-600 dark:text-red-400",    f: "overdue"    },
    { label: "Today",      val: dueToday,              valCls: "text-orange-500",                   inactiveCls: "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20 text-orange-500",      activeCls: "bg-orange-100 dark:bg-orange-500/20 border-orange-400 dark:border-orange-500/50 text-orange-600 dark:text-orange-400", f: "today"      },
    { label: "Not Texted", val: notTexted,             valCls: "text-blue-500",                     inactiveCls: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-500",               activeCls: "bg-blue-100 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500/50 text-blue-600 dark:text-blue-400",    f: "not_texted" },
  ];

  // ── Sub-components ────────────────────────────────────────────────────────

  const Banners = (
    <>
      {showUpdateBanner && (
        <div data-testid="update-banner"
          className="bg-blue-50 dark:bg-blue-500/5 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center gap-2.5">
          <div className="flex-1 text-sm text-blue-500 font-medium">🆕 New version available</div>
          <button data-testid="update-banner-apply" onClick={applyUpdate}
            className="bg-blue-500 text-white rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 border-0">
            Update
          </button>
        </div>
      )}
      {showBackupBanner && (
        <div data-testid="backup-banner"
          className="bg-amber-50 dark:bg-amber-500/5 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center gap-2.5">
          <div className="flex-1 text-sm text-amber-600 dark:text-amber-500 leading-snug font-medium">
            ⚠️ No backup in 7+ days
          </div>
          <button data-testid="backup-banner-now"
            onClick={() => { setShowMyInfo(true); setShowBackupBanner(false); }}
            className="bg-[#d4a853] text-zinc-950 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 border-0">
            Backup now
          </button>
          <button data-testid="backup-banner-dismiss" onClick={dismissBackupBanner}
            className="text-zinc-400 dark:text-zinc-500 text-xl leading-none px-1 border-0 bg-transparent">
            ×
          </button>
        </div>
      )}
    </>
  );

  const ContactCard = (c) => {
    const days = daysUntil(c.followUpDate);
    const uc   = urgencyClasses(days);
    const lbl  = urgencyLabel(days);
    return (
      <div key={c.id}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-2.5">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate tracking-tight">{c.name}</div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{c.interest || "No interest noted"}</div>
            {c.notes && <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 italic">"{c.notes}"</div>}
          </div>
          <div className="text-right min-w-[76px] ml-2.5 shrink-0">
            <div data-testid="urgency-badge" className={cn("text-xs font-bold rounded-full px-2.5 py-1 inline-block", uc.badge)}>
              {lbl}
            </div>
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">{formatDate(c.followUpDate)}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <a href={smsLink(c.phone, c.name)} onClick={() => markTexted(c.id)}
            className={cn(
              "flex-[2] rounded-xl px-3 py-2.5 text-sm font-semibold text-center no-underline",
              c.texted
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                : "bg-green-500/15 text-green-600 dark:text-green-500"
            )}>
            {c.texted ? "✓ Texted" : "📱 Text Now"}
          </a>
          <a data-testid={`call-${c.id}`} href={`tel:${c.phone}`} title="Call"
            className="flex-1 bg-blue-500/10 text-blue-500 rounded-xl px-3 py-2.5 text-sm no-underline flex items-center justify-center">
            📞
          </a>
          <button onClick={() => editContact(c)}
            className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-0 rounded-xl px-3 py-2.5 text-sm">
            Edit
          </button>
          <button onClick={() => markDone(c.id)}
            className="flex-1 bg-[#d4a853]/15 text-[#d4a853] border-0 rounded-xl px-3 py-2.5 text-xs font-semibold">
            Done ✓
          </button>
          <button onClick={() => deleteContact(c.id)}
            className="bg-red-500/10 text-red-500 border-0 rounded-xl px-3 py-2.5 text-sm">
            🗑
          </button>
        </div>
        <div className="text-[11px] text-zinc-300 dark:text-zinc-600 mt-2.5">
          Added {formatDate(c.addedDate)} · Consent: in-person
        </div>
      </div>
    );
  };

  const SettingsPanel = (
    <div>
      <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-6 tracking-tight">Settings</div>

      {/* Profiles */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-2">Profiles</div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-2">
        {profiles.map((p, idx) => (
          <div key={p.id} data-testid={`profile-row-${p.id}`}>
            {idx > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />}
            <div className="flex items-center gap-2.5 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className={cn("text-base text-zinc-900 dark:text-zinc-100 truncate", p.id === activeProfileId ? "font-semibold" : "font-normal")}>
                  {p.name || "(no name)"}
                </div>
                {p.store && <div className="text-sm text-zinc-500 dark:text-zinc-400">{p.store}</div>}
              </div>
              {p.id !== activeProfileId && (
                <button data-testid={`switch-profile-${p.id}`} onClick={() => setActiveProfileId(p.id)}
                  className="bg-[#d4a853]/20 text-[#d4a853] border-0 rounded-full px-3.5 py-1.5 text-sm font-semibold shrink-0">
                  Switch
                </button>
              )}
              {p.id === activeProfileId && (
                <div className="text-sm text-[#d4a853] font-semibold shrink-0">Active</div>
              )}
              {profiles.length > 1 && (
                <button data-testid={`delete-profile-${p.id}`} onClick={() => deleteProfile(p.id)}
                  className="text-red-500 text-sm border-0 bg-transparent px-2 py-1 shrink-0">
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button data-testid="add-profile-btn" onClick={addProfile}
        className="w-full bg-transparent text-[#d4a853] border-0 rounded-xl py-3 text-base font-medium mb-6">
        + Add Profile
      </button>

      {/* My Info */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-2">My Info</div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-6">
        {[["name","Name"],["title","Title"],["store","Store"],["phone","Phone"],["email","Email"]].map(([k, label], i) => (
          <div key={k}>
            {i > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />}
            <div className="flex items-center px-4">
              <div className="text-base text-zinc-900 dark:text-zinc-100 w-20 shrink-0 py-3.5">{label}</div>
              <input data-testid={`myinfo-${k}`} value={myInfo[k] || ""}
                onChange={e => updateActiveProfile(mi => ({ ...mi, [k]: e.target.value }))}
                className="flex-1 bg-transparent border-0 outline-none py-3.5 text-zinc-500 dark:text-zinc-400 text-base text-right"
                style={{ caretColor: "#d4a853" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Appearance */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-2">Appearance</div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 flex gap-1 mb-6">
        {["auto","light","dark"].map(mode => (
          <button key={mode} data-testid={`theme-${mode}`} onClick={() => setThemeMode(mode)}
            className={cn(
              "flex-1 border-0 rounded-lg py-2.5 text-sm capitalize",
              themeMode === mode
                ? "bg-[#d4a853] text-zinc-950 font-bold"
                : "bg-transparent text-zinc-500 dark:text-zinc-400 font-normal"
            )}>
            {mode === "auto" ? "Auto" : mode === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-2">Interest Categories</div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-2">
        {categories.map((cat, i) => (
          <div key={cat}>
            {i > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />}
            <div className="flex items-center px-4 py-3">
              <div className="flex-1 text-base text-zinc-900 dark:text-zinc-100">{cat}</div>
              <button data-testid={`delete-category-${cat}`}
                onClick={() => setCategories(cs => cs.filter(c => c !== cat))}
                className="text-red-500 text-sm border-0 bg-transparent pl-3">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-6">
        <input data-testid="new-category-input" value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newCategory.trim()) { setCategories(cs => [...cs, newCategory.trim()]); setNewCategory(""); } }}
          placeholder="Add a category…"
          className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
        <button data-testid="add-category-btn"
          onClick={() => { if (newCategory.trim()) { setCategories(cs => [...cs, newCategory.trim()]); setNewCategory(""); } }}
          className="bg-[#d4a853] text-zinc-950 border-0 rounded-xl px-4 py-3 text-base font-semibold">
          Add
        </button>
      </div>

      {/* Message Template */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-2">Text Message Template</div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-3">
        <textarea data-testid="template-textarea" value={msgTemplate}
          onChange={e => setMsgTemplate(e.target.value)} rows={4}
          className="w-full bg-transparent border-0 outline-none px-4 py-3.5 text-base text-zinc-900 dark:text-zinc-100 resize-none leading-relaxed" />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[["{name}","customer name"],["{myName}","your name"],["{store}","store name"],["{phone}","your phone"],["{title}","your title"]].map(([v, hint]) => (
          <button key={v} onClick={() => setMsgTemplate(prev => prev + v)} title={hint}
            className="bg-zinc-100 dark:bg-zinc-800 text-[#d4a853] border-0 rounded-full px-3 py-1.5 text-sm font-medium">
            {v}
          </button>
        ))}
      </div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-2">
        <div className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Preview — sent to "{previewName}"</div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{msgPreview}</div>
      </div>
      <button onClick={() => { setMsgTemplate(DEFAULT_TEMPLATE); showToast("Template reset"); }}
        className="bg-transparent border-0 text-zinc-400 dark:text-zinc-500 text-sm underline px-1 pb-6">
        Reset to default
      </button>

      {/* Backup */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-2">Backup & Restore</div>
      <div className="flex gap-2.5 mb-2">
        <button onClick={exportData}
          className="flex-1 bg-green-500/10 text-green-600 dark:text-green-400 border-0 rounded-xl py-3.5 text-sm font-semibold">
          ⬇️ Export Backup
        </button>
        <label className="flex-1 bg-blue-500/10 text-blue-500 rounded-xl py-3.5 text-sm font-semibold text-center cursor-pointer">
          ⬆️ Restore
          <input type="file" accept=".json" onChange={importData} className="hidden" />
        </label>
      </div>
      <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-7 leading-relaxed px-1">
        All data stored locally on your device only. Never shared.
      </div>

      <button onClick={() => setShowMyInfo(false)}
        className="w-full bg-[#d4a853] text-zinc-950 border-0 rounded-xl py-4 text-[17px] font-semibold tracking-tight">
        Done
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div data-testid="app-root" data-theme={effectiveTheme}
      className="min-h-dvh bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-[9999]",
            "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl",
            "px-5 py-3 text-sm font-semibold whitespace-nowrap shadow-lg max-w-[calc(100vw-40px)] text-center",
            toast.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"
          )}
          style={{ top: "max(calc(env(safe-area-inset-top) + 14px), 20px)" }}>
          {toast.msg}
        </div>
      )}

      {/* ── vCard QR Modal ────────────────────────────────────────────────── */}
      {showQR && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[300] flex items-center justify-center p-6"
          onClick={() => setShowQR(false)}>
          <div data-testid="qr-modal"
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-3xl p-7 text-center max-w-[340px] w-full shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="text-[22px] text-[#d4a853] mb-1 tracking-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Scan to Add Contact
            </div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
              {myInfo.name || "Your contact"}{myInfo.store ? ` · ${myInfo.store}` : ""}
            </div>
            {qrDataUrl && (
              <img data-testid="qr-image" src={qrDataUrl} alt="Contact QR code"
                className="w-[252px] h-[252px] rounded-2xl mx-auto mb-5 block" />
            )}
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-5 leading-relaxed">
              Customer scans with their camera to save your contact info.
            </div>
            <button onClick={() => setShowQR(false)}
              className="w-full bg-[#d4a853] text-zinc-950 border-0 rounded-xl py-3.5 text-base font-semibold">
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Settings Modal ────────────────────────────────────────────────── */}
      {showMyInfo && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[200] flex items-end md:items-center justify-center"
          onClick={() => setShowMyInfo(false)}>
          <div
            className={cn(
              "bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full overflow-y-auto shadow-2xl",
              isDesktop
                ? "max-w-[560px] rounded-3xl mx-4 max-h-[90dvh]"
                : "rounded-t-3xl max-h-[92dvh] max-w-[480px]"
            )}
            style={{ paddingBottom: isDesktop ? 0 : "env(safe-area-inset-bottom)" }}
            onClick={e => e.stopPropagation()}>
            {!isDesktop && (
              <div className="flex justify-center pt-3 pb-1.5">
                <div className="w-9 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
              </div>
            )}
            <div className={isDesktop ? "p-6" : "px-5 pt-2 pb-7"}>
              {SettingsPanel}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT
      ══════════════════════════════════════════════════════════════════ */}
      {isDesktop && (
        <div className="flex">
          <aside className="w-[260px] min-w-[260px] h-screen sticky top-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col py-7 px-4">
            {/* Logo */}
            <div className="mb-7">
              <div className="text-[28px] text-[#d4a853] leading-none tracking-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Follow-Up
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 leading-snug">
                {myInfo.name && <span className="font-semibold text-zinc-900 dark:text-zinc-100">{myInfo.name} · </span>}
                {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>

            {/* Nav */}
            <nav className="flex flex-col gap-0.5 mb-6">
              {[
                { icon: "👥", label: "Contacts",          active: view === "dashboard", action: () => navTo("dashboard") },
                { icon: "＋", label: "Add Contact",        active: view === "add",       action: () => navTo("add") },
                { icon: "🔳", label: "Get Number (QR)",    active: view === "qr",        action: () => navTo("qr") },
                { icon: "🔔", label: `Follow-ups${overdue > 0 ? ` (${overdue})` : ""}`, active: false, action: () => { setFilter("overdue"); setView("dashboard"); }, urgent: overdue > 0 },
                { icon: "🔍", label: "Lookup",             active: view === "lookup",    action: () => navTo("lookup") },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-0 text-[15px] text-left w-full",
                    item.active
                      ? "bg-[#d4a853]/15 text-[#d4a853] font-semibold"
                      : item.urgent
                        ? "bg-transparent text-red-500 font-normal"
                        : "bg-transparent text-zinc-500 dark:text-zinc-400 font-normal"
                  )}>
                  <span className="text-[19px] w-6 text-center">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Stats */}
            <div className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Overview</div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-6">
              {STAT_META.map((s, i) => (
                <div key={s.f}>
                  {i > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-3.5" />}
                  <button onClick={() => { setFilter(filter === s.f ? "all" : s.f); setView("dashboard"); }}
                    className={cn(
                      "w-full flex justify-between items-center px-3.5 py-2.5 border-0",
                      filter === s.f ? "bg-zinc-50 dark:bg-zinc-800/50" : "bg-transparent"
                    )}>
                    <span className={cn("text-sm", filter === s.f ? s.valCls : "text-zinc-500 dark:text-zinc-400")}>{s.label}</span>
                    <span className={cn("text-[17px] font-bold", s.valCls)}>{s.val}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-auto flex flex-col gap-2">
              <button data-testid="qr-btn" onClick={openQR}
                className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-0 rounded-xl px-3.5 py-2.5 text-sm font-medium flex items-center gap-2">
                ⬛ vCard QR
              </button>
              <button onClick={shareCard}
                className="bg-[#d4a853]/15 text-[#d4a853] border-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold">
                Share Card
              </button>
              <button data-testid="settings-btn" onClick={() => setShowMyInfo(true)}
                className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-0 rounded-xl px-3.5 py-2.5 text-sm flex items-center gap-2">
                ⚙️ Settings
              </button>
            </div>
          </aside>

          {/* Desktop main */}
          <div className="flex-1 min-w-0 h-dvh overflow-y-auto">
            {Banners}

            {/* Desktop page header */}
            <div className="px-7 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
              <div className="text-2xl text-[#d4a853] tracking-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {view === "dashboard" ? "Contacts"
                  : view === "add" ? (editId ? "Edit Contact" : "New Contact")
                  : view === "qr" ? "Customer Interest Card"
                  : "Furniture Lookup"}
              </div>
              {view === "dashboard" && (
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone…"
                  className="flex-1 max-w-[360px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
              )}
            </div>
            {view === "dashboard" && filter !== "all" && (
              <div className="px-7 py-2 flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Filtered: <span className="text-[#d4a853]">{filter.replace("_", " ")}</span>
                </span>
                <button onClick={() => setFilter("all")}
                  className="bg-transparent border-0 text-zinc-400 dark:text-zinc-500 text-xs">
                  Clear ×
                </button>
              </div>
            )}

            {/* Desktop view content */}
            {view === "dashboard" && (
              <div className="p-7">
                {filtered.length === 0 && (
                  <div className="text-center text-zinc-400 dark:text-zinc-500 mt-16">
                    <div className="text-5xl mb-3">🛋️</div>
                    <div className="text-base font-medium text-zinc-500 dark:text-zinc-400">No contacts yet</div>
                    <div className="text-sm mt-1">Add your first customer</div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: isWide ? "repeat(2, 1fr)" : "1fr", gap: isWide ? "0 16px" : "0" }}>
                  {filtered.map(c => ContactCard(c))}
                </div>
                {contacts.filter(c => c.done).length > 0 && (
                  <div className="text-center mt-3">
                    <button onClick={() => setFilter("done")}
                      className="bg-transparent border-0 text-zinc-400 dark:text-zinc-500 text-xs">
                      View {contacts.filter(c => c.done).length} completed →
                    </button>
                  </div>
                )}
              </div>
            )}

            {view === "add" && (
              <div className="p-7 max-w-[560px]">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-4">
                  {[["name","Customer Name","text","Full name"],["phone","Phone Number","tel","Mobile number"]].map(([k, label, type, placeholder], i) => (
                    <div key={k}>
                      {i > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />}
                      <div className="flex items-center px-4">
                        <div className="text-base text-zinc-500 dark:text-zinc-400 w-[110px] shrink-0 py-3.5">{label}</div>
                        <input data-testid={`input-${k}`} type={type} value={form[k]} placeholder={placeholder}
                          onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                          className="flex-1 bg-transparent border-0 outline-none py-3.5 text-zinc-900 dark:text-zinc-100 text-base text-right placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                      </div>
                    </div>
                  ))}
                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />
                  <div className="flex items-center px-4">
                    <div className="text-base text-zinc-500 dark:text-zinc-400 w-[110px] shrink-0 py-3.5">Interested In</div>
                    <select data-testid="select-interest" value={form.interest}
                      onChange={e => setForm(f => ({ ...f, interest: e.target.value }))}
                      className="flex-1 bg-transparent border-0 outline-none py-3.5 text-zinc-900 dark:text-zinc-100 text-base text-right">
                      <option value="">Select…</option>
                      {categories.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-4">
                  <textarea data-testid="textarea-notes" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    placeholder="Budget, style preference, timeline…"
                    className="w-full bg-transparent border-0 outline-none px-4 py-3.5 text-zinc-900 dark:text-zinc-100 text-base resize-none leading-relaxed placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                </div>
                <div className="mb-2">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5 px-1">Follow Up In</div>
                  <div className="flex gap-2">
                    {FOLLOW_UP_INTERVALS.map(i => (
                      <button key={i.days} onClick={() => setForm(f => ({ ...f, followUpDays: i.days }))}
                        className={cn(
                          "flex-1 border-0 rounded-xl py-2.5 text-sm",
                          form.followUpDays === i.days
                            ? "bg-[#d4a853] text-zinc-950 font-bold"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-normal"
                        )}>
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-green-500/10 rounded-xl px-3.5 py-2.5 my-4 text-sm text-green-600 dark:text-green-400 leading-relaxed">
                  🔒 In-person verbal consent logged · {new Date().toLocaleDateString()}
                </div>
                <button onClick={saveContact}
                  className="w-full bg-[#d4a853] text-zinc-950 border-0 rounded-xl py-4 text-[17px] font-semibold mb-3 tracking-tight">
                  {editId ? "Save Changes" : "Add Customer"}
                </button>
                <button onClick={() => { setView("dashboard"); setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }}
                  className="w-full bg-transparent text-zinc-500 dark:text-zinc-400 border-0 rounded-xl py-3.5 text-[17px]">
                  Cancel
                </button>
              </div>
            )}

            {view === "lookup" && (
              <div className="p-7 max-w-[680px]">
                <div className="text-sm text-zinc-400 dark:text-zinc-500 mb-5">Ask anything about furniture — specs, styles, materials, care tips.</div>
                <div className="flex gap-2 mb-3">
                  <input ref={lookupInputRef} value={lookupQuery}
                    onChange={e => setLookupQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && runLookup()}
                    placeholder="e.g. What's eight-way hand-tied?"
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                  <button onClick={() => runLookup()} disabled={lookupLoading || !lookupQuery.trim()}
                    className={cn(
                      "border-0 rounded-xl px-5 text-xl font-bold",
                      lookupLoading || !lookupQuery.trim()
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                        : "bg-[#d4a853] text-zinc-950"
                    )}>
                    {lookupLoading ? "…" : "→"}
                  </button>
                </div>
                {!lookupAnswer && !lookupLoading && (
                  <div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Try asking</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "What's the difference between memory foam and hybrid?",
                        "How to clean microfiber sofa?",
                        "What size rug for a 12x14 living room?",
                        "Solid wood vs engineered wood pros and cons",
                        "What's a good sofa frame to look for?",
                      ].map(q => (
                        <button key={q} onClick={() => { setLookupQuery(q); runLookup(q); }}
                          className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-3 py-1.5 text-zinc-500 dark:text-zinc-400 text-xs cursor-pointer text-left">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {lookupLoading && (
                  <div className="text-center text-zinc-400 dark:text-zinc-500 mt-10">
                    <div className="text-3xl mb-2">✨</div>
                    <div className="text-sm">Looking that up…</div>
                  </div>
                )}
                {lookupAnswer && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mt-1">
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">Answer</div>
                    <div className="text-sm text-zinc-900 dark:text-zinc-100 leading-7 whitespace-pre-wrap">{lookupAnswer}</div>
                    <button onClick={() => { setLookupAnswer(null); setLookupQuery(""); lookupInputRef.current?.focus(); }}
                      className="mt-3.5 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-1.5 text-zinc-500 dark:text-zinc-400 text-xs cursor-pointer">
                      Ask another
                    </button>
                  </div>
                )}
              </div>
            )}

            {view === "qr" && (
              <div className="p-7 max-w-[560px]">
                {!myInfo.phone ? (
                  <div className="text-center py-10 px-5">
                    <div className="text-5xl mb-3.5">📵</div>
                    <div className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Add your phone number first</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
                      Customers need your number to text you. Add it in Settings.
                    </div>
                    <button onClick={() => setShowMyInfo(true)}
                      className="bg-[#d4a853] text-zinc-950 border-0 rounded-xl px-7 py-3.5 text-[15px] font-semibold">
                      Open Settings
                    </button>
                  </div>
                ) : qrShowCode ? (
                  /* ── Step 2: Show QR ── */
                  <div className="flex flex-col items-center">
                    <div className="text-center mb-4">
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        {qrCustomerName ? `For ${qrCustomerName} — ` : ""}Scan to text, or photo for later
                      </div>
                    </div>
                    <div className="bg-white rounded-3xl p-5 shadow-xl mb-5">
                      {smsQrUrl ? (
                        <img src={smsQrUrl} alt="Scan to text me"
                          className="w-[260px] h-[260px] block rounded-lg" />
                      ) : (
                        <div className="w-[260px] h-[260px] flex items-center justify-center text-zinc-400 text-sm">
                          Generating…
                        </div>
                      )}
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 max-w-[320px] w-full mb-2">
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Message they'll send you</div>
                      <div className="bg-green-500 rounded-[14px_14px_4px_14px] px-3.5 py-2.5 inline-block max-w-full">
                        <div className="text-sm text-white leading-relaxed">{qrSmsBody}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center mb-5">Texts sent to {myInfo.phone}</div>
                    <button onClick={() => setQrShowCode(false)}
                      className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-0 rounded-xl px-7 py-3 text-base font-medium">
                      ← Edit Info
                    </button>
                  </div>
                ) : (
                  /* ── Step 1: Form ── */
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-1">Customer Name</div>
                    <input
                      value={qrCustomerName}
                      onChange={e => setQrCustomerName(e.target.value)}
                      placeholder="Their first name (optional)…"
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 mb-4"
                      style={{ caretColor: "#d4a853" }}
                    />

                    {qrItems.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {qrItems.map(item => (
                          <span key={item}
                            className="bg-[#d4a853] text-zinc-950 rounded-full px-3 py-1.5 text-sm font-medium flex items-center gap-1.5">
                            {item}
                            <button
                              onClick={() => setQrItems(prev => prev.filter(i => i !== item))}
                              className="text-zinc-950/60 border-0 bg-transparent p-0 leading-none text-xs font-bold">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-1">What they're looking at</div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {categories.map(cat => (
                        <button key={cat}
                          onClick={() => setQrItems(prev =>
                            prev.includes(cat) ? prev.filter(i => i !== cat) : [...prev, cat]
                          )}
                          className={cn(
                            "border rounded-full px-3 py-1.5 text-xs font-medium",
                            qrItems.includes(cat)
                              ? "bg-[#d4a853] text-zinc-950 border-[#d4a853]"
                              : "bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700"
                          )}>
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2 mb-5">
                      <input
                        value={qrNewItem}
                        onChange={e => setQrNewItem(e.target.value)}
                        onKeyDown={e => {
                          const v = qrNewItem.trim();
                          if (e.key === "Enter" && v && !qrItems.includes(v)) { setQrItems(prev => [...prev, v]); setQrNewItem(""); }
                        }}
                        placeholder="Other item…"
                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        style={{ caretColor: "#d4a853" }}
                      />
                      <button
                        onClick={() => {
                          const v = qrNewItem.trim();
                          if (v && !qrItems.includes(v)) { setQrItems(prev => [...prev, v]); setQrNewItem(""); }
                        }}
                        disabled={!qrNewItem.trim()}
                        className="bg-[#d4a853] text-zinc-950 border-0 rounded-xl px-4 text-sm font-semibold disabled:opacity-40">
                        Add
                      </button>
                    </div>

                    {(qrItems.length > 0 || qrCustomerName) && (
                      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 mb-5">
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Message preview</div>
                        <div className="bg-green-500 rounded-[14px_14px_4px_14px] px-3.5 py-2.5 inline-block max-w-full">
                          <div className="text-sm text-white leading-relaxed">{qrSmsBody}</div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setQrShowCode(true)}
                      className="w-full bg-[#d4a853] text-zinc-950 border-0 rounded-xl py-4 text-[17px] font-semibold tracking-tight">
                      Show QR Code →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE LAYOUT
      ══════════════════════════════════════════════════════════════════ */}
      {!isDesktop && (
        <>
          {/* Mobile header */}
          <div className="sticky top-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800"
            style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex justify-between items-center px-4 pt-3.5 pb-2.5">
              <div>
                <div className="text-[30px] text-[#d4a853] tracking-tight leading-none" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  Follow-Up
                </div>
                {myInfo.name && (
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{myInfo.name}</div>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <button data-testid="qr-btn" onClick={shareCard}
                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-3.5 py-1.5 text-sm font-semibold text-[#d4a853]">
                  Share Card
                </button>
                <button data-testid="settings-btn" onClick={() => setShowMyInfo(true)}
                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full w-9 h-9 text-base flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                  ⚙️
                </button>
              </div>
            </div>
            {/* Stats chips */}
            <div className="flex gap-2 px-4 pb-3.5 overflow-x-auto">
              {STAT_META.map(s => (
                <button key={s.f} onClick={() => setFilter(filter === s.f ? "all" : s.f)}
                  className={cn(
                    "shrink-0 border rounded-full px-3.5 py-1.5 flex items-center gap-1.5",
                    filter === s.f ? s.activeCls : s.inactiveCls
                  )}>
                  <div className="text-[15px] font-bold">{s.val}</div>
                  <span className="text-xs font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {Banners}

          {/* Mobile content */}
          <div style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 74px)",
            maxWidth: 480,
            margin: "0 auto",
          }}>
            {/* ── Dashboard ─────────────────────────────────────────── */}
            {view === "dashboard" && (
              <div className="px-4 pt-4">
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 mb-3" />
                {filter !== "all" && (
                  <div className="flex justify-between items-center mb-2.5">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Filtered: <span className="text-[#d4a853]">{filter.replace("_", " ")}</span>
                    </div>
                    <button onClick={() => setFilter("all")}
                      className="bg-transparent border-0 text-zinc-400 dark:text-zinc-500 text-xs">
                      Clear ×
                    </button>
                  </div>
                )}
                {filtered.length === 0 && (
                  <div className="text-center text-zinc-400 dark:text-zinc-500 mt-16">
                    <div className="text-5xl mb-3">🛋️</div>
                    <div className="text-base font-medium text-zinc-500 dark:text-zinc-400">No contacts yet</div>
                    <div className="text-sm mt-1">Add your first customer below</div>
                  </div>
                )}
                {filtered.map(c => ContactCard(c))}
                {contacts.filter(c => c.done).length > 0 && (
                  <div className="text-center mt-3 mb-2">
                    <button onClick={() => setFilter("done")}
                      className="bg-transparent border-0 text-zinc-400 dark:text-zinc-500 text-xs">
                      View {contacts.filter(c => c.done).length} completed →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Add / Edit ─────────────────────────────────────────── */}
            {view === "add" && (
              <div className="px-4 py-4">
                <div className="text-[28px] font-bold text-zinc-900 dark:text-zinc-100 mb-5 tracking-tight">
                  {editId ? "Edit Contact" : "New Customer"}
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-4">
                  {[["name","Customer Name","text","Full name"],["phone","Phone Number","tel","Mobile number"]].map(([k, label, type, placeholder], i) => (
                    <div key={k}>
                      {i > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />}
                      <div className="flex items-center px-4">
                        <div className="text-base text-zinc-500 dark:text-zinc-400 w-[110px] shrink-0 py-3.5">{label}</div>
                        <input data-testid={`input-${k}`} type={type} value={form[k]} placeholder={placeholder}
                          onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                          className="flex-1 bg-transparent border-0 outline-none py-3.5 text-zinc-900 dark:text-zinc-100 text-base text-right placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                      </div>
                    </div>
                  ))}
                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />
                  <div className="flex items-center px-4">
                    <div className="text-base text-zinc-500 dark:text-zinc-400 w-[110px] shrink-0 py-3.5">Interested In</div>
                    <select data-testid="select-interest" value={form.interest}
                      onChange={e => setForm(f => ({ ...f, interest: e.target.value }))}
                      className="flex-1 bg-transparent border-0 outline-none py-3.5 text-zinc-900 dark:text-zinc-100 text-base text-right">
                      <option value="">Select…</option>
                      {categories.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-4">
                  <textarea data-testid="textarea-notes" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    placeholder="Budget, style preference, timeline…"
                    className="w-full bg-transparent border-0 outline-none px-4 py-3.5 text-zinc-900 dark:text-zinc-100 text-base resize-none leading-relaxed placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                </div>

                <div className="mb-2">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5 px-1">Follow Up In</div>
                  <div className="flex gap-2">
                    {FOLLOW_UP_INTERVALS.map(i => (
                      <button key={i.days} onClick={() => setForm(f => ({ ...f, followUpDays: i.days }))}
                        className={cn(
                          "flex-1 border-0 rounded-xl py-2.5 text-sm",
                          form.followUpDays === i.days
                            ? "bg-[#d4a853] text-zinc-950 font-bold"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-normal"
                        )}>
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-green-500/10 rounded-xl px-3.5 py-2.5 my-4 text-sm text-green-600 dark:text-green-400 leading-relaxed">
                  🔒 In-person verbal consent logged · {new Date().toLocaleDateString()}
                </div>

                <button onClick={saveContact}
                  className="w-full bg-[#d4a853] text-zinc-950 border-0 rounded-xl py-4 text-[17px] font-semibold mb-3 tracking-tight">
                  {editId ? "Save Changes" : "Add Customer"}
                </button>
                <button onClick={() => { setView("dashboard"); setEditId(null); setForm({ name: "", phone: "", interest: "", notes: "", followUpDays: 7 }); }}
                  className="w-full bg-transparent text-zinc-500 dark:text-zinc-400 border-0 rounded-xl py-3.5 text-[17px]">
                  Cancel
                </button>
              </div>
            )}

            {/* ── Lookup ────────────────────────────────────────────── */}
            {view === "lookup" && (
              <div className="px-4 py-5">
                <div className="text-[22px] text-[#d4a853] mb-1.5" style={{ fontFamily: "'DM Serif Display', serif" }}>Furniture Lookup</div>
                <div className="text-sm text-zinc-400 dark:text-zinc-500 mb-5">Ask anything about furniture — specs, styles, materials, care tips.</div>
                <div className="flex gap-2 mb-3">
                  <input ref={lookupInputRef} value={lookupQuery}
                    onChange={e => setLookupQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && runLookup()}
                    placeholder="e.g. What's eight-way hand-tied?"
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                  <button onClick={() => runLookup()} disabled={lookupLoading || !lookupQuery.trim()}
                    className={cn(
                      "border-0 rounded-xl px-5 text-xl font-bold",
                      lookupLoading || !lookupQuery.trim()
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                        : "bg-[#d4a853] text-zinc-950"
                    )}>
                    {lookupLoading ? "…" : "→"}
                  </button>
                </div>
                {!lookupAnswer && !lookupLoading && (
                  <div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Try asking</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "What's the difference between memory foam and hybrid?",
                        "How to clean microfiber sofa?",
                        "What size rug for a 12x14 living room?",
                        "Solid wood vs engineered wood pros and cons",
                        "What's a good sofa frame to look for?",
                      ].map(q => (
                        <button key={q} onClick={() => { setLookupQuery(q); runLookup(q); }}
                          className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-3 py-1.5 text-zinc-500 dark:text-zinc-400 text-xs text-left">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {lookupLoading && (
                  <div className="text-center text-zinc-400 dark:text-zinc-500 mt-10">
                    <div className="text-3xl mb-2">✨</div>
                    <div className="text-sm">Looking that up…</div>
                  </div>
                )}
                {lookupAnswer && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mt-1">
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">Answer</div>
                    <div className="text-sm text-zinc-900 dark:text-zinc-100 leading-7 whitespace-pre-wrap">{lookupAnswer}</div>
                    <button onClick={() => { setLookupAnswer(null); setLookupQuery(""); lookupInputRef.current?.focus(); }}
                      className="mt-3.5 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-1.5 text-zinc-500 dark:text-zinc-400 text-xs">
                      Ask another
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Customer Interest QR ──────────────────────────────── */}
            {view === "qr" && (
              <div className="px-4 py-4">
                {!myInfo.phone ? (
                  <div className="text-center py-10 px-5">
                    <div className="text-5xl mb-3.5">📵</div>
                    <div className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Add your phone number first</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
                      Customers need your number to text you. Add it in Settings.
                    </div>
                    <button onClick={() => setShowMyInfo(true)}
                      className="bg-[#d4a853] text-zinc-950 border-0 rounded-xl px-7 py-3.5 text-[15px] font-semibold">
                      Open Settings
                    </button>
                  </div>
                ) : qrShowCode ? (
                  /* ── Step 2: Show QR to customer ── */
                  <div className="flex flex-col items-center">
                    <div className="text-center mb-3">
                      <div className="text-[22px] text-[#d4a853]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                        Scan or Photograph
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {qrCustomerName ? `For ${qrCustomerName} — ` : ""}Scan to text, or photo for later
                      </div>
                    </div>
                    <div className="bg-white rounded-3xl p-5 shadow-xl mb-4">
                      {smsQrUrl ? (
                        <img src={smsQrUrl} alt="Scan to text me"
                          className="w-[260px] h-[260px] block rounded-lg" />
                      ) : (
                        <div className="w-[260px] h-[260px] flex items-center justify-center text-zinc-400 text-sm">
                          Generating…
                        </div>
                      )}
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 max-w-[320px] w-full mb-2">
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Message they'll send you</div>
                      <div className="bg-green-500 rounded-[14px_14px_4px_14px] px-3.5 py-2.5 inline-block max-w-full">
                        <div className="text-sm text-white leading-relaxed">{qrSmsBody}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center mb-5">
                      Texts sent to {myInfo.phone}
                    </div>
                    <button onClick={() => setQrShowCode(false)}
                      className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-0 rounded-xl px-7 py-3 text-base font-medium">
                      ← Edit Info
                    </button>
                  </div>
                ) : (
                  /* ── Step 1: Fill in customer info ── */
                  <div>
                    <div className="text-[22px] text-[#d4a853] mb-0.5" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      Customer Interest Card
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
                      Note what they're looking at, then show them the QR
                    </div>

                    {/* Customer name */}
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-1">Customer Name</div>
                    <input
                      value={qrCustomerName}
                      onChange={e => setQrCustomerName(e.target.value)}
                      placeholder="Their first name (optional)…"
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 mb-4"
                      style={{ caretColor: "#d4a853" }}
                    />

                    {/* Selected items */}
                    {qrItems.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {qrItems.map(item => (
                          <span key={item}
                            className="bg-[#d4a853] text-zinc-950 rounded-full px-3 py-1.5 text-sm font-medium flex items-center gap-1.5">
                            {item}
                            <button
                              onClick={() => setQrItems(prev => prev.filter(i => i !== item))}
                              className="text-zinc-950/60 border-0 bg-transparent p-0 leading-none text-xs font-bold">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Category chips */}
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-1">What they're looking at</div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {categories.map(cat => (
                        <button key={cat}
                          onClick={() => setQrItems(prev =>
                            prev.includes(cat) ? prev.filter(i => i !== cat) : [...prev, cat]
                          )}
                          className={cn(
                            "border rounded-full px-3 py-1.5 text-xs font-medium",
                            qrItems.includes(cat)
                              ? "bg-[#d4a853] text-zinc-950 border-[#d4a853]"
                              : "bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700"
                          )}>
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Custom item input */}
                    <div className="flex gap-2 mb-5">
                      <input
                        value={qrNewItem}
                        onChange={e => setQrNewItem(e.target.value)}
                        onKeyDown={e => {
                          const v = qrNewItem.trim();
                          if (e.key === "Enter" && v && !qrItems.includes(v)) {
                            setQrItems(prev => [...prev, v]);
                            setQrNewItem("");
                          }
                        }}
                        placeholder="Other item…"
                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        style={{ caretColor: "#d4a853" }}
                      />
                      <button
                        onClick={() => {
                          const v = qrNewItem.trim();
                          if (v && !qrItems.includes(v)) { setQrItems(prev => [...prev, v]); setQrNewItem(""); }
                        }}
                        disabled={!qrNewItem.trim()}
                        className="bg-[#d4a853] text-zinc-950 border-0 rounded-xl px-4 text-sm font-semibold disabled:opacity-40">
                        Add
                      </button>
                    </div>

                    {/* Message preview */}
                    {(qrItems.length > 0 || qrCustomerName) && (
                      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 mb-5">
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Message preview</div>
                        <div className="bg-green-500 rounded-[14px_14px_4px_14px] px-3.5 py-2.5 inline-block max-w-full">
                          <div className="text-sm text-white leading-relaxed">{qrSmsBody}</div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setQrShowCode(true)}
                      className="w-full bg-[#d4a853] text-zinc-950 border-0 rounded-xl py-4 text-[17px] font-semibold tracking-tight">
                      Show QR Code →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Bottom tab bar ────────────────────────────────────────── */}
          <nav className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 flex z-50"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {[
              { icon: "👥", label: "Contacts", onClick: () => setView("dashboard"),                              active: view === "dashboard" },
              { icon: "🔳", label: "Get #",    onClick: () => navTo("qr"),                                      active: view === "qr" },
              { icon: "＋", label: "Add",       onClick: () => navTo("add"),                                     active: view === "add", ariaLabel: "+" },
              { icon: "🔔", label: overdue > 0 ? `${overdue}` : "Alerts", onClick: () => { setFilter("overdue"); setView("dashboard"); }, active: filter === "overdue" && view === "dashboard", urgent: overdue > 0 },
              { icon: "🔍", label: "Lookup",   onClick: () => setView("lookup"),                                 active: view === "lookup" },
            ].map(tab => (
              <button key={tab.label} onClick={tab.onClick} aria-label={tab.ariaLabel}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] border-0 bg-transparent",
                  tab.active
                    ? "text-[#d4a853] font-bold"
                    : tab.urgent
                      ? "text-red-500 font-normal"
                      : "text-zinc-400 dark:text-zinc-500 font-normal"
                )}>
                <span className="text-[22px] leading-none">{tab.icon}</span>
                <span className={cn("tracking-tight", tab.urgent ? "text-[11px]" : "text-[10px]")}>{tab.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
