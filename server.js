
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;
const DB_PATH = path.join(__dirname, 'database.json');
const ADMIN_HTML = "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\"/>\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>\n<title>Tikfinity Football License Admin</title>\n<style>\nbody{margin:0;background:#071015;color:#fff;font-family:Arial,sans-serif}\n.wrap{max-width:1280px;margin:0 auto;padding:32px}\nh1{font-size:28px;margin:0 0 8px}.small{font-size:12px;color:#9fb3c1}\n.card{background:#101b22;border:1px solid #26343d;border-radius:18px;padding:18px;margin:18px 0}\n.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}\n.grid5{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}\ninput,select{height:42px;border-radius:10px;border:1px solid #2b4250;background:#061015;color:#fff;padding:0 12px;font-weight:800}\nbutton{height:42px;border:0;border-radius:10px;background:#21c45a;color:#001b0b;font-weight:1000;cursor:pointer;padding:0 14px}\nbutton.red{background:#f05252;color:#fff}button.gray{background:#32414b;color:#fff}button.blue{background:#2f93ff;color:#fff}\ntable{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:10px;border-bottom:1px solid #26343d;text-align:left;font-size:13px;vertical-align:top}\nth{color:#a8d3ff}.hidden{display:none}.msg{margin-top:10px;color:#ffd35f;font-size:13px;white-space:pre-wrap}.ok{color:#78ff9d}.err{color:#ff7e7e}\n.badge{padding:4px 8px;border-radius:999px;background:#173924;color:#8bffad;font-weight:900}\n@media(max-width:900px){.grid,.grid5{grid-template-columns:1fr}}\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <h1>\ud83d\udd10 Tikfinity Football License Admin</h1>\n  <div class=\"small\">Default admin: <b>admin</b> / <b>admin123</b></div>\n\n  <div class=\"card\" id=\"loginCard\">\n    <h2>Admin Login</h2>\n    <div class=\"grid\">\n      <input id=\"adminUser\" value=\"admin\" placeholder=\"username\"/>\n      <input id=\"adminPass\" value=\"admin123\" type=\"password\" placeholder=\"password\"/>\n      <button onclick=\"login()\">Login</button>\n    </div>\n    <div id=\"loginMsg\" class=\"msg\"></div>\n  </div>\n\n  <div id=\"adminArea\" class=\"hidden\">\n    <div class=\"card\">\n      <button class=\"gray\" onclick=\"logout()\">Logout</button>\n      <button class=\"blue\" onclick=\"loadData()\">Refresh</button>\n      <span class=\"small\"> Server online: add member/license s\u1ebd l\u01b0u v\u00e0o database.json tr\u00ean Railway.</span>\n    </div>\n\n    <div class=\"card\">\n      <h2>Create Member</h2>\n      <div class=\"grid\">\n        <input id=\"memberName\" placeholder=\"Member name\"/>\n        <input id=\"memberEmail\" placeholder=\"Gmail, v\u00ed d\u1ee5 name@gmail.com\"/>\n        <input id=\"memberNote\" placeholder=\"Note\"/>\n        <button onclick=\"createMember()\">+ Add Member</button>\n      </div>\n      <div id=\"memberMsg\" class=\"msg\"></div>\n    </div>\n\n    <div class=\"card\">\n      <h2>Create License Key</h2>\n      <div class=\"grid5\">\n        <select id=\"licenseMember\"></select>\n        <input id=\"licenseMaxDevices\" type=\"number\" min=\"1\" value=\"1\" placeholder=\"Max devices\"/>\n        <input id=\"licenseDurationAmount\" type=\"number\" min=\"1\" value=\"30\" placeholder=\"Time\"/>\n        <select id=\"licenseDurationUnit\">\n          <option value=\"hours\">Hours</option>\n          <option value=\"days\" selected>Days</option>\n          <option value=\"months\">Months</option>\n          <option value=\"years\">Years</option>\n        </select>\n        <input id=\"licenseExpires\" placeholder=\"Custom expiry ISO/YYYY-MM-DD or blank\"/>\n        <button onclick=\"createLicense()\">Generate License</button>\n      </div>\n      <div id=\"licenseMsg\" class=\"msg\"></div>\n    </div>\n\n    <div class=\"card\">\n      <h2>Members</h2>\n      <table><thead><tr><th>Name</th><th>Gmail</th><th>Note</th><th>Created</th><th>Action</th></tr></thead><tbody id=\"membersTable\"></tbody></table>\n    </div>\n\n    <div class=\"card\">\n      <h2>Licenses</h2>\n      <table><thead><tr><th>Key</th><th>Member</th><th>Status</th><th>Devices</th><th>Expires</th><th>Action</th></tr></thead><tbody id=\"licensesTable\"></tbody></table>\n    </div>\n  </div>\n</div>\n<script>\nlet token = localStorage.getItem('license_admin_token') || '';\nlet members = [];\nlet licenses = [];\n\nfunction esc(s){ return String(s || '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }\nfunction isValidGmail(email){ return /^[^\\s@]+@gmail\\.com$/i.test(String(email || '').trim()); }\nfunction msg(id, text, type='info'){\n  const el = document.getElementById(id);\n  if(!el) return;\n  el.className = 'msg ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');\n  el.textContent = text || '';\n}\nasync function api(url, options={}){\n  options.headers = Object.assign({'Content-Type':'application/json'}, options.headers || {});\n  if(token) options.headers['x-admin-token'] = token;\n  const res = await fetch(url, options);\n  let data;\n  try{ data = await res.json(); }catch(e){ data = {ok:false,message:'Server tr\u1ea3 v\u1ec1 d\u1eef li\u1ec7u kh\u00f4ng ph\u1ea3i JSON'}; }\n  if(!res.ok && !data.message) data.message = 'HTTP ' + res.status;\n  return data;\n}\nfunction memberName(id){ const m = members.find(x=>x.id===id); return m ? m.name : 'Unknown'; }\nfunction memberEmail(id){ const m = members.find(x=>x.id===id); return m ? m.email : ''; }\nfunction expiryText(l){\n  if(!l.expiresAt) return 'Never';\n  const t = Date.parse(l.expiresAt);\n  if(!Number.isFinite(t)) return l.expiresAt;\n  const d = new Date(t).toLocaleString();\n  return Date.now() > t ? d + ' \u2014 Expired' : d;\n}\nasync function login(){\n  const username = document.getElementById('adminUser').value.trim();\n  const password = document.getElementById('adminPass').value;\n  msg('loginMsg','\u0110ang login...');\n  const data = await api('/api/admin/login', {method:'POST', body:JSON.stringify({username,password})});\n  if(!data.ok){ msg('loginMsg', data.message || 'Login failed', 'err'); return; }\n  token = data.token;\n  localStorage.setItem('license_admin_token', token);\n  document.getElementById('loginCard').classList.add('hidden');\n  document.getElementById('adminArea').classList.remove('hidden');\n  msg('loginMsg','');\n  await loadData();\n}\nfunction logout(){\n  token = '';\n  localStorage.removeItem('license_admin_token');\n  document.getElementById('loginCard').classList.remove('hidden');\n  document.getElementById('adminArea').classList.add('hidden');\n  msg('loginMsg', '\u0110\u00e3 logout. Login l\u1ea1i admin/admin123.', 'ok');\n}\nasync function loadData(){\n  const data = await api('/api/admin/data');\n  if(!data.ok){ logout(); msg('loginMsg', data.message || 'Cannot load data', 'err'); return; }\n  members = data.members || [];\n  licenses = data.licenses || [];\n  render();\n}\nfunction render(){\n  const select = document.getElementById('licenseMember');\n  if(!members.length){\n    select.innerHTML = '<option value=\"\">H\u00e3y t\u1ea1o member tr\u01b0\u1edbc</option>';\n  } else {\n    select.innerHTML = members.map(m => '<option value=\"' + esc(m.id) + '\">' + esc(m.name) + ' \u2014 ' + esc(m.email) + '</option>').join('');\n  }\n\n  document.getElementById('membersTable').innerHTML = members.map(m =>\n    '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.email) + '</td><td>' + esc(m.note || '') + '</td><td>' + esc(new Date(m.createdAt).toLocaleString()) + '</td><td><button class=\"red\" onclick=\"deleteMember(\\\\'' + esc(m.id) + '\\\\')\">Delete</button></td></tr>'\n  ).join('') || '<tr><td colspan=\"5\" class=\"small\">Ch\u01b0a c\u00f3 member n\u00e0o</td></tr>';\n\n  document.getElementById('licensesTable').innerHTML = licenses.map(l =>\n    '<tr><td><b>' + esc(l.key) + '</b><br><button class=\"gray\" onclick=\"copyKey(\\\\'' + esc(l.key) + '\\\\')\">Copy</button></td><td>' + esc(memberName(l.memberId)) + '<br><span class=\"small\">' + esc(memberEmail(l.memberId)) + '</span></td><td><span class=\"badge\">' + esc(l.status) + '</span></td><td>' + ((l.devices || []).length) + ' / ' + (l.maxDevices || 1) + '</td><td>' + esc(expiryText(l)) + '</td><td><button class=\"gray\" onclick=\"resetDevices(\\\\'' + esc(l.key) + '\\\\')\">Reset Devices</button> <button class=\"red\" onclick=\"deleteLicense(\\\\'' + esc(l.key) + '\\\\')\">Delete</button></td></tr>'\n  ).join('') || '<tr><td colspan=\"6\" class=\"small\">Ch\u01b0a c\u00f3 license n\u00e0o</td></tr>';\n}\nasync function createMember(){\n  const body = {\n    name: document.getElementById('memberName').value.trim(),\n    email: document.getElementById('memberEmail').value.trim().toLowerCase(),\n    note: document.getElementById('memberNote').value.trim()\n  };\n  if(!body.name){ msg('memberMsg','Vui l\u00f2ng nh\u1eadp t\u00ean member','err'); return; }\n  if(!isValidGmail(body.email)){ msg('memberMsg','Vui l\u00f2ng nh\u1eadp Gmail h\u1ee3p l\u1ec7, v\u00ed d\u1ee5 name@gmail.com','err'); return; }\n  msg('memberMsg','\u0110ang t\u1ea1o member...');\n  const data = await api('/api/admin/member', {method:'POST', body:JSON.stringify(body)});\n  if(!data.ok){ msg('memberMsg', data.message || 'Create member failed', 'err'); return; }\n  document.getElementById('memberName').value = '';\n  document.getElementById('memberEmail').value = '';\n  document.getElementById('memberNote').value = '';\n  msg('memberMsg', '\u0110\u00e3 t\u1ea1o member: ' + data.member.email, 'ok');\n  await loadData();\n}\nasync function createLicense(){\n  if(!members.length){ msg('licenseMsg','H\u00e3y t\u1ea1o member tr\u01b0\u1edbc','err'); return; }\n  const body = {\n    memberId: document.getElementById('licenseMember').value,\n    maxDevices: Number(document.getElementById('licenseMaxDevices').value || 1),\n    durationAmount: Number(document.getElementById('licenseDurationAmount').value || 30),\n    durationUnit: document.getElementById('licenseDurationUnit').value,\n    expiresAt: document.getElementById('licenseExpires').value\n  };\n  msg('licenseMsg','\u0110ang t\u1ea1o license...');\n  const data = await api('/api/admin/license', {method:'POST', body:JSON.stringify(body)});\n  if(!data.ok){ msg('licenseMsg', data.message || 'Create license failed', 'err'); return; }\n  try{ await navigator.clipboard.writeText(data.license.key); }catch(e){}\n  msg('licenseMsg', 'Created license: ' + data.license.key + ' \u2014 \u0111\u00e3 copy n\u1ebfu tr\u00ecnh duy\u1ec7t cho ph\u00e9p.', 'ok');\n  await loadData();\n}\nasync function deleteMember(id){\n  if(!confirm('Delete member and all licenses?')) return;\n  await api('/api/admin/member/' + encodeURIComponent(id), {method:'DELETE'});\n  await loadData();\n}\nasync function deleteLicense(key){\n  if(!confirm('Delete license?')) return;\n  await api('/api/admin/license/' + encodeURIComponent(key), {method:'DELETE'});\n  await loadData();\n}\nasync function resetDevices(key){\n  await api('/api/admin/license-update', {method:'PATCH', body:JSON.stringify({key, resetDevices:true})});\n  await loadData();\n}\nfunction copyKey(key){ navigator.clipboard.writeText(key).then(()=>alert('Copied: ' + key)); }\n\nif(token){\n  document.getElementById('loginCard').classList.add('hidden');\n  document.getElementById('adminArea').classList.remove('hidden');\n  loadData();\n}\n</script>\n</body>\n</html>";

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function nowISO(){ return new Date().toISOString(); }
function normalizeEmail(v){ return String(v || '').trim().toLowerCase(); }
function isValidGmail(v){ return /^[^\s@]+@gmail\.com$/i.test(String(v || '').trim()); }
function makeId(prefix){ return prefix + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function makeLicenseKey(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return 'LIC-' + part() + '-' + part() + '-' + part();
}
function defaultDB(){ return { admin: { username:'admin', password:'admin123' }, members: [], licenses: [] }; }
function loadDB(){
  if(!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB(), null, 2), 'utf8');
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.admin = db.admin || { username:'admin', password:'admin123' };
  db.members = Array.isArray(db.members) ? db.members : [];
  db.licenses = Array.isArray(db.licenses) ? db.licenses : [];
  return db;
}
function saveDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }
function tokenFor(username, password){ return Buffer.from(username + ':' + password).toString('base64'); }
function requireAdmin(req, res, next){
  const db = loadDB();
  const token = req.headers['x-admin-token'] || req.query.token || '';
  const expected = tokenFor(db.admin.username, db.admin.password);
  if(token !== expected) return res.status(401).json({ ok:false, message:'Admin login required. Hãy bấm Logout rồi login lại admin/admin123.' });
  next();
}
function findMember(db, id){ return db.members.find(m => m.id === id); }
function addDurationToDate(amount, unit){
  amount = Number(amount || 0);
  const d = new Date();
  if(unit === 'hours') d.setHours(d.getHours() + amount);
  else if(unit === 'months') d.setMonth(d.getMonth() + amount);
  else if(unit === 'years') d.setFullYear(d.getFullYear() + amount);
  else d.setDate(d.getDate() + amount);
  return d.toISOString();
}
function normalizeExpiryInput(v){
  v = String(v || '').trim();
  if(!v) return '';
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
function isExpired(license){
  if(!license.expiresAt) return false;
  const t = Date.parse(license.expiresAt);
  return Number.isFinite(t) && Date.now() > t;
}
function formatExpiryForUser(v){
  if(!v) return 'Never';
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : v;
}

app.get('/health', (req, res) => res.json({ ok:true, service:'tikfinity-license-server' }));
app.get('/admin', (req, res) => res.send(ADMIN_HTML));
app.get('/', (req, res) => res.redirect('/admin'));

app.post('/api/admin/login', (req, res) => {
  const db = loadDB();
  const body = req.body || {};
  if(body.username === db.admin.username && body.password === db.admin.password){
    return res.json({ ok:true, token: tokenFor(body.username, body.password) });
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
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const note = String(body.note || '').trim();

  if(!name) return res.status(400).json({ ok:false, message:'Vui lòng nhập tên member' });
  if(!isValidGmail(email)) return res.status(400).json({ ok:false, message:'Vui lòng nhập Gmail hợp lệ, ví dụ name@gmail.com' });
  if(db.members.some(m => normalizeEmail(m.email) === email)){
    return res.status(400).json({ ok:false, message:'Gmail này đã tồn tại trong Members' });
  }

  const member = { id: makeId('m'), name, email, note, createdAt: nowISO() };
  db.members.push(member);
  saveDB(db);
  res.json({ ok:true, member });
});

app.delete('/api/admin/member/:id', requireAdmin, (req, res) => {
  const db = loadDB();
  const id = req.params.id;
  db.members = db.members.filter(m => m.id !== id);
  db.licenses = db.licenses.filter(l => l.memberId !== id);
  saveDB(db);
  res.json({ ok:true });
});

app.post('/api/admin/license', requireAdmin, (req, res) => {
  const db = loadDB();
  const body = req.body || {};
  const member = db.members.find(m => m.id === body.memberId);
  if(!member) return res.status(400).json({ ok:false, message:'Member không tồn tại. Hãy tạo member trước.' });

  let key = body.key ? String(body.key).trim().toUpperCase() : makeLicenseKey();
  if(db.licenses.some(l => l.key === key)) return res.status(400).json({ ok:false, message:'License key đã tồn tại' });

  const expiresAt = normalizeExpiryInput(body.expiresAt || '') || addDurationToDate(body.durationAmount || 30, body.durationUnit || 'days');
  const license = {
    key,
    memberId: member.id,
    status: 'active',
    maxDevices: Math.max(1, Number(body.maxDevices || 1)),
    devices: [],
    durationAmount: Number(body.durationAmount || 30),
    durationUnit: body.durationUnit || 'days',
    expiresAt,
    createdAt: nowISO()
  };
  db.licenses.push(license);
  saveDB(db);
  res.json({ ok:true, license });
});

app.patch('/api/admin/license-update', requireAdmin, (req, res) => {
  const db = loadDB();
  const body = req.body || {};
  const key = String(body.key || '').toUpperCase();
  const lic = db.licenses.find(l => l.key === key);
  if(!lic) return res.status(404).json({ ok:false, message:'License không tồn tại' });
  if(body.resetDevices) lic.devices = [];
  if(body.status) lic.status = body.status;
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
  const body = req.body || {};
  const licenseKey = String(body.licenseKey || '').trim().toUpperCase();
  const inputEmail = normalizeEmail(body.gmail || body.email || '');
  const deviceId = String(body.deviceId || '').trim();

  const license = db.licenses.find(l => l.key === licenseKey);
  if(!license) return res.json({ ok:false, message:'License key không tồn tại' });
  if(license.status !== 'active') return res.json({ ok:false, message:'License đã bị khoá' });
  if(isExpired(license)) return res.json({ ok:false, message:'License đã hết hạn: ' + formatExpiryForUser(license.expiresAt) });
  if(!isValidGmail(inputEmail)) return res.json({ ok:false, message:'Vui lòng nhập đúng Gmail admin đã đăng ký' });
  if(!deviceId) return res.json({ ok:false, message:'Thiếu Device ID' });

  const member = findMember(db, license.memberId);
  const registeredEmail = normalizeEmail(member && member.email);
  if(!member) return res.json({ ok:false, message:'License chưa gán member' });
  if(inputEmail !== registeredEmail) return res.json({ ok:false, message:'Gmail không khớp với License Key' });

  license.devices = Array.isArray(license.devices) ? license.devices : [];
  const existing = license.devices.find(d => d.deviceId === deviceId);
  if(!existing){
    if(license.devices.length >= Number(license.maxDevices || 1)){
      return res.json({ ok:false, message:'License đã vượt quá số máy cho phép (' + license.maxDevices + ')' });
    }
    license.devices.push({ deviceId, activatedAt: nowISO(), lastSeenAt: nowISO() });
  } else {
    existing.lastSeenAt = nowISO();
  }
  saveDB(db);

  res.json({
    ok:true,
    message:'License OK',
    memberName: member.name,
    gmail: registeredEmail,
    email: registeredEmail,
    licenseKey: license.key,
    expiresAt: license.expiresAt,
    expiresAtDisplay: formatExpiryForUser(license.expiresAt),
    maxDevices: license.maxDevices,
    usedDevices: license.devices.length
  });
});

app.listen(PORT, () => {
  console.log('Tikfinity Football License Server running at http://localhost:' + PORT);
});
