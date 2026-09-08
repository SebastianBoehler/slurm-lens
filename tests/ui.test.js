import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderView, pages} from '../web/views.js';
import {inspector} from '../web/inspector.js';
import {packAllocations} from '../web/layout.js';
import {active} from '../web/components.js';

const session=JSON.parse(readFileSync(new URL('../examples/session.json',import.meta.url)));

test('all recorded frames render, including dependencies and missing telemetry',()=>{
  for(const [index,frame] of session.frames.entries()) {
    for(const page of Object.keys(pages)) assert.ok(renderView(page,session,index).length>100);
    for(const job of frame.jobs) assert.match(inspector(job,frame),/No per-job device attribution/);
  }
});

test('concurrent jobs on one node never obscure one another',()=>{
  for(const frame of session.frames) {
    for(const node of new Set(frame.jobs.map(j=>j.node).filter(Boolean))) {
      const {placements}=packAllocations(frame.jobs.filter(j=>j.node===node&&j.started_at));
      for(let a=0;a<placements.length;a++) for(let b=a+1;b<placements.length;b++) {
        const x=placements[a], y=placements[b];
        const overlap=Date.parse(x.job.started_at)<Date.parse(y.job.ended_at||y.job.observed_at)&&Date.parse(y.job.started_at)<Date.parse(x.job.ended_at||x.job.observed_at);
        if(overlap) assert.ok(x.column+x.span<=y.column||y.column+y.span<=x.column);
      }
    }
  }
});

test('untrusted labels render as text, never executable markup',()=>{
  const frame=structuredClone(session.frames[0]);
  frame.jobs[0].name='<img src=x onerror=alert(1)>';
  const html=inspector(frame.jobs[0],frame);
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
});

test('a stale running observation is not counted as currently allocated',()=>{
  const frame=session.frames[0];
  const job=structuredClone(frame.jobs.find(j=>active(j,frame)));
  job.observed_at='2026-08-17T20:00:00Z';
  assert.equal(active(job,frame),false);
});

const {mergeUpdate,healthLabel}=await import('../web/live-state.js');
test('live history is bounded, deduplicates reconnects, and leaves paused data untouched',()=>{
  const paused={frames:[{captured_at:'2026-09-08T10:00:00Z',jobs:[]}]};
  const update={cluster:'test',history_frames:2,frame:{captured_at:'2026-09-08T10:01:00Z',jobs:[]}};
  let cache=mergeUpdate(paused,update);cache=mergeUpdate(cache,update);
  assert.equal(cache.frames.length,2);assert.equal(paused.frames.length,1);
  cache=mergeUpdate(cache,{...update,frame:{captured_at:'2026-09-08T10:02:00Z',jobs:[]}});
  assert.equal(cache.frames[0].captured_at,'2026-09-08T10:01:00Z');
});
test('live health never labels a disconnected or expired observation live',()=>{
  const update={poll_seconds:10,scheduler:{last_success:'2026-09-08T10:00:00Z',error:null}};
  assert.match(healthLabel(update,true),/Disconnected/);
  assert.match(healthLabel(update,false,Date.parse('2026-09-08T10:01:00Z')),/Stale/);
});
test('live inventory and telemetry labels are escaped and zero remains measured zero',()=>{
  const live={...structuredClone(session),live:true};
  live.frames[0].inventory=[{name:'<img>',state:'IDLE',architecture:'x86',cpus:64,memory_mib:1024,gres:'gpu:4',gres_used:''}];
  live.frames[0].metrics=[{target:'<script>',kind:'GPU utilization (%)',device:'GPU-1',value:0,sampled_at:live.frames[0].captured_at}];
  const html=renderView('clusters',live,0);
  assert.match(html,/&lt;img&gt;/);assert.match(html,/&lt;script&gt;/);assert.match(html,/>0<\/td>/);
  assert.ok(!html.includes('<script>'));
});


test('Slurm state flags retain the pending category and queue reason',async()=>{
  const {badge,reason}=await import('../web/components.js');
  const frame=structuredClone(session.frames[0]);
  const job=frame.jobs.find(j=>j.state==='PENDING');
  job.state='PENDING+REQUEUE_HOLD';job.reason='Dependency';
  assert.match(badge(job,frame),/badge pending/);
  assert.equal(reason(job),'Waiting for predecessor');
  assert.match(renderView('timeline',{...session,frames:[frame]},0),/Waiting for allocation/);
});
