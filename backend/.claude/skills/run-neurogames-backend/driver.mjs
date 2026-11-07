#!/usr/bin/env node
// Local harness for the NeuroGames backend. No npm deps — Node >= 18 only.
//
// Replaces both Supabase pieces the backend talks to with local stand-ins:
//   * Postgres 17 in Docker, with a minimal stub of Supabase's `auth` schema
//     (auth.users, auth.uid(), anon/authenticated roles) + database/schema.sql
//   * A tiny JWKS server holding a freshly generated ES256 key, so this
//     script can mint tokens the backend accepts exactly like Supabase's.
//
// Usage (run from backend/):  node .claude/skills/run-neurogames-backend/driver.mjs <cmd>
//   up                      start Postgres + JWKS + backend jar (build it first)
//   down                    stop everything, delete the DB container
//   status                  what's running
//   smoke                   end-to-end check of every endpoint; exit 1 on failure
//   smoke-db                gameplay RPC + RLS checks (gameplay-smoke.sql, rolled back)
//   call METHOD PATH [JSON] [--as EMAIL | --anon | --token JWT | --no-auth]
//                           HTTP request to the backend (default --as lecturer@example.com)
//   token [EMAIL]           print a lecturer JWT (creates the auth user if needed)
//   anon-token              new anonymous (student) user: prints {"id","token"} JSON
//   sql "QUERY"             run SQL in the local DB as postgres
//   sql-as UUID "QUERY"     run SQL as role authenticated with auth.uid() = UUID
//                           (exercises RLS and the gameplay RPCs)
//   logs [N]                last N lines of the backend log (default 60)

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(SKILL_DIR, '../../..');
const REPO_DIR = path.resolve(BACKEND_DIR, '..');
const STATE = path.join(BACKEND_DIR, 'target', 'run-harness');
const JAR = path.join(BACKEND_DIR, 'target', 'backend-0.0.1-SNAPSHOT.jar');

const PG_CONTAINER = 'neurogames-run-pg';
const PG_PORT = Number(process.env.HARNESS_PG_PORT || 54322);
const JWKS_PORT = Number(process.env.HARNESS_JWKS_PORT || 54399);
const APP_PORT = Number(process.env.HARNESS_APP_PORT || 8080);
const SUPABASE_URL = `http://127.0.0.1:${JWKS_PORT}`;
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const APP = `http://127.0.0.1:${APP_PORT}`;
const KID = 'neurogames-local-harness';

const AUTH_STUB_SQL = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id                 uuid primary key,
  email              text,
  is_anonymous       boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
-- Same lookup order as Supabase's auth.uid().
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;

// ---------------------------------------------------------------- helpers
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const die = (msg) => { console.error(`driver: ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pidFile = (name) => path.join(STATE, `${name}.pid`);

function alive(name) {
  try {
    const pid = Number(fs.readFileSync(pidFile(name), 'utf8'));
    process.kill(pid, 0);
    return pid;
  } catch { return null; }
}

function psql(sql, { quiet = false } = {}) {
  const r = sh('docker', ['exec', '-i', PG_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-A', '-t', '-F', '\t'], { input: sql });
  if (r.status !== 0) { process.stdout.write(r.stdout); die(`SQL failed:\n${r.stderr}`); }
  if (!quiet) process.stdout.write(r.stdout);
  return r.stdout.trim();
}

function spawnDetached(name, cmd, args, env = {}) {
  const log = fs.openSync(path.join(STATE, `${name}.log`), 'w');
  const child = spawn(cmd, args, { cwd: BACKEND_DIR, detached: true, stdio: ['ignore', log, log],
    env: { ...process.env, ...env } });
  fs.writeFileSync(pidFile(name), String(child.pid));
  child.unref();
}

function portAnswers(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

// ---------------------------------------------------------------- tokens
function signJwt(claims) {
  const key = crypto.createPrivateKey(fs.readFileSync(path.join(STATE, 'es256.pem')));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: KID }));
  const payload = b64url(JSON.stringify({ iss: ISSUER, aud: 'authenticated', role: 'authenticated',
    iat: now, exp: now + 3600, ...claims }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(sig)}`;
}

function lecturerToken(email = 'lecturer@example.com') {
  const safe = email.replace(/'/g, "''");
  // Not `on conflict do nothing`: the random id never conflicts, so the
  // duplicate email would reach the trigger's lecturers insert and fail there.
  const id = psql(`
    insert into auth.users (id, email, raw_user_meta_data)
    select gen_random_uuid(), '${safe}', '{"full_name":"Harness Lecturer"}'
    where not exists (select 1 from auth.users where email = '${safe}');
    select id from auth.users where email = '${safe}' limit 1;`, { quiet: true });
  return signJwt({ sub: id, email, is_anonymous: false });
}

function anonToken() {
  const id = psql(`insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id;`,
    { quiet: true });
  return { id, token: signJwt({ sub: id, is_anonymous: true }) };
}

// ---------------------------------------------------------------- commands
async function up() {
  if (!fs.existsSync(JAR)) die(`no jar at ${JAR} — run ./mvnw package first`);
  if (sh('docker', ['info']).status !== 0) die('Docker is not running (macOS: open -a Docker)');
  if (alive('backend')) die('already up — run `down` first');
  // On macOS Tomcat's wildcard bind succeeds even when another process holds
  // 127.0.0.1:<port>, so a busy port shows up as a silent hang, not an error.
  for (const [what, port] of [['backend', APP_PORT], ['jwks', JWKS_PORT]]) {
    if (await portAnswers(port)) die(`something is already listening on 127.0.0.1:${port} (${what}); `
      + `stop it or set HARNESS_${what === 'backend' ? 'APP' : 'JWKS'}_PORT`);
  }
  fs.mkdirSync(STATE, { recursive: true });

  // 1. Postgres
  sh('docker', ['rm', '-f', PG_CONTAINER]);
  const run = sh('docker', ['run', '-d', '--name', PG_CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres',
    '-p', `127.0.0.1:${PG_PORT}:5432`, 'postgres:17']);
  if (run.status !== 0) die(`docker run failed:\n${run.stderr}`);
  process.stdout.write('postgres: waiting');
  for (let i = 0; ; i++) {
    // pg_isready alone lies during the image's init restart; a real query doesn't.
    if (sh('docker', ['exec', PG_CONTAINER, 'psql', '-U', 'postgres', '-c', 'select 1']).status === 0
        && sh('docker', ['logs', PG_CONTAINER]).stdout.includes('PostgreSQL init process complete')) break;
    if (i > 60) die('postgres never became ready');
    process.stdout.write('.'); await sleep(1000);
  }
  console.log(' ready');
  psql(AUTH_STUB_SQL, { quiet: true });
  psql(fs.readFileSync(path.join(REPO_DIR, 'database', 'schema.sql'), 'utf8'), { quiet: true });
  console.log('postgres: auth stub + database/schema.sql applied');

  // 2. JWKS server with a fresh ES256 key
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync(path.join(STATE, 'es256.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'ES256', use: 'sig', kid: KID };
  fs.writeFileSync(path.join(STATE, 'jwks.json'), JSON.stringify({ keys: [jwk] }));
  spawnDetached('jwks', process.execPath, [fileURLToPath(import.meta.url), '_jwks-serve']);

  // 3. Backend
  spawnDetached('backend', 'java', ['-jar', JAR], {
    SUPABASE_URL,
    SUPABASE_DB_HOST: '127.0.0.1', SUPABASE_DB_PORT: String(PG_PORT),
    SUPABASE_DB_USER: 'postgres', SUPABASE_DB_PASSWORD: 'postgres',
    // application.yml hard-codes ?sslmode=require; the local container has no TLS.
    SPRING_DATASOURCE_URL: `jdbc:postgresql://127.0.0.1:${PG_PORT}/postgres?sslmode=disable`,
    SERVER_PORT: String(APP_PORT),
  });
  process.stdout.write('backend: starting');
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${APP}/api/auth/me`);
      if (res.status === 401) break;
    } catch { /* not listening yet */ }
    if (!alive('backend')) { console.log(); console.log(tail('backend', 40)); die('backend exited during startup'); }
    if (i > 90) { console.log(); console.log(tail('backend', 40)); die('backend did not come up in 90s (run `down` to clean up)'); }
    process.stdout.write('.'); await sleep(1000);
  }
  console.log(` up at ${APP}`);
}

function down() {
  for (const name of ['backend', 'jwks']) {
    const pid = alive(name);
    if (pid) { try { process.kill(-pid); } catch { process.kill(pid); } console.log(`stopped ${name} (${pid})`); }
    fs.rmSync(pidFile(name), { force: true });
  }
  if (sh('docker', ['rm', '-f', PG_CONTAINER]).status === 0) console.log(`removed ${PG_CONTAINER}`);
}

function status() {
  const pg = sh('docker', ['ps', '--filter', `name=${PG_CONTAINER}`, '--format', '{{.Status}}']).stdout.trim();
  console.log(`postgres  ${pg || 'down'}  (127.0.0.1:${PG_PORT})`);
  console.log(`jwks      ${alive('jwks') ? 'up' : 'down'}  (${SUPABASE_URL})`);
  console.log(`backend   ${alive('backend') ? 'up' : 'down'}  (${APP})`);
}

async function call(method, urlPath, body, auth) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${APP}${urlPath}`, { method, headers, body });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, text, json };
}

function parseAuth(args) {
  const i = (f) => args.indexOf(f);
  if (i('--no-auth') >= 0) return {};
  if (i('--token') >= 0) return { token: args[i('--token') + 1] };
  if (i('--anon') >= 0) return { token: anonToken().token };
  return { token: lecturerToken(i('--as') >= 0 ? args[i('--as') + 1] : undefined) };
}

async function smoke() {
  let failed = 0;
  const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -> ${detail}`}`);
    if (!ok) failed++;
  };
  const lect = { token: lecturerToken('smoke-lecturer@example.com') };
  const other = { token: lecturerToken('smoke-other@example.com') };

  let r = await call('GET', '/api/collections', undefined, {});
  check('no token -> 401', r.status === 401, r.status);
  r = await call('GET', '/api/collections', undefined, { token: anonToken().token });
  check('anonymous student token -> 403 (authenticated, not a teacher)', r.status === 403, r.status);
  r = await call('GET', '/api/collections', undefined,
    { token: signJwt({ sub: crypto.randomUUID(), email: 'nobody@example.com', is_anonymous: false }) });
  check('signed-in user without a lecturers row -> 403', r.status === 403, r.status);
  r = await call('GET', '/api/collections', undefined, { token: lect.token.slice(0, -4) + 'AAAA' });
  check('tampered signature -> 401', r.status === 401, r.status);

  r = await call('GET', '/api/auth/me', undefined, lect);
  check('GET /api/auth/me -> lecturer profile', r.status === 200 && r.json?.email === 'smoke-lecturer@example.com', r.text);

  r = await call('POST', '/api/collections', JSON.stringify({ name: 'Smoke Neuro 101' }), lect);
  check('POST collection without publicCollection -> 201', r.status === 201 && r.json?.publicCollection === false, `${r.status} ${r.text}`);
  check('POST response has timestamps', r.json?.createdAt && r.json?.updatedAt, r.text);
  const id = r.json?.id;
  const createdUpdatedAt = r.json?.updatedAt;
  await sleep(20);

  r = await call('GET', '/api/collections', undefined, lect);
  check('GET collections lists it', r.status === 200 && r.json?.some((c) => c.id === id), r.text);
  r = await call('PUT', `/api/collections/${id}`, JSON.stringify({ name: 'Renamed', publicCollection: true }), lect);
  check('PUT collection -> updated', r.status === 200 && r.json?.name === 'Renamed' && r.json?.publicCollection, r.text);
  check('PUT response has a newer updatedAt', r.json?.updatedAt > createdUpdatedAt, `${createdUpdatedAt} -> ${r.json?.updatedAt}`);
  r = await call('GET', `/api/collections/${id}`, undefined, other);
  check("other lecturer can't read it -> 404", r.status === 404, r.status);

  r = await call('GET', '/api/collections/not-a-uuid', undefined, lect);
  check('malformed id -> 400', r.status === 400, r.status);
  r = await call('POST', '/api/collections', JSON.stringify({ name: '' }), lect);
  check('blank name -> 400 with fieldErrors.name', r.status === 400 && r.json?.fieldErrors?.name, r.text);
  r = await call('POST', '/api/collections', '{not json', lect);
  check('unreadable JSON -> 400', r.status === 400, r.status);
  r = await call('GET', '/api/nope', undefined, lect);
  check('unknown route -> 404', r.status === 404, r.status);

  r = await call('DELETE', `/api/collections/${id}`, undefined, lect);
  check('DELETE collection -> 204', r.status === 204, r.status);
  r = await call('GET', `/api/collections/${id}`, undefined, lect);
  check('deleted collection -> 404', r.status === 404, r.status);

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
}

function smokeDb() {
  const r = sh('docker', ['exec', '-i', PG_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q'],
    { input: fs.readFileSync(path.join(SKILL_DIR, 'gameplay-smoke.sql'), 'utf8') });
  const lines = r.stderr.split('\n').filter((l) => l.startsWith('NOTICE:')).map((l) => l.replace(/^NOTICE:\s+/, ''));
  lines.forEach((l) => console.log(l));
  const failed = lines.filter((l) => l.startsWith('FAIL')).length;
  if (r.status !== 0) { console.log(r.stderr.split('\n').filter((l) => !l.startsWith('NOTICE:')).join('\n')); die('gameplay-smoke.sql errored'); }
  console.log(failed ? `\n${failed} check(s) failed` : `\nall ${lines.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

function tail(name, n) {
  const f = path.join(STATE, `${name}.log`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').slice(-n).join('\n') : `(no ${name}.log)`;
}

function jwksServe() {
  const body = fs.readFileSync(path.join(STATE, 'jwks.json'));
  http.createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
    } else res.writeHead(404).end();
  }).listen(JWKS_PORT, '127.0.0.1');
}

// ---------------------------------------------------------------- main
const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'up': await up(); break;
  case 'down': down(); break;
  case 'status': status(); break;
  case 'smoke': await smoke(); break;
  case 'smoke-db': smokeDb(); break;
  case 'token': console.log(lecturerToken(args[0])); break;
  case 'anon-token': console.log(JSON.stringify(anonToken())); break;
  case 'sql': psql(args[0]); break;
  case 'sql-as':
    if (!/^[0-9a-f-]{36}$/i.test(args[0] || '')) die(`sql-as needs a user uuid first, got: ${args[0]}`);
    psql(`begin;
    do $$ begin perform set_config('request.jwt.claims', '{"sub":"${args[0]}","role":"authenticated"}', true); end $$;
    set local role authenticated;
    ${args[1]}
    commit;`); break;
  case 'call': {
    const [method, urlPath, maybeBody] = args;
    const body = maybeBody && !maybeBody.startsWith('--') ? maybeBody : undefined;
    const r = await call(method.toUpperCase(), urlPath, body, parseAuth(args));
    console.log(r.status);
    console.log(r.json ? JSON.stringify(r.json, null, 2) : r.text);
    break;
  }
  case 'logs': console.log(tail('backend', Number(args[0] || 60))); break;
  case '_jwks-serve': jwksServe(); break;
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 23)
      .map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
}
