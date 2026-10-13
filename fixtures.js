/* r1 ORBIT companion P0: the synthetic world. Nothing here is real ORBIT data; every person, Orbit, creation, file
 * and job is made up. The public name is 0xstuff. Times are fixed so checks are repeatable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R1P0Fixtures = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NOW = Date.parse('2026-10-13T06:00:00Z');
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const ago = (ms) => new Date(NOW - ms).toISOString();

  // Small synthetic previews (inline SVG, allowed by the page's img-src data:).
  function preview(label, bg, fg) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72" viewBox="0 0 96 72">'
      + '<rect width="96" height="72" rx="6" fill="' + bg + '"/>'
      + '<circle cx="72" cy="22" r="10" fill="' + fg + '" opacity="0.7"/>'
      + '<path d="M0 60 L30 34 L52 52 L66 42 L96 64 L96 72 L0 72 Z" fill="' + fg + '" opacity="0.55"/>'
      + '<text x="8" y="18" font-family="sans-serif" font-size="11" fill="' + fg + '">' + label + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function world() {
    return {
      now: NOW,
      session: { sub: 'void:0xstuff' },
      offline: false,
      faults: { loseNextAnswer: false, reuseKeyWithDifferentText: false },
      people: {
        'void:0xstuff': '0xstuff', 'void:mika': 'Mika', 'void:juno': 'Juno', 'void:ren': 'Ren', 'void:sol': 'Sol',
      },
      orbits: [
        { id: 'orb_northwind', name: 'Northwind Studio' },
        { id: 'orb_fieldnotes', name: 'Field Notes' },
        { id: 'orb_quiet', name: 'Quiet Room' },
      ],
      // Orbit roles: OWNER | ADMIN | MEMBER | VIEWER (api/lib/orbit-tenancy.ts:4).
      memberships: [
        { orbit_id: 'orb_northwind', void_id: 'void:0xstuff', role: 'MEMBER' },
        { orbit_id: 'orb_northwind', void_id: 'void:mika', role: 'MEMBER' },
        { orbit_id: 'orb_northwind', void_id: 'void:juno', role: 'ADMIN' },
        { orbit_id: 'orb_northwind', void_id: 'void:ren', role: 'MEMBER' },
        { orbit_id: 'orb_northwind', void_id: 'void:sol', role: 'MEMBER' },
        { orbit_id: 'orb_fieldnotes', void_id: 'void:0xstuff', role: 'VIEWER' },
        { orbit_id: 'orb_fieldnotes', void_id: 'void:ren', role: 'OWNER' },
        { orbit_id: 'orb_quiet', void_id: 'void:juno', role: 'OWNER' },
      ],
      projects: [
        { id: 'prj_spring', orbit_id: 'orb_northwind', title: 'Spring campaign', audience: 'ORBIT', updated_at: ago(12 * MIN) },
        { id: 'prj_film', orbit_id: 'orb_northwind', title: 'Launch film', audience: 'ORBIT', updated_at: ago(40 * MIN) },
        { id: 'prj_board', orbit_id: 'orb_northwind', title: 'Board pack', audience: 'INVITED', updated_at: ago(5 * MIN) },
        { id: 'prj_trail', orbit_id: 'orb_fieldnotes', title: 'Trail map', audience: 'ORBIT', updated_at: ago(3 * HOUR) },
        { id: 'prj_quiet', orbit_id: 'orb_quiet', title: 'Quiet plans', audience: 'ORBIT', updated_at: ago(2 * MIN) },
      ],
      // Creation roles: MANAGER | CONTRIBUTOR | READER (api/lib/orbit-project-access.ts:7).
      grants: [
        { project_id: 'prj_spring', void_id: 'void:0xstuff', role: 'CONTRIBUTOR' },
        { project_id: 'prj_spring', void_id: 'void:mika', role: 'CONTRIBUTOR' },
        { project_id: 'prj_spring', void_id: 'void:juno', role: 'MANAGER' },
        { project_id: 'prj_spring', void_id: 'void:ren', role: 'CONTRIBUTOR' },
        { project_id: 'prj_film', void_id: 'void:0xstuff', role: 'MANAGER' },
        { project_id: 'prj_film', void_id: 'void:sol', role: 'CONTRIBUTOR' },
        { project_id: 'prj_film', void_id: 'void:juno', role: 'CONTRIBUTOR' },
        { project_id: 'prj_board', void_id: 'void:juno', role: 'MANAGER' },
        { project_id: 'prj_trail', void_id: 'void:0xstuff', role: 'CONTRIBUTOR' },
        { project_id: 'prj_trail', void_id: 'void:ren', role: 'MANAGER' },
      ],
      tasks: [
        { id: 'tsk_poster', project_id: 'prj_spring', title: 'Poster round 2' },
        { id: 'tsk_copy', project_id: 'prj_spring', title: 'Copy pass' },
        { id: 'tsk_print', project_id: 'prj_spring', title: 'Print check' },
        { id: 'tsk_cutdown', project_id: 'prj_film', title: 'Cut-down notes' },
        { id: 'tsk_frames', project_id: 'prj_film', title: 'Storyboard frames' },
        { id: 'tsk_grade', project_id: 'prj_film', title: 'Colour grade' },
      ],
      // The latest handoff of each step. States as in task-handoffs.ts; "members" is the working group.
      handoffs: [
        { id: 'hnd_poster', task_id: 'tsk_poster', state: 'ASSIGNED', version: 3, members: ['void:0xstuff', 'void:mika'], reviewer: 'void:juno', alone: false },
        { id: 'hnd_copy', task_id: 'tsk_copy', state: 'SUBMITTED', version: 5, members: ['void:mika', 'void:ren'], reviewer: 'void:0xstuff', alone: false },
        { id: 'hnd_print', task_id: 'tsk_print', state: 'ASSIGNED', version: 2, members: ['void:ren'], reviewer: 'void:juno', alone: false },
        { id: 'hnd_cutdown', task_id: 'tsk_cutdown', state: 'CHANGES_REQUESTED', version: 4, members: ['void:0xstuff', 'void:sol'], reviewer: 'void:juno', alone: false },
        { id: 'hnd_frames', task_id: 'tsk_frames', state: 'ASSIGNED', version: 1, members: ['void:0xstuff'], reviewer: 'void:0xstuff', alone: true },
        { id: 'hnd_grade', task_id: 'tsk_grade', state: 'ACCEPTED', version: 6, members: ['void:0xstuff', 'void:sol'], reviewer: 'void:juno', alone: false },
      ],
      handoffEvents: [
        { handoff_id: 'hnd_poster', version: 2, kind: 'CONTRIBUTED', actor: 'void:mika', at: ago(25 * MIN), text: 'Added the warm palette option.' },
        { handoff_id: 'hnd_poster', version: 3, kind: 'CONTRIBUTED', actor: 'void:0xstuff', at: ago(14 * MIN), text: 'poster-round2.jpg v2 is in the step folder.' },
        { handoff_id: 'hnd_copy', version: 5, kind: 'SUBMITTED', actor: 'void:mika', at: ago(50 * MIN), text: 'Copy deck ready for a yes.' },
        { handoff_id: 'hnd_print', version: 2, kind: 'CONTRIBUTED', actor: 'void:ren', at: ago(9 * MIN), text: 'Print proof uploaded.' },
        { handoff_id: 'hnd_cutdown', version: 4, kind: 'CHANGES_REQUESTED', actor: 'void:juno', at: ago(70 * MIN), text: 'Shorter intro, please.' },
        { handoff_id: 'hnd_grade', version: 6, kind: 'ACCEPTED', actor: 'void:juno', at: ago(2 * HOUR), text: 'Looks right.' },
      ],
      // Files: folder 'root' is the creation's main folder; otherwise the step (task) id. Version reasons as in 0308.
      files: [
        { id: 'fil_moodboard', project_id: 'prj_spring', folder: 'root', versions: [
          { v: 1, name: 'moodboard.png', type: 'image/png', size: 812344, sha: '3b1f09c2…7d4e', at: ago(5 * HOUR), by: 'void:juno', why: 'UPLOADED' },
          { v: 2, name: 'moodboard.png', type: 'image/png', size: 845120, sha: 'a90c11e8…02bf', at: ago(31 * MIN), by: 'void:juno', why: 'GENERATED' } ],
          preview: preview('moodboard', '#26324a', '#ffb36b') },
        { id: 'fil_poster', project_id: 'prj_spring', folder: 'tsk_poster', versions: [
          { v: 1, name: 'poster-round2.jpg', type: 'image/jpeg', size: 1204118, sha: '5e2d7a10…c3a9', at: ago(45 * MIN), by: 'void:mika', why: 'UPLOADED' },
          { v: 2, name: 'poster-round2.jpg', type: 'image/jpeg', size: 1219004, sha: 'd41c88f3…91e0', at: ago(15 * MIN), by: 'void:0xstuff', why: 'UPLOADED' } ],
          preview: preview('poster', '#3a2340', '#7fe0c4') },
        { id: 'fil_copy', project_id: 'prj_spring', folder: 'tsk_copy', versions: [
          { v: 1, name: 'copy-deck.pdf', type: 'application/pdf', size: 402771, sha: '77ab0c1d…e8f2', at: ago(55 * MIN), by: 'void:ren', why: 'UPLOADED' } ] },
        { id: 'fil_print', project_id: 'prj_spring', folder: 'tsk_print', versions: [
          { v: 1, name: 'print-proof.png', type: 'image/png', size: 2210334, sha: '0c9e4b21…5a77', at: ago(9 * MIN), by: 'void:ren', why: 'UPLOADED' } ],
          preview: preview('proof', '#1d3a2b', '#f2e86d') },
        { id: 'fil_cutdown', project_id: 'prj_film', folder: 'tsk_cutdown', versions: [
          { v: 1, name: 'cutdown-notes.txt', type: 'text/plain', size: 3120, sha: '19f0e2aa…4c61', at: ago(80 * MIN), by: 'void:sol', why: 'UPLOADED' },
          { v: 2, name: 'cutdown-notes.txt', type: 'text/plain', size: 2904, sha: 'b8d3c4e1…0a19', at: ago(35 * MIN), by: 'void:0xstuff', why: 'UPLOADED' } ] },
        { id: 'fil_story', project_id: 'prj_film', folder: 'root', versions: [
          { v: 1, name: 'storyboard.png', type: 'image/png', size: 1630020, sha: '6a7f3e90…b2d8', at: ago(40 * MIN), by: 'void:0xstuff', why: 'UPLOADED' } ],
          preview: preview('storyboard', '#2b2b2b', '#9ec5ff') },
        { id: 'fil_frame', project_id: 'prj_film', folder: 'tsk_frames', versions: [
          { v: 1, name: 'frame-04.png', type: 'image/png', size: 540001, sha: 'f00d4c3b…11a2', at: ago(3 * HOUR), by: 'void:0xstuff', why: 'UPLOADED' } ],
          preview: preview('frame 04', '#402a1d', '#ffd5a8') },
        { id: 'fil_grade', project_id: 'prj_film', folder: 'tsk_grade', versions: [
          { v: 1, name: 'grade-still.png', type: 'image/png', size: 990432, sha: '2c6e8d0f…7b35', at: ago(2.5 * HOUR), by: 'void:sol', why: 'UPLOADED' } ],
          preview: preview('grade', '#1f2f3f', '#c0f0ff') },
        { id: 'fil_trail', project_id: 'prj_trail', folder: 'root', versions: [
          { v: 1, name: 'trail-map.png', type: 'image/png', size: 701220, sha: '8e1a2b3c…9d0e', at: ago(3 * HOUR), by: 'void:ren', why: 'UPLOADED' } ],
          preview: preview('trail', '#203a20', '#e0ffe0') },
        { id: 'fil_quiet', project_id: 'prj_quiet', folder: 'root', versions: [
          { v: 1, name: 'quiet.png', type: 'image/png', size: 100200, sha: '4d4d4d4d…0000', at: ago(2 * MIN), by: 'void:juno', why: 'UPLOADED' } ] },
      ],
      // Job and run states use ORBIT's state names (db 0306/0310, cowork-runs.ts).
      jobs: [
        { id: 'job_variations', project_id: 'prj_spring', kind: 'MEDIA', title: 'Poster variations (image)', state: 'DELIVERED', at: ago(30 * MIN) },
        { id: 'job_retry', project_id: 'prj_spring', kind: 'MEDIA', title: 'Banner draft (image)', state: 'UNCERTAIN', at: ago(20 * MIN) },
        { id: 'run_bounded', project_id: 'prj_film', kind: 'RUN', title: 'Bounded Python run', state: 'RUNNING', at: ago(6 * MIN) },
        { id: 'job_quiet', project_id: 'prj_quiet', kind: 'MEDIA', title: 'Quiet job', state: 'DELIVERED', at: ago(1 * MIN) },
      ],
    };
  }

  return { NOW, MIN, HOUR, world };
});
