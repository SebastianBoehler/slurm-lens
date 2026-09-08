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
    for(const job of frame.jobs) assert.match(inspector(job,frame),/No telemetry in this recording/);
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
