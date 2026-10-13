/* r1 ORBIT companion P0: the SYNTHETIC adapter. It answers from the in-memory world in fixtures.js and never touches
 * the network. Each call mirrors the shape and the permission order of a real ORBIT route at production de08b9ab
 * (cited per call), so the companion can be pointed at a real adapter later without changing its screens.
 * Where the real rule is only approximated, the comment says "approximation". */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R1P0Adapter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINK_SECONDS = 300; // presigned download links last 300 s (routes/files.ts:1-17)
  const PAGE = 6;           // changes per page (the real composite does not exist yet)
  const OPEN_STATES = ['ASSIGNED', 'CHANGES_REQUESTED'];        // SUBMITTED allowed only here (task-handoffs.ts:179)
  const CLOSED_STATES = ['ACCEPTED', 'LANDED', 'CANCELLED'];     // step folder no longer writable (0299:102-117)

  class AdapterError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
    toJSON() { return { status: this.status, code: this.code, message: this.message }; }
  }
  // Hidden and missing answer the same thing (ORBIT answers 404 for both).
  const notAvailable = () => new AdapterError(404, 'NOT_FOUND', 'Not available.');

  function create(world) {
    const log = [];
    const sentCanonical = new Map(); // `${handoff}|${actor}|${key}` -> canonical body (the real route stores a digest)
    let lastKey = null;

    const iso = () => new Date(world.now).toISOString();
    const name = (id) => world.people[id] || 'Someone';
    const orbitRole = (orbitId, who) => (world.memberships.find((m) => m.orbit_id === orbitId && m.void_id === who) || {}).role || null;
    const project = (id) => world.projects.find((p) => p.id === id) || null;
    const task = (id) => world.tasks.find((t) => t.id === id) || null;
    const handoffOf = (taskId) => world.handoffs.find((h) => h.task_id === taskId) || null;
    const file = (id) => world.files.find((f) => f.id === id) || null;

    // resolveProjectAccess (orbit-project-access.ts:17-42), approximated: an Orbit member reads an ORBIT-audience
    // creation as READER without a grant; any other audience needs a grant; an Orbit VIEWER is capped at READER.
    function access(projectId, who) {
      const p = project(projectId);
      if (!p) return null;
      const oRole = orbitRole(p.orbit_id, who);
      if (!oRole) return null;
      const grant = world.grants.find((g) => g.project_id === projectId && g.void_id === who);
      let role = grant ? grant.role : (p.audience === 'ORBIT' ? 'READER' : null);
      if (!role) return null;
      if (oRole === 'VIEWER') role = 'READER';
      return { project: p, orbitRole: oRole, role, manager: role === 'MANAGER', canWrite: role === 'MANAGER' || role === 'CONTRIBUTOR' };
    }
    // canReadFolder (lib/files.ts:76-81): main folder for anyone with access; a step folder for managers or people live
    // in the step's current group. Approximation: the group is the latest handoff's members plus its reviewer.
    function canReadFolder(acc, folder, who) {
      if (folder === 'root') return true;
      if (acc.manager) return Boolean(task(folder));
      if (acc.orbitRole === 'VIEWER' || !acc.canWrite) return false;
      const h = handoffOf(folder);
      return Boolean(h && (h.members.includes(who) || h.reviewer === who));
    }
    // orbit_file_can_write (0299_creation_files.sql:102-117), approximated: main folder = a MANAGER who isn't an Orbit
    // VIEWER; a step folder = a member of its latest handoff while that handoff isn't ACCEPTED/LANDED/CANCELLED.
    function canWriteFolder(acc, folder, who) {
      if (acc.orbitRole === 'VIEWER') return false;
      if (folder === 'root') return acc.manager;
      const h = handoffOf(folder);
      return Boolean(h && acc.canWrite && h.members.includes(who) && !CLOSED_STATES.includes(h.state));
    }

    function begin(op, viewer, viewerCode) {
      const entry = { op, at: iso(), ok: false, status: 0 };
      log.push(entry);
      if (world.offline) { entry.status = 0; throw new AdapterError(0, 'OFFLINE', 'No connection.'); }
      if (viewer !== world.session.sub) {
        entry.status = 409;
        // /me/projects answers IDENTITY_CHANGED (me-projects.ts:28); Files writes answer VIEWER_CHANGED (files.ts:74).
        throw new AdapterError(409, viewerCode, 'The signed-in account changed. Start again.');
      }
      return entry;
    }
    const done = (entry, value) => { entry.ok = true; entry.status = 200; return value; };
    const fail = (entry, err) => { entry.status = err.status; throw err; };

    const api = {
      log,
      world,

      /** Who the session is (stand-in for the signed-in account; the real app reads it from the session). */
      async whoami() {
        if (world.offline) throw new AdapterError(0, 'OFFLINE', 'No connection.');
        return { sub: world.session.sub, name: name(world.session.sub) };
      },

      /** GET /me/projects?scope=all (routes/me-projects.ts): creations across the person's current Orbit memberships. */
      async listCreations({ viewer }) {
        const entry = begin('listCreations', viewer, 'IDENTITY_CHANGED');
        const projects = world.projects.map((p) => ({ p, a: access(p.id, viewer) })).filter((x) => x.a)
          .sort((x, y) => (x.p.updated_at < y.p.updated_at ? 1 : -1))
          .map(({ p, a }) => ({ project_id: p.id, orbit_id: p.orbit_id,
            orbit_name: (world.orbits.find((o) => o.id === p.orbit_id) || {}).name, title: p.title, role: a.role, updated_at: p.updated_at }));
        return done(entry, { projects });
      },

      /** COMPOSED READ: there is no single "what changed" endpoint in ORBIT. A real adapter would combine a file's
       * versions (GET …/files/:fileId/versions), the step handoffs (GET …/tasks/:t/handoffs) and job status reads. */
      async whatChanged({ viewer, project_id, since, cursor }) {
        const entry = begin('whatChanged', viewer, 'VIEWER_CHANGED');
        const acc = access(project_id, viewer);
        if (!acc) fail(entry, notAvailable());
        const items = [];
        for (const f of world.files.filter((x) => x.project_id === project_id)) {
          if (!canReadFolder(acc, f.folder, viewer)) continue;
          for (const v of f.versions) if (v.at > since) items.push({ kind: 'FILE_VERSION', at: v.at,
            title: v.name + ' v' + v.v, detail: (v.why === 'GENERATED' ? 'Generated' : 'Saved') + ' by ' + name(v.by),
            ref: { file_id: f.id, v: v.v } });
        }
        for (const ev of world.handoffEvents) {
          const h = world.handoffs.find((x) => x.id === ev.handoff_id);
          const t = h && task(h.task_id);
          if (!t || t.project_id !== project_id || !canReadFolder(acc, t.id, viewer) || !(ev.at > since)) continue;
          items.push({ kind: 'HANDOFF_EVENT', at: ev.at, title: t.title + ': ' + words(ev.kind), detail: 'by ' + name(ev.actor),
            ref: { task_id: t.id } });
        }
        for (const j of world.jobs.filter((x) => x.project_id === project_id)) {
          if (j.at > since) items.push({ kind: 'JOB_STATE', at: j.at, title: j.title, detail: words(j.state), ref: { job_id: j.id } });
        }
        items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        const start = cursor ? Number(cursor) : 0;
        const page = items.slice(start, start + PAGE);
        return done(entry, { items: page, cursor: start + PAGE < items.length ? String(start + PAGE) : null, total: items.length });
      },

      /** GET …/files/folders/:folder for each readable folder (routes/files.ts:1-17): current version of each file. */
      async listFiles({ viewer, project_id }) {
        const entry = begin('listFiles', viewer, 'VIEWER_CHANGED');
        const acc = access(project_id, viewer);
        if (!acc) fail(entry, notAvailable());
        const files = world.files.filter((f) => f.project_id === project_id && canReadFolder(acc, f.folder, viewer)).map((f) => {
          const cur = f.versions[f.versions.length - 1];
          return { file_id: f.id, name: cur.name, v: cur.v, type: cur.type, at: cur.at,
            folder_name: f.folder === 'root' ? 'Main folder' : task(f.folder).title };
        }).sort((a, b) => (a.at < b.at ? 1 : -1));
        return done(entry, { files });
      },

      /** GET …/files/:fileId/versions/:v/download: a link valid 300 s, after the read checks. Real Files GETs do not
       * check X-ORBIT-Viewer (files.ts:72), so a real client must confirm the account separately; this one does. */
      async openFile({ viewer, project_id, file_id, v }) {
        const entry = begin('openFile', viewer, 'VIEWER_CHANGED');
        const acc = access(project_id, viewer);
        const f = file(file_id);
        if (!acc || !f || f.project_id !== project_id || !canReadFolder(acc, f.folder, viewer)) fail(entry, notAvailable());
        const ver = f.versions.find((x) => x.v === v);
        if (!ver) fail(entry, notAvailable());
        const cur = f.versions[f.versions.length - 1];
        const p = acc.project;
        const t = f.folder === 'root' ? null : task(f.folder);
        return done(entry, {
          file: { file_id: f.id, current_v: cur.v, folder: f.folder, folder_name: t ? t.title : 'Main folder' },
          version: { v: ver.v, name: ver.name, type: ver.type, size: ver.size, sha: ver.sha, at: ver.at, by: name(ver.by), why: ver.why },
          link: { href: 'synthetic://download/' + f.id + '/' + ver.v, expires_at: new Date(world.now + LINK_SECONDS * 1000).toISOString() },
          preview: ver.type.startsWith('image/') ? (f.preview || null) : null,
          // Directions only: no token, no fabricated deep link (ORBIT's exact page path is not part of P0).
          phone: { orbit_name: (world.orbits.find((o) => o.id === p.orbit_id) || {}).name, creation: p.title,
            place: t ? t.title : 'Main folder', file: ver.name, v: ver.v },
        });
      },

      /** What the File screen may offer. A precheck only: simulateSubmit re-checks everything, as the server would. */
      async handoffOptions({ viewer, project_id, file_id }) {
        const entry = begin('handoffOptions', viewer, 'VIEWER_CHANGED');
        const acc = access(project_id, viewer);
        const f = file(file_id);
        if (!acc || !f || f.project_id !== project_id || !canReadFolder(acc, f.folder, viewer)) fail(entry, notAvailable());
        const say = (code, reason, h) => done(entry, { simulated: { allowed: !code, code, reason, handoff: h ? view(h) : null } });
        if (!acc.canWrite || acc.orbitRole === 'VIEWER') return say('READ_ONLY', 'You can read this creation but not add to it.');
        if (f.folder === 'root') return say('MAIN_FOLDER', 'Saved in the main folder. A hand-off starts from a step.');
        const h = handoffOf(f.folder);
        if (!h) return say('NO_STEP', 'This step has no working group yet.');
        if (h.alone) return say('WORKING_ALONE', 'You are making this alone, so there is nobody to send it to for a yes.', h);
        if (h.reviewer === viewer) return say('YOU_REVIEW', 'You are the one who says yes to this. Do that in ORBIT.', h);
        if (!h.members.includes(viewer)) return say('NOT_IN_GROUP', 'Only this working group can send it on.', h);
        if (!OPEN_STATES.includes(h.state)) return say('STEP_CLOSED', 'This step is ' + words(h.state).toLowerCase() + '.', h);
        if (!canWriteFolder(acc, f.folder, viewer)) return say('READ_ONLY', 'You can no longer add to this step.', h);
        return say(null, null, h);
      },

      /** SIMULATED POST …/tasks/:t/handoffs/:id/events {kind:'SUBMITTED'} (task-handoffs.ts). Same checks, same order:
       * write access (:115), request-id replay (:164-165), version (:166), working alone (:173), submit rule (:179),
       * text (:205). Nothing leaves this page; the result lives in the synthetic world only. */
      async simulateSubmit({ viewer, project_id, task_id, handoff_id, text, expected_version, client_request_id }) {
        const entry = begin('simulateSubmit', viewer, 'VIEWER_CHANGED');
        const acc = access(project_id, viewer);
        const t = task(task_id);
        const h = world.handoffs.find((x) => x.id === handoff_id);
        if (!acc || !t || t.project_id !== project_id || !h || h.task_id !== task_id) fail(entry, notAvailable());
        if (!acc.canWrite || acc.orbitRole === 'VIEWER') fail(entry, new AdapterError(403, 'FORBIDDEN', 'Project write permission is required.'));
        const canonical = JSON.stringify({ kind: 'SUBMITTED', text, expected_version });
        const slot = handoff_id + '|' + viewer + '|' + client_request_id;
        if (sentCanonical.has(slot)) {
          if (sentCanonical.get(slot) === canonical) return done(entry, { handoff: view(h), replayed: true });
          fail(entry, new AdapterError(409, 'REQUEST_ID_REUSED', 'This request ID was already used for a different action.'));
        }
        if (h.version !== expected_version) fail(entry, new AdapterError(409, 'HANDOFF_CHANGED', 'This handoff changed. Refresh it before acting.'));
        if (h.alone) fail(entry, new AdapterError(409, 'WORKING_ALONE', 'You’re making this alone, so there’s nobody to send it to for a yes.'));
        if (!h.members.includes(viewer) || h.reviewer === viewer || !OPEN_STATES.includes(h.state)) {
          fail(entry, new AdapterError(409, 'SUBMIT_REFUSED', 'A group member other than the reviewer submits the combined result while the step is open.'));
        }
        if (!String(text || '').trim()) fail(entry, new AdapterError(409, 'TEXT_REQUIRED', 'Add the result or explain the requested changes.'));
        h.version += 1;
        h.state = 'SUBMITTED';
        world.handoffEvents.push({ handoff_id: h.id, version: h.version, kind: 'SUBMITTED', actor: viewer, at: iso(), text, simulated: true });
        sentCanonical.set(slot, canonical);
        lastKey = client_request_id;
        if (world.faults.loseNextAnswer) {
          world.faults.loseNextAnswer = false;
          entry.status = 0;
          throw new AdapterError(0, 'ANSWER_LOST', 'No answer came back. It may or may not have been sent.');
        }
        return done(entry, { handoff: view(h), replayed: false });
      },

      lastRequestKey() { return lastKey; },
      submittedCount(handoffId) { return world.handoffEvents.filter((e) => e.handoff_id === handoffId && e.kind === 'SUBMITTED' && e.simulated).length; },

      // ---- world changes for the harness and the checks (never available to the device screens) ----
      control: {
        setOffline(value) { world.offline = Boolean(value); },
        setGrant(projectId, who, role) {
          world.grants = world.grants.filter((g) => !(g.project_id === projectId && g.void_id === who));
          if (role) world.grants.push({ project_id: projectId, void_id: who, role });
        },
        setOrbitRole(orbitId, who, role) {
          world.memberships = world.memberships.filter((m) => !(m.orbit_id === orbitId && m.void_id === who));
          if (role) world.memberships.push({ orbit_id: orbitId, void_id: who, role });
        },
        closeHandoff(handoffId, state, actor) {
          const h = world.handoffs.find((x) => x.id === handoffId);
          h.version += 1; h.state = state || 'ACCEPTED';
          world.handoffEvents.push({ handoff_id: h.id, version: h.version, kind: h.state, actor: actor || h.reviewer, at: iso(), text: '' });
        },
        contribute(handoffId, actor) {
          const h = world.handoffs.find((x) => x.id === handoffId);
          h.version += 1;
          world.handoffEvents.push({ handoff_id: h.id, version: h.version, kind: 'CONTRIBUTED', actor: actor || h.members[0], at: iso(), text: 'More added.' });
        },
        saveNewVersion(fileId, actor) {
          const f = file(fileId);
          const cur = f.versions[f.versions.length - 1];
          f.versions.push(Object.assign({}, cur, { v: cur.v + 1, at: iso(), by: actor || 'void:mika', size: cur.size + 1024, sha: 'e0e0e0e0…' + String(cur.v + 1).padStart(4, '0') }));
        },
        switchAccount(sub) { world.session.sub = sub; },
        advance(ms) { world.now += ms; },
        fault(name, value) { world.faults[name] = value !== false; },
      },
    };

    function view(h) {
      const t = task(h.task_id);
      return { handoff_id: h.id, task_id: h.task_id, step: t ? t.title : '', state: h.state, version: h.version,
        reviewer_name: name(h.reviewer) };
    }
    return api;
  }

  // Plain words for ORBIT states (the app's own words differ in places; these are P0's).
  function words(state) {
    return ({ ASSIGNED: 'Assigned', CONTRIBUTED: 'Added to', SUBMITTED: 'Sent for a yes', CHANGES_REQUESTED: 'Changes asked for',
      ACCEPTED: 'Accepted', LANDED: 'Landed', CANCELLED: 'Cancelled', DELIVERED: 'Delivered', RUNNING: 'Running',
      QUEUED: 'Queued', FAILED: 'Failed', STOPPED: 'Stopped', UNCERTAIN: 'Not confirmed either way', EXPIRED: 'Expired' })[state] || state;
  }

  return { create, AdapterError, words, LINK_SECONDS, PAGE };
});
