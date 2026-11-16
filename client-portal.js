// Tenshi Systems Engineering client portal.
// Configure with the Supabase Project URL and anon/publishable key.
// Never place a Supabase service_role key in browser code.
const SUPABASE_URL = "https://wzzkpwxjzrfdzqknmrzw.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_bCv6XRdMlVVtHAkMJu3HAw_oz43M5Iu";
const STORAGE_BUCKET = "client-portal-files";

const $ = (id) => document.getElementById(id);
const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let currentUser = null;
let currentProfile = null;
let projects = [];

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));
const say = (id, message, isError = false) => {
  const node = $(id);
  if (!node) return;
  node.textContent = message || "";
  node.classList.toggle("is-error", isError);
};
const dateText = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Not set";
const money = (amount, currency = "USD") => new Intl.NumberFormat(undefined, {style:"currency",currency}).format(Number(amount || 0));
const isAdmin = () => currentProfile?.role === "admin";

function setTab(tab) {
  document.querySelectorAll(".tp-nav [data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".tp-panel").forEach(panel => panel.classList.toggle("active", panel.id === `panel-${tab}`));
  const titles = {overview:"Overview",projects:"Projects",files:"Files",requests:"Requests",messages:"Messages",invoices:"Invoices",admin:"Administration"};
  $("page-heading").textContent = titles[tab] || "Overview";
}
document.querySelectorAll(".tp-nav [data-tab], [data-tab].tp-inline-link").forEach(button => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

async function showSession(session) {
  currentUser = session?.user || null;
  $("auth-view").classList.toggle("hidden", !!currentUser);
  $("workspace").classList.toggle("hidden", !currentUser);
  $("sign-out").classList.toggle("hidden", !currentUser);
  if (!currentUser) return;
  $("user-email").textContent = currentUser.email || "Client";
  $("user-avatar").textContent = (currentUser.email || "T").slice(0,1).toUpperCase();
  try {
    await loadWorkspace();
  } catch (error) {
    console.error(error);
    say("auth-message", error.message || "We couldn't load your account. Please contact support.", true);
  }
}

async function loadWorkspace() {
  const {data: profile, error: profileError} = await db.from("portal_profiles").select("*").eq("id", currentUser.id).single();
  if (profileError) throw profileError;
  currentProfile = profile;
  $("sidebar-name").textContent = profile.full_name || profile.company || currentUser.email || "Client account";
  $("welcome-heading").textContent = `Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.`;
  $("admin-nav").classList.toggle("hidden", !isAdmin());

  const projectQuery = db.from("portal_projects").select("*").order("updated_at", {ascending:false});
  const [{data: projectData,error:projectError},{data:requestData,error:requestError},{data:invoiceData,error:invoiceError}] = await Promise.all([
    projectQuery,
    db.from("portal_requests").select("id,status").order("created_at",{ascending:false}),
    db.from("portal_invoices").select("id,status").order("created_at",{ascending:false})
  ]);
  if (projectError || requestError || invoiceError) throw projectError || requestError || invoiceError;
  projects = projectData || [];
  const openRequests = (requestData || []).filter(x => !["completed","closed"].includes((x.status || "").toLowerCase()));
  const unpaid = (invoiceData || []).filter(x => !["paid","void"].includes((x.status || "").toLowerCase()));
  $("stat-projects").textContent = projects.filter(p => p.status !== "Completed").length;
  $("stat-requests").textContent = openRequests.length;
  $("stat-invoices").textContent = unpaid.length;
  $("today").textContent = new Intl.DateTimeFormat(undefined,{dateStyle:"long"}).format(new Date());

  fillProjectSelects();
  renderProjects();
  await Promise.all([loadUpdates(),loadFiles(),loadRequests(),loadInvoices()]);
  await loadMessages();
  if (isAdmin()) await loadAdmin();
}

function fillSelect(id, items, emptyText = "Choose a project") {
  const select = $(id);
  if (!select) return;
  const old = select.value;
  select.innerHTML = `<option value="">${escapeHTML(emptyText)}</option>` + items.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join("");
  if (items.some(x => x.id === old)) select.value = old;
}
function fillProjectSelects() {
  ["upload-project","request-project","message-project","admin-update-project"].forEach(id => fillSelect(id,projects));
}
function projectCard(p) {
  const progress = Math.max(0,Math.min(100,Number(p.progress)||0));
  return `<article class="tp-project-card">
    <div class="tp-project-head"><div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description || "Your Tenshi Systems project.")}</p></div><span class="tp-badge">${escapeHTML(p.status || "In progress")}</span></div>
    <div class="tp-progress-meta"><span>Project progress</span><strong>${progress}%</strong></div>
    <div class="tp-progress-track"><div class="tp-progress-fill" style="width:${progress}%"></div></div>
    <p style="margin-top:13px">Next milestone: ${escapeHTML(p.next_milestone || "To be confirmed")} · ${escapeHTML(dateText(p.target_date))}</p>
  </article>`;
}
function renderProjects() {
  const active = projects.filter(p => p.status !== "Completed");
  $("overview-projects").innerHTML = active.length ? active.slice(0,4).map(projectCard).join("") : '<div class="tp-empty">No active projects yet. Your team will add them here.</div>';
  $("all-projects").innerHTML = projects.length ? projects.map(projectCard).join("") : '<div class="tp-empty">No projects have been assigned to this account yet.</div>';
}

async function loadUpdates() {
  let query = db.from("portal_updates").select("id,project_id,title,body,created_at,portal_projects(name)").order("created_at",{ascending:false}).limit(8);
  const {data,error} = await query;
  if (error) throw error;
  $("recent-updates").innerHTML = data?.length ? data.map(u => `<div class="tp-list-row"><div><strong>${escapeHTML(u.title)}</strong><small>${escapeHTML(u.portal_projects?.name || "Project")} · ${new Date(u.created_at).toLocaleDateString()} · ${escapeHTML(u.body || "")}</small></div></div>`).join("") : '<div class="tp-empty">No project updates yet.</div>';
}
async function loadFiles() {
  const {data,error} = await db.from("portal_files").select("*").order("created_at",{ascending:false});
  if (error) throw error;
  $("file-list").innerHTML = data?.length ? data.map(f => `<div class="tp-list-row"><div><strong>${escapeHTML(f.file_name)}</strong><small>${escapeHTML(projects.find(p=>p.id===f.project_id)?.name || "Shared file")} · ${new Date(f.created_at).toLocaleDateString()}</small></div><button type="button" data-download="${escapeHTML(f.storage_path)}">Download ↓</button></div>`).join("") : '<div class="tp-empty">No shared files yet.</div>';
  $("file-list").querySelectorAll("[data-download]").forEach(button => button.addEventListener("click", async () => {
    const {data,error} = await db.storage.from(STORAGE_BUCKET).createSignedUrl(button.dataset.download,60);
    if (error) return alert(error.message);
    window.open(data.signedUrl,"_blank","noopener");
  }));
}
async function loadRequests() {
  const {data,error} = await db.from("portal_requests").select("*,portal_projects(name)").order("created_at",{ascending:false});
  if (error) throw error;
  $("request-list").innerHTML = data?.length ? data.map(r => `<div class="tp-list-row"><div><strong>${escapeHTML(r.request_type)}</strong><small>${escapeHTML(r.portal_projects?.name || "Project")} · ${new Date(r.created_at).toLocaleDateString()} · ${escapeHTML(r.details)}</small></div><span class="tp-badge">${escapeHTML(r.status)}</span></div>`).join("") : '<div class="tp-empty">No requests yet.</div>';
}
async function loadInvoices() {
  const {data,error} = await db.from("portal_invoices").select("*").order("created_at",{ascending:false});
  if (error) throw error;
  $("invoice-list").innerHTML = data?.length ? data.map(i => `<div class="tp-list-row"><div><strong>${escapeHTML(i.invoice_number || "Invoice")} · ${money(i.amount,i.currency)}</strong><small>Due ${escapeHTML(dateText(i.due_date))} · ${escapeHTML(i.description || "")}</small></div><div style="text-align:right"><span class="tp-badge">${escapeHTML(i.status)}</span>${i.payment_url && i.status !== "Paid" ? `<br><a href="${escapeHTML(i.payment_url)}" target="_blank" rel="noopener">Pay invoice →</a>` : ""}</div></div>`).join("") : '<div class="tp-empty">No invoices have been issued to this account.</div>';
}
async function loadMessages() {
  const projectId = $("message-project").value || projects[0]?.id;
  if (!projectId) {
    $("message-list").innerHTML = '<div class="tp-empty">A project is needed before messages can be exchanged.</div>';
    return;
  }
  if (!$("message-project").value) $("message-project").value = projectId;
  const {data,error} = await db.from("portal_messages").select("*").eq("project_id",projectId).order("created_at",{ascending:true});
  if (error) throw error;
  $("message-list").innerHTML = data?.length ? data.map(m => `<article class="tp-chat-message ${m.sender_id===currentUser.id?"mine":""}"><small>${m.sender_id===currentUser.id?"You":"Tenshi Systems"} · ${new Date(m.created_at).toLocaleString()}</small><p>${escapeHTML(m.body)}</p></article>`).join("") : '<div class="tp-empty">No messages yet. Start the conversation below.</div>';
}
async function loadAdmin() {
  const [{data:clients,error:clientError},{data:allProjects,error:projectError}] = await Promise.all([
    db.from("portal_profiles").select("id,full_name,company").order("full_name"),
    db.from("portal_projects").select("*,portal_profiles(full_name,company)").order("updated_at",{ascending:false})
  ]);
  if (clientError || projectError) throw clientError || projectError;
  $("admin-client").innerHTML = '<option value="">Choose a client</option>' + (clients||[]).filter(c=>c.id!==currentUser.id || c.role!=="admin").map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.full_name || c.company || c.id)}</option>`).join("");
  $("admin-project-list").innerHTML = allProjects?.length ? allProjects.map(p=>`<div class="tp-list-row"><div><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.portal_profiles?.full_name || p.portal_profiles?.company || "Client")} · ${escapeHTML(p.status)} · ${Number(p.progress)||0}%</small></div></div>`).join("") : '<div class="tp-empty">No projects yet.</div>';
  fillSelect("admin-update-project",allProjects || []);
}

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!db) return say("auth-message","Setup needed: add your Supabase URL and anon key in client-portal.js.",true);
  say("auth-message","Signing in…");
  const {error} = await db.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});
  if (error) say("auth-message",error.message,true);
});
$("forgot-password").addEventListener("click",async()=>{
  if (!db) return say("auth-message","Connect Supabase first.",true);
  const email=$("login-email").value.trim();
  if(!email) return say("auth-message","Enter your email address first.",true);
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  say("auth-message",error?.message || "If the account exists, a password reset email has been sent.",!!error);
});
$("sign-out").addEventListener("click",async()=>{if(db) await db.auth.signOut();});
$("upload-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const projectId=$("upload-project").value, file=$("upload-file").files[0];
  if(!projectId || !file) return;
  const project=projects.find(p=>p.id===projectId);
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${project.client_id}/${projectId}/${Date.now()}_${safeName}`;
  say("upload-message","Uploading…");
  const {error:uploadError}=await db.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false});
  if(uploadError) return say("upload-message",uploadError.message,true);
  const {error:recordError}=await db.from("portal_files").insert({client_id:project.client_id,project_id:projectId,file_name:file.name,storage_path:path,uploaded_by:currentUser.id});
  if(recordError){await db.storage.from(STORAGE_BUCKET).remove([path]);return say("upload-message",recordError.message,true);}
  $("upload-file").value="";
  say("upload-message","File uploaded securely.");
  await loadFiles();
});
$("request-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const {error}=await db.from("portal_requests").insert({client_id:currentUser.id,project_id:$("request-project").value,request_type:$("request-type").value,details:$("request-details").value.trim()});
  if(error) return say("request-message",error.message,true);
  $("request-details").value="";say("request-message","Your request has been sent.");await loadRequests();
});
$("message-project").addEventListener("change",loadMessages);
$("message-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const body=$("message-body").value.trim(),projectId=$("message-project").value;
  if(!body || !projectId) return;
  const {error}=await db.from("portal_messages").insert({project_id:projectId,sender_id:currentUser.id,body});
  if(error) return say("message-status",error.message,true);
  $("message-body").value="";say("message-status","Message sent.");await loadMessages();
});
$("admin-progress").addEventListener("input",()=>{$("progress-output").textContent=$("admin-progress").value+"%";});
$("admin-project-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const {error}=await db.from("portal_projects").insert({client_id:$("admin-client").value,name:$("admin-project-name").value.trim(),description:$("admin-project-description").value.trim(),target_date:$("admin-project-date").value || null});
  if(error) return say("admin-project-message",error.message,true);
  $("admin-project-form").reset();say("admin-project-message","Project created.");await loadWorkspace();
});
$("admin-update-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const projectId=$("admin-update-project").value;
  const progress=Number($("admin-progress").value);
  const status=$("admin-status").value;
  const {error:updateError}=await db.from("portal_projects").update({progress,status,updated_at:new Date().toISOString()}).eq("id",projectId);
  if(updateError) return say("admin-update-message",updateError.message,true);
  const {error:postError}=await db.from("portal_updates").insert({project_id:projectId,title:$("admin-update-title").value.trim(),body:$("admin-update-body").value.trim()});
  if(postError) return say("admin-update-message",postError.message,true);
  $("admin-update-form").reset();$("admin-progress").value=25;$("progress-output").textContent="25%";
  say("admin-update-message","Project update published.");await loadWorkspace();
});

$("year").textContent=new Date().getFullYear();
if (!configured) say("auth-message","Portal setup is not complete yet. See README.md for the Supabase setup steps.",true);
else {
  db.auth.getSession().then(({data})=>showSession(data.session));
  db.auth.onAuthStateChange((_event,session)=>showSession(session));
}
