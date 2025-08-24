const PRESETS = ["localhost:3000","localhost:5173","127.0.0.1:8000","api.local.test"];

const wizard = document.getElementById("wizard");
const modeSel = document.getElementById("modeSel");
const finishBtn = document.getElementById("finish");
const wizardDomain = document.getElementById("domain");
const defaultTimer = document.getElementById("defaultTimer");

const profileSel = document.getElementById("profile");
const newProfileBtn = document.getElementById("newProfile");
const delProfileBtn = document.getElementById("delProfile");
const addDomain = document.getElementById("addDomain");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("list");
const clearBtn = document.getElementById("clear");
const exportBtn = document.getElementById("export");
const importFile = document.getElementById("importFile");
const importBtn = document.getElementById("importBtn");
const presetRow = document.getElementById("presetRow");
const presetRow2 = document.getElementById("presetRow2");

const testUrl = document.getElementById("testUrl");
const methodSel = document.getElementById("method");
const addHeader = document.getElementById("addHeader");
const out = document.getElementById("out");

function presetButtons(container){
  container.innerHTML = PRESETS.map(p=>`<button class="ghost preset" data-v="${p}">+ ${p}</button>`).join(" ");
  container.querySelectorAll(".preset").forEach(b => {
    b.addEventListener("click", async ()=>{
      const st = await getState();
      const profiles = st.profiles || {};
      const cur = st.activeProfile;
      if(!profiles[cur]) profiles[cur] = { allowlist: [] };
      const v = b.dataset.v;
      if(!profiles[cur].allowlist.includes(v)) profiles[cur].allowlist.push(v);
      await saveProfiles(profiles, cur);
      load();
    });
  });
}

async function getState(){ return await chrome.runtime.sendMessage({ type:"GET_STATE" }); }
async function saveProfiles(profiles, activeProfile){
  await chrome.runtime.sendMessage({ type: "SAVE_PROFILES", profiles, activeProfile });
}
function renderProfiles(state){
  const { profiles={}, activeProfile } = state;
  profileSel.innerHTML = Object.keys(profiles).map(n => `<option ${n===activeProfile?'selected':''}>${n}</option>`).join("");
}
function renderAllowlist(state){
  const { profiles={}, activeProfile } = state;
  const listArr = (profiles[activeProfile] && profiles[activeProfile].allowlist) || [];
  list.innerHTML = "";
  listArr.forEach((d,idx)=>{
    const li = document.createElement("li");
    li.innerHTML = `<code>${d}</code> <button data-i="${idx}">Remove</button>`;
    li.querySelector("button").addEventListener("click", async ()=>{
      listArr.splice(idx,1);
      profiles[activeProfile].allowlist = listArr;
      await saveProfiles(profiles, activeProfile);
      load();
    });
    list.appendChild(li);
  });
}

async function load(){
  const st = await getState();
  renderProfiles(st);
  renderAllowlist(st);
  if (!st.seen_onboarding) {
    wizard.style.display = "block";
  } else {
    wizard.style.display = "none";
  }
}

finishBtn?.addEventListener("click", async ()=>{
  const st = await getState();
  const profiles = st.profiles || {};
  const cur = st.activeProfile;
  profiles[cur] ||= { allowlist: [] };
  if (modeSel.value === "allowlist") {
    // nothing special; encourage adding domains
  } else {
    // global mode: leave allowlist empty; enabling will use timer by default
  }
  const v = wizardDomain.value.trim();
  if (v) profiles[cur].allowlist.push(v);
  await saveProfiles(profiles, cur);
  await chrome.runtime.sendMessage({ type:"SEEN_ONBOARDING" });
  // Save default timer as a hint by writing to sync; popup uses 10m default already for global
  await chrome.storage.sync.set({ default_timer_minutes: Number(defaultTimer.value) });
  wizard.style.display = "none";
  load();
});

profileSel.addEventListener("change", async ()=>{
  await chrome.runtime.sendMessage({ type:"SET_PROFILE", name: profileSel.value });
  load();
});
newProfileBtn.addEventListener("click", async ()=>{
  const name = prompt("Profile name:");
  if(!name) return;
  const st = await getState();
  const profiles = st.profiles || {};
  if(!profiles[name]) profiles[name] = { allowlist: [] };
  await saveProfiles(profiles, name);
  load();
});
delProfileBtn.addEventListener("click", async ()=>{
  const st = await getState();
  const profiles = st.profiles || {};
  const cur = st.activeProfile;
  if (cur === "default") return alert("Cannot delete the default profile.");
  delete profiles[cur];
  await saveProfiles(profiles, "default");
  load();
});

addBtn.addEventListener("click", async ()=>{
  const st = await getState();
  const profiles = st.profiles || {};
  const cur = st.activeProfile;
  profiles[cur] ||= { allowlist: [] };
  const v = wizardDomain.value.trim();
  if (v && !profiles[cur].allowlist.includes(v)) profiles[cur].allowlist.push(v);
  await saveProfiles(profiles, cur);
  wizardDomain.value = "";
  load();
});



document.getElementById("addBtn").addEventListener("click", async ()=>{
  const v = addDomain.value.trim(); if(!v) return;
  const st = await getState();
  const profiles = st.profiles || {};
  const cur = st.activeProfile;
  profiles[cur] ||= { allowlist: [] };
  if (!profiles[cur].allowlist.includes(v)) profiles[cur].allowlist.push(v);
  await saveProfiles(profiles, cur);
  addDomain.value = "";
  load();
});

clearBtn.addEventListener("click", async ()=>{
  const st = await getState();
  const profiles = st.profiles || {};
  const cur = st.activeProfile;
  profiles[cur] = { allowlist: [] };
  await saveProfiles(profiles, cur);
  load();
});

exportBtn.addEventListener("click", async ()=>{
  const st = await getState();
  const data = { version: 2, activeProfile: st.activeProfile, profiles: st.profiles };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "cors-helper-pro-profiles.json"; a.click();
  URL.revokeObjectURL(url);
});
importBtn.addEventListener("click", async ()=>{
  const file = importFile.files[0]; if(!file) return;
  try{
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!obj.profiles) throw new Error("Invalid file");
    await saveProfiles(obj.profiles, obj.activeProfile || "default");
    alert("Imported profiles.");
    load();
  }catch(e){ alert("Import failed: " + e.message); }
});

document.getElementById("runTest").addEventListener("click", async ()=>{
  const url = testUrl.value.trim(); const method = methodSel.value;
  if(!url) return;
  out.textContent = "Running fetch...\n";
  try{
    const opts = { method, headers: {} };
    if (addHeader.checked) opts.headers["X-Dummy"] = "1";
    const res = await fetch(url, opts);
    const text = await res.text();
    out.textContent += `Status: ${res.status}\n`;
    out.textContent += `ACAO: ${res.headers.get("access-control-allow-origin")}\n`;
    out.textContent += text.slice(0, 500) + (text.length>500?"\n...":"");
  }catch(e){
    out.textContent += "Error: " + e.message;
  }
});

presetButtons(presetRow);
presetButtons(presetRow2);
load();