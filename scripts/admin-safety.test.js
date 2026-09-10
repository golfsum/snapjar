const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(`public/assets/${name}.js`, 'utf8');
const config = read('config').replace(/export /g, '');
function context(extra = {}) { return vm.createContext({ ...extra }); }
test('admin identity requires the exact verified account', () => {
  const c = context(); vm.runInContext(config, c);
  for (const user of [null, {}, {email:'nd82soft@gmail.com', emailVerified:false}, {email:'other@example.com',emailVerified:true}]) assert.equal(c.isAdminUser(user),false);
  assert.equal(c.isAdminUser({email:'nd82soft@gmail.com',emailVerified:true}),true);
});
test('admin album initialization redirects before any album read or counter write', async () => {
  const c = context({code:'TEST & CODE', currentUser:null, ensureSignedIn:async()=>({email:'nd82soft@gmail.com',emailVerified:true}), location:{replace:url=>c.redirect=url}, getDoc:()=>assert.fail('must not read album on guest route'), console, showMissing:()=>assert.fail('unexpected initialization failure')});
  vm.runInContext(config, c);
  const source=read('event');
  vm.runInContext(source.slice(source.indexOf('async function init()'),source.indexOf('\nfunction showMissing()')),c);
  await c.init();
  assert.equal(c.redirect,'/dashboard-q7x2m9?album=TEST%20%26%20CODE');
});
test('inspector has no database mutation or analytics imports/calls', () => {
  assert.doesNotMatch(read('admin-inspector'),/\b(updateDoc|deleteDoc|addDoc|setDoc|uploadBytes|signInAnonymously|track|snapjarTrack)\s*\(/);
});
test('all existing dashboard mutations enforce read-only and verified account gates', () => {
  const source=read('dashboard');
  for(const name of ['dismissReport','deleteReportedPhoto','setPaid','setPro','removeAlbum']) {
    const body=source.slice(source.indexOf(`async function ${name}(`));
    assert.match(body.slice(0,280),/if \(!editsEnabled \|\| !isAdminUser\(auth.currentUser\) \|\| location.hash === "#preview"\) return;/);
  }
});
