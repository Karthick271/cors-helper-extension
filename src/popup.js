const $ = (s)=>document.querySelector(s);
const masterToggle = $("#masterToggle");
const switchLabel  = $("#switchLabel");

const e10 = $("#enable10");
const e30 = $("#enable30");
const e120 = $("#enable120");
const eInf = $("#enableInf");

const statusEl = $("#status");
const logsEl = $("#logs");
const profileSel = $("#profile");
const addProfileBtn = $("#addProfile");
const allowTabBtn = $("#allowTab");
const openOptions = $("#openOptions");
const clearLogsBtn = $("#clearLogs");
const chip = $("#chip");

// Profile modal helpers
const modal = $("#profileModal");
const nameInput = $("#profileNameInput");
const saveProfileBtn = $("#saveProfile");
const cancelProfileBtn = $("#cancelProfile");

function openProfileModal(){
  modal.classList.add("show");
  nameInput.value = "";
  setTimeout(()=> nameInput.focus(), 0);
}
function closeProfileModal(){ modal.classList.remove("show"); }

cancelProfileBtn.addEventListener("click", closeProfileModal);
modal.addEventListener("click", (e)=>{ if(e.target === modal) closeProfileModal(); });
nameInput.addEventListener("keydown", (e)=>{ if(e.key === "Escape") closeProfileModal(); if(e.key === "Enter") saveProfileBtn.click(); });
saveProfileBtn.addEventListener("click", async ()=>{
  const name = (nameInput.value || "").trim();
  if(!name) return;
  const st = await chrome.runtime.sendMessage({ type:"GET_STATE" });
  const profiles = st.profiles || {};
  if(!profiles[name]) profiles[name] = { allowlist: [] };
  await chrome.runtime.sendMessage({ type: "SAVE_PROFILES", profiles, activeProfile: name });
  closeProfileModal();
  await refresh();
});


function statusDot(status){
  if (status>=200 && status<300) return '<span class="dot ok"></span>';
  if (status>=500) return '<span class="dot err"></span>';
  if (status>=400) return '<span class="dot warn"></span>';
  return '<span class="dot info"></span>';
}

function setChip(enabled, mode, mins){
  chip.classList.remove("off","on-allow","on-global");
  if (!enabled) { chip.classList.add("off"); chip.textContent = "OFF"; return; }
  const cls = (mode === "allowlist") ? "on-allow" : "on-global";
  chip.classList.add(cls);
  chip.textContent = mins ? `ON • ${mode} • ${mins}m` : `ON • ${mode}`;
}

async function refresh(){
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const { enabled, expiry_ts, profiles = {}, activeProfile, logs = [] } = state;
  const list = (profiles?.[activeProfile]?.allowlist) || [];
  const mode = list.length ? "allowlist" : "global";
  const ttl = expiry_ts ? Math.max(0, expiry_ts - Date.now()) : 0;
  const mins = ttl ? Math.ceil(ttl/60000) : 0;

  masterToggle.checked = enabled;
  masterToggle.setAttribute("aria-checked", String(enabled));
  switchLabel.textContent = enabled ? "Enabled" : "Disabled";
  setChip(enabled, mode, mins);

  statusEl.textContent = enabled
    ? (ttl ? `Enabled — auto-off in ~${mins} min — Profile: ${activeProfile}` : `Enabled — Profile: ${activeProfile}`)
    : `Disabled — Profile: ${activeProfile}`;

  profileSel.innerHTML = Object.keys(profiles).map(name => `<option ${name===activeProfile?'selected':''}>${name}</option>`).join("");

  logsEl.innerHTML = (logs.slice(0,15)).map(l => {
    const sdot = statusDot(l.status||0);
    const hint = l.hint ? ` <span class="muted">• ${l.hint}</span>` : "";
    const time = new Date(l.ts).toLocaleTimeString();
    return `<div class="log">${sdot}<b>${l.method||""}</b> ${l.url}<br/>
      <span class="muted">rule=${l.ruleId} • ${time} • ${l.resourceType||""} ${l.status?("• "+l.status):""}${hint}</span>
    </div>`;
  }).join("");
}

// Master switch handlers
masterToggle.addEventListener("change", async () => {
  const on = masterToggle.checked;
  if (on) {
    await chrome.runtime.sendMessage({ type:"SET_ENABLED", enabled:true, durationMinutes:0 });
  } else {
    await chrome.runtime.sendMessage({ type:"SET_ENABLED", enabled:false });
  }
  await refresh();
});

// Quick timers
e10.addEventListener("click", async ()=>{ await chrome.runtime.sendMessage({ type:"SET_ENABLED", enabled:true, durationMinutes:10 }); await refresh(); });
e30.addEventListener("click", async ()=>{ await chrome.runtime.sendMessage({ type:"SET_ENABLED", enabled:true, durationMinutes:30 }); await refresh(); });
e120.addEventListener("click", async ()=>{ await chrome.runtime.sendMessage({ type:"SET_ENABLED", enabled:true, durationMinutes:120 }); await refresh(); });
eInf.addEventListener("click", async ()=>{ await chrome.runtime.sendMessage({ type:"SET_ENABLED", enabled:true, durationMinutes:0, forceInfinite:true }); await refresh(); });

// Profiles
profileSel.addEventListener("change", async ()=>{
  const name = profileSel.value;
  await chrome.runtime.sendMessage({ type: "SET_PROFILE", name });
  await refresh();
});
addProfileBtn.addEventListener("click", openProfileModal);
allowTabBtn.addEventListener("click", async ()=>{
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if(!tab?.url) return;
  const u = new URL(tab.url);
  const host = u.hostname;
  const st = await chrome.runtime.sendMessage({ type:"GET_STATE" });
  const profiles = st.profiles || {};
  const active = st.activeProfile;
  if(!profiles[active]) profiles[active] = { allowlist: [] };
  if(!profiles[active].allowlist.includes(host)) profiles[active].allowlist.push(host);
  await chrome.runtime.sendMessage({ type: "SAVE_PROFILES", profiles, activeProfile: active });
  await refresh();
});

openOptions.addEventListener("click", ()=> chrome.runtime.openOptionsPage());
clearLogsBtn.addEventListener("click", async ()=>{
  await chrome.runtime.sendMessage({ type: "CLEAR_LOGS" });
  await refresh();
});

refresh();