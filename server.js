
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3333);
const DB_PATH = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function nowISO(){ return new Date().toISOString(); }

function normalizeEmail(v){
  return String(v || '').trim().toLowerCase();
}
function isValidGmail(v){
  return /^[^\s@]+@gmail\.com$/i.test(String(v || '').trim());
}


function loadDB(){
  if (!fs.existsSync(DB_PATH)){
    fs.writeFileSync(DB_PATH, JSON.stringify({admin:{username:'admin', password:'admin123'}, members:[], licenses:[]}, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(db){
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function makeId(prefix='id'){
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function makeLicenseKey(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({length:4}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
  return `LIC-${part()}-${part()}-${part()}`;
}


function addDurationToDate(amount, unit){
  amount = Number(amount || 0);
  if (!amount || amount <= 0) return '';
  const d = new Date();
  if (unit === 'hours') d.setHours(d.getHours() + amount);
  else if (unit === 'days') d.setDate(d.getDate() + amount);
  else if (unit === 'months') d.setMonth(d.getMonth() + amount);
  else if (unit === 'years') d.setFullYear(d.getFullYear() + amount);
  else d.setDate(d.getDate() + amount);
  return d.toISOString();
}


function normalizeExpiryInput(value){
  value = String(value || '').trim();
  if (!value) return '';
  // YYYY-MM-DD -> local end of day for easier admin use.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value + 'T23:59:59').toISOString();
  }
  // datetime-local from input: YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !value.endsWith('Z')) {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return value;
}

function formatExpiryForUser(expiresAt){
  if (!expiresAt) return 'Never';
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return String(expiresAt);
  const remain = t - Date.now();
  const d = new Date(t);
  if (remain <= 0) return d.toLocaleString() + ' (Expired)';
  const hours = Math.ceil(remain / 3600000);
  if (hours < 48) return d.toLocaleString() + ` (${hours}h left)`;
  const days = Math.ceil(remain / 86400000);
  return d.toLocaleString() + ` (${days}d left)`;
}

function isExpired(license){
  if (!license.expiresAt) return false;
  const t = Date.parse(license.expiresAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() > t;
}

function findMember(db, memberId){
  return db.members.find(m => m.id === memberId) || null;
}

function requireAdmin(req, res, next){
  const token = req.headers['x-admin-token'] || req.query.token;
  const db = loadDB();
  const expected = Buffer.from(`${db.admin.username}:${db.admin.password}`).toString('base64');
  if (token !== expected) return res.status(401).json({ok:false, message:'Admin login required'});
  next();
}

app.post('/api/admin/login', (req, res) => {
  const db = loadDB();
  const { username, password } = req.body || {};
  if (username === db.admin.username && password === db.admin.password){
    return res.json({ ok:true, token: Buffer.from(`${username}:${password}`).toString('base64') });
  }
  return res.status(401).json({ ok:false, message:'Sai admin username/password' });
});

app.get('/api/admin/data', requireAdmin, (req, res) => {
  const db = loadDB();
  res.json({ ok:true, members: db.members, licenses: db.licenses });
});

app.post('/api/admin/member', requireAdmin, (req, res) => {
  const db = loadDB();
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  if (!isValidGmail(email)) {
    return res.status(400).json({ ok:false, message:'Admin phải nhập Gmail hợp lệ cho member, ví dụ: name@gmail.com' });
  }
  const member = {
    id: makeId('m'),
    name: String(body.name || 'New Member').trim(),
    email,
    note: String(body.note || '').trim(),
    createdAt: nowISO()
  };
  db.members.push(member);
  saveDB(db);
  res.json({ ok:true, member });
});

app.delete('/api/admin/member/:id', requireAdmin, (req, res) => {
  const db = loadDB();
  db.members = db.members.filter(m => m.id !== req.params.id);
  db.licenses = db.licenses.filter(l => l.memberId !== req.params.id);
  saveDB(db);
  res.json({ ok:true });
});

app.post('/api/admin/license', requireAdmin, (req, res) => {
  const db = loadDB();
  const body = req.body || {};
  const memberId = body.memberId;
  if (!db.members.some(m => m.id === memberId)) return res.status(400).json({ok:false, message:'Member không tồn tại'});
  let key = body.key ? String(body.key).trim().toUpperCase() : makeLicenseKey();
  if (db.licenses.some(l => l.key === key)) return res.status(400).json({ok:false, message:'License key đã tồn tại'});
  const expiresAt = normalizeExpiryInput(body.expiresAt || '') || addDurationToDate(body.durationAmount, body.durationUnit || 'days');
  const license = {
    key,
    memberId,
    status: body.status || 'active',
    maxDevices: Math.max(1, Number(body.maxDevices || 1)),
    devices: [],
    durationAmount: body.durationAmount ? Number(body.durationAmount) : 0,
    durationUnit: body.durationUnit || '',
    devicesResetAt: '',
    expiresAt,
    createdAt: nowISO()
  };
  db.licenses.push(license);
  saveDB(db);
  res.json({ ok:true, license });
});

app.patch('/api/admin/license/:key', requireAdmin, (req, res) => {
  const db = loadDB();
  const key = String(req.params.key || '').toUpperCase();
  const lic = db.licenses.find(l => l.key === key);
  if (!lic) return res.status(404).json({ok:false, message:'License không tồn tại'});
  const body = req.body || {};
  if (body.status) lic.status = body.status;
  if (body.maxDevices) lic.maxDevices = Math.max(1, Number(body.maxDevices));
  if ('expiresAt' in body) lic.expiresAt = normalizeExpiryInput(body.expiresAt || '');
  if ('durationAmount' in body) lic.durationAmount = Number(body.durationAmount || 0);
  if ('durationUnit' in body) lic.durationUnit = String(body.durationUnit || '');
  if (body.renewDuration) {
    lic.expiresAt = addDurationToDate(body.durationAmount || lic.durationAmount || 30, body.durationUnit || lic.durationUnit || 'days');
    lic.durationAmount = Number(body.durationAmount || lic.durationAmount || 30);
    lic.durationUnit = String(body.durationUnit || lic.durationUnit || 'days');
  }
  if (body.resetDevices) {
    lic.devices = [];
    lic.devicesResetAt = nowISO();
  }
  saveDB(db);
  res.json({ ok:true, license: lic });
});


app.patch('/api/admin/license-update', requireAdmin, (req, res) => {
  const db = loadDB();
  const body = req.body || {};
  const key = String(body.key || '').toUpperCase();
  const lic = db.licenses.find(l => l.key === key);
  if (!lic) return res.status(404).json({ok:false, message:'License không tồn tại'});
  if (body.status) lic.status = body.status;
  if (body.maxDevices) lic.maxDevices = Math.max(1, Number(body.maxDevices));
  if ('expiresAt' in body) lic.expiresAt = normalizeExpiryInput(body.expiresAt || '');
  if ('durationAmount' in body) lic.durationAmount = Number(body.durationAmount || 0);
  if ('durationUnit' in body) lic.durationUnit = String(body.durationUnit || '');
  if (body.renewDuration) {
    lic.expiresAt = addDurationToDate(body.durationAmount || lic.durationAmount || 30, body.durationUnit || lic.durationUnit || 'days');
    lic.durationAmount = Number(body.durationAmount || lic.durationAmount || 30);
    lic.durationUnit = String(body.durationUnit || lic.durationUnit || 'days');
  }
  if (body.resetDevices) {
    lic.devices = [];
    lic.devicesResetAt = nowISO();
  }
  saveDB(db);
  res.json({ ok:true, license: lic });
});

app.delete('/api/admin/license/:key', requireAdmin, (req, res) => {
  const db = loadDB();
  const key = String(req.params.key || '').toUpperCase();
  db.licenses = db.licenses.filter(l => l.key !== key);
  saveDB(db);
  res.json({ ok:true });
});

app.post('/api/verify', (req, res) => {
  const db = loadDB();
  const licenseKey = String((req.body && req.body.licenseKey) || '').trim().toUpperCase();
  const inputEmail = normalizeEmail((req.body && (req.body.gmail || req.body.email)) || '');
  const deviceId = String((req.body && req.body.deviceId) || '').trim();
  const license = db.licenses.find(l => l.key === licenseKey);
  if (!license) return res.json({ ok:false, message:'License key không tồn tại' });
  if (license.status !== 'active') return res.json({ ok:false, message:'License đã bị khoá' });
  if (isExpired(license)) return res.json({ ok:false, message:'License đã hết hạn: ' + formatExpiryForUser(license.expiresAt) });
  if (!isValidGmail(inputEmail)) return res.json({ ok:false, message:'Vui lòng nhập đúng Gmail đã đăng ký với admin' });
  if (!deviceId) return res.json({ ok:false, message:'Thiếu Device ID' });

  const member = findMember(db, license.memberId);
  const registeredEmail = normalizeEmail(member && member.email);
  if (!member) return res.json({ ok:false, message:'License chưa gán member' });
  if (!registeredEmail) return res.json({ ok:false, message:'Member này chưa có Gmail trong Admin. Admin cần cập nhật/tạo lại member có Gmail.' });
  if (inputEmail !== registeredEmail) {
    return res.json({ ok:false, message:'Gmail không khớp với License Key. Vui lòng nhập đúng Gmail admin đã tạo.' });
  }

  license.devices = Array.isArray(license.devices) ? license.devices : [];
  const existing = license.devices.find(d => d.deviceId === deviceId);
  if (!existing){
    if (license.devices.length >= Number(license.maxDevices || 1)){
      return res.json({ ok:false, message:`License đã vượt quá số máy cho phép (${license.maxDevices})` });
    }
    license.devices.push({ deviceId, activatedAt: nowISO(), lastSeenAt: nowISO() });
  } else {
    existing.lastSeenAt = nowISO();
  }

  saveDB(db);
  res.json({
    ok:true,
    message:'License OK',
    memberName: member ? member.name : '',
    gmail: registeredEmail,
    email: registeredEmail,
    licenseKey: license.key,
    expiresAt: license.expiresAt,
    expiresAtDisplay: formatExpiryForUser(license.expiresAt),
    maxDevices: license.maxDevices,
    usedDevices: license.devices.length
  });
});

app.get('/admin', (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tikfinity Football License Admin</title>
<style>
body{margin:0;background:#0b1115;color:#fff;font-family:Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:22px}
.card{background:#121b22;border:1px solid #26343d;border-radius:16px;padding:16px;margin:14px 0;box-shadow:0 10px 24px rgba(0,0,0,.22)}
h1{margin:0 0 10px;font-size:26px}
h2{margin:0 0 12px;font-size:18px}
input,select,button,textarea{height:38px;border-radius:10px;border:1px solid #334854;background:#071015;color:#fff;padding:0 10px;font-weight:700}
textarea{height:70px;padding-top:8px}
button{cursor:pointer;background:#21c45a;color:#031006;border:0;font-weight:900}
button.red{background:#ff5555;color:#fff}
button.blue{background:#2f93ff;color:#fff}
button.gray{background:#2d3a42;color:#fff}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border-bottom:1px solid #26343d;padding:9px;text-align:left;font-size:13px}
th{color:#9fb3c1}
.badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#26343d}
.ok{background:#145c2d;color:#9dffb8}.off{background:#5c1414;color:#ffaaaa}
.small{font-size:12px;color:#9fb3c1;line-height:1.4}
.hidden{display:none}
</style>
</head>
<body>
<div class="wrap">
  <h1>🔐 Tikfinity Football License Admin</h1>
  <div class="small">Default admin: <b>admin</b> / <b>admin123</b>. Đổi trong <code>server/database.json</code>.</div>

  <div class="card" id="loginCard">
    <h2>Admin Login</h2>
    <div class="row">
      <input id="adminUser" placeholder="username" value="admin"/>
      <input id="adminPass" placeholder="password" type="password" value="admin123"/>
      <button onclick="login()">Login</button>
    </div>
    <div id="loginMsg" class="small"></div>
  </div>

  <div id="adminArea" class="hidden">
    <div class="card">
      <h2>Create Member</h2>
      <div class="grid">
        <input id="memberName" placeholder="Member name"/>
        <input id="memberEmail" placeholder="Gmail member, ví dụ: name@gmail.com"/>
        <input id="memberNote" placeholder="Note"/>
        <button onclick="createMember()">+ Add Member</button>
      </div>
    </div>

    <div class="card">
      <h2>Create License Key</h2>
      <div class="grid">
        <select id="licenseMember"></select>
        <input id="licenseMaxDevices" type="number" min="1" value="1" placeholder="Max devices"/>
        <input id="licenseDurationAmount" type="number" min="0" value="30" placeholder="Time"/>
        <select id="licenseDurationUnit">
          <option value="hours">Hours</option>
          <option value="days" selected>Days</option>
          <option value="months">Months</option>
          <option value="years">Years</option>
        </select>
        <input id="licenseExpires" placeholder="Custom expiry ISO/YYYY-MM-DD or blank"/>
        <button onclick="createLicense()">Generate License</button>
      </div>
    </div>

    <div class="card">
      <h2>Members</h2>
      <table>
        <thead><tr><th>Name</th><th>Gmail</th><th>Note</th><th>Created</th><th>Action</th></tr></thead>
        <tbody id="membersTable"></tbody>
      </table>
    </div>

    <div class="card">
      <h2>Licenses</h2>
      <table>
        <thead><tr><th>Key</th><th>Member</th><th>Status</th><th>Devices</th><th>Expires</th><th>Action</th></tr></thead>
        <tbody id="licensesTable"></tbody>
      </table>
    </div>
  </div>
</div>
<script>
let token='', members=[], licenses=[];
async function api(url, options={}){
  options.headers = Object.assign({'Content-Type':'application/json'}, options.headers || {});
  if(token) options.headers['x-admin-token'] = token;
  const res = await fetch(url, options);
  return res.json();
}
async function login(){
  const username = document.getElementById('adminUser').value;
  const password = document.getElementById('adminPass').value;
  const data = await api('/api/admin/login',{method:'POST',body:JSON.stringify({username,password})});
  if(!data.ok){document.getElementById('loginMsg').textContent=data.message||'Login failed';return;}
  token=data.token; localStorage.setItem('license_admin_token', token);
  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('adminArea').classList.remove('hidden');
  loadData();
}
async function loadData(){
  const data = await api('/api/admin/data');
  if(!data.ok){alert(data.message||'Cannot load');return;}
  members=data.members||[]; licenses=data.licenses||[];
  render();
}
function memberName(id){ const m=members.find(x=>x.id===id); return m?m.name:'Unknown';}
function expiryText(l){
  if(!l.expiresAt) return 'Never';
  const t = Date.parse(l.expiresAt);
  if(!Number.isFinite(t)) return l.expiresAt;
  const remain = t - Date.now();
  const d = new Date(t).toLocaleString();
  if(remain <= 0) return '<span class="badge off">' + d + ' — Expired</span>';
  const days = Math.ceil(remain / 86400000);
  const hours = Math.ceil(remain / 3600000);
  return '<span class="badge ok">' + d + ' — ' + (hours < 48 ? hours + 'h' : days + 'd') + ' left</span>';
}
function render(){
  document.getElementById('licenseMember').innerHTML = members.map(m=>'<option value="'+m.id+'">'+m.name+'</option>').join('');
  document.getElementById('membersTable').innerHTML = members.map(m=>\`
    <tr><td>\${m.name}</td><td>\${m.email||''}</td><td>\${m.note||''}</td><td>\${(m.createdAt||'').slice(0,10)}</td>
    <td><button class="red" onclick="deleteMember('\${m.id}')">Delete</button></td></tr>\`).join('');
  document.getElementById('licensesTable').innerHTML = licenses.map(l=>\`
    <tr>
      <td><b>\${l.key}</b><br><span class="small">Created: \${(l.createdAt||'').slice(0,10)}</span></td>
      <td>\${memberName(l.memberId)}</td>
      <td><span class="badge \${l.status==='active'?'ok':'off'}">\${l.status}</span></td>
      <td>\${(l.devices||[]).length} / \${l.maxDevices||1}<br><span class="small">\${(l.devices||[]).map(d=>d.deviceId).join('<br>')}</span></td>
      <td>
        \${expiryText(l)}<br>
        <span class="small">Duration: \${l.durationAmount ? (l.durationAmount + ' ' + l.durationUnit) : 'Custom/Never'}</span>
      </td>
      <td class="row">
        <button class="blue" onclick="copyKey('\${l.key}')">Copy</button>
        <button class="gray" onclick="toggleLicense('\${l.key}','\${l.status==='active'?'blocked':'active'}')">\${l.status==='active'?'Block':'Active'}</button>
        <button class="gray" onclick="renewLicense('\${l.key}')">Renew</button>
        <button class="gray" onclick="editExpiry('\${l.key}')">Set Expiry</button>
        <button class="gray" onclick="resetDevices('\${l.key}')">Reset Devices</button>
        <button class="red" onclick="deleteLicense('\${l.key}')">Delete</button>
      </td>
    </tr>\`).join('');
}
async function createMember(){
  const body={name:memberNameInput.value,email:memberEmail.value,note:memberNote.value};
  body.name=document.getElementById('memberName').value;
  body.email=document.getElementById('memberEmail').value.trim().toLowerCase();
  body.note=document.getElementById('memberNote').value;
  if(!isValidGmail(body.email)){ alert('Admin phải nhập Gmail hợp lệ cho member, ví dụ: name@gmail.com'); return; }
  const data=await api('/api/admin/member',{method:'POST',body:JSON.stringify(body)});
  if(!data.ok){alert(data.message);return;}
  document.getElementById('memberName').value='';
  document.getElementById('memberEmail').value='';
  document.getElementById('memberNote').value='';
  loadData();
}
async function createLicense(){
  const body={
    memberId:document.getElementById('licenseMember').value,
    maxDevices:Number(document.getElementById('licenseMaxDevices').value||1),
    expiresAt:document.getElementById('licenseExpires').value,
    durationAmount:Number(document.getElementById('licenseDurationAmount').value || 0),
    durationUnit:document.getElementById('licenseDurationUnit').value
  };
  const data=await api('/api/admin/license',{method:'POST',body:JSON.stringify(body)});
  if(!data.ok){alert(data.message);return;}
  await navigator.clipboard.writeText(data.license.key).catch(()=>{});
  alert('Created license: '+data.license.key);
  loadData();
}
async function deleteMember(id){ if(!confirm('Delete member and all licenses?'))return; await api('/api/admin/member/'+id,{method:'DELETE'}); loadData();}
async function deleteLicense(key){ if(!confirm('Delete license?'))return; await api('/api/admin/license/'+key,{method:'DELETE'}); loadData();}
async function toggleLicense(key,status){ await api('/api/admin/license-update',{method:'PATCH',body:JSON.stringify({key,status})}); loadData();}
async function resetDevices(key){ await api('/api/admin/license-update',{method:'PATCH',body:JSON.stringify({key,resetDevices:true})}); loadData();}
async function renewLicense(key){
  const l = licenses.find(x=>x.key===key) || {};
  const amount = prompt('Gia hạn thêm bao nhiêu?', l.durationAmount || 30);
  if(amount === null) return;
  const unit = prompt('Đơn vị: hours / days / months / years', l.durationUnit || 'days');
  if(unit === null) return;
  await api('/api/admin/license-update',{method:'PATCH',body:JSON.stringify({key,renewDuration:true,durationAmount:Number(amount),durationUnit:unit})});
  loadData();
}
async function editExpiry(key){
  const l = licenses.find(x=>x.key===key) || {};
  const value = prompt('Nhập ngày hết hạn ISO hoặc YYYY-MM-DD. Để trống = không hết hạn.', l.expiresAt || '');
  if(value === null) return;
  await api('/api/admin/license-update',{method:'PATCH',body:JSON.stringify({key,expiresAt:value})});
  loadData();
}
function copyKey(key){ navigator.clipboard.writeText(key).then(()=>alert('Copied: '+key)); }
token=localStorage.getItem('license_admin_token')||'';
if(token){document.getElementById('loginCard').classList.add('hidden');document.getElementById('adminArea').classList.remove('hidden');loadData();}
</script>
</body>
</html>`);
});

app.get('/health', (req, res) => res.json({ ok:true, service:'tikfinity-license-server' }));

app.get('/', (req, res) => res.redirect('/admin'));

app.listen(PORT, () => {
  console.log('Tikfinity Football License Server running at http://localhost:' + PORT);
  console.log('Admin panel: http://localhost:' + PORT + '/admin');
});
