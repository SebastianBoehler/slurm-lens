import {escape, stamp, active, current, terminal, table, jobButton, allocationChart, emptyMetric} from './components.js';
import {timeline, pendingList} from './timeline.js';

export const pages = {
  overview: ['Overview','Your workload, with the context to understand it.'],
  jobs: ['Jobs','Inspect resource requests, states, and what each job is waiting for.'],
  timeline: ['Allocation timeline','Follow where jobs ran and when resources were released.'],
  clusters: ['Clusters','Explore nodes observed in this recording.'],
  data: ['Available data','See what this workspace knows, and where the recording stops.'],
};

export function renderView(page, session, index) {
  const frame=session.frames[index], jobs=frame.jobs;
  if(page==='overview') return overview(session,index);
  if(page==='jobs') return `<section class="panel"><div class="toolbar"><div class="tabs" role="group" aria-label="Filter by state"><button class="tab active" data-filter="all">All jobs <span>${jobs.length}</span></button><button class="tab" data-filter="RUNNING">Running</button><button class="tab" data-filter="PENDING">Pending</button><button class="tab" data-filter="COMPLETED">Completed</button></div><label class="search"><span aria-hidden="true">⌕</span><input id="job-search" type="search" placeholder="Search name, ID, or node" aria-label="Search jobs"></label></div><div id="job-table">${table(jobs,frame)}</div></section>`;
  if(page==='timeline') return `<div class="section-title"><h2>${escape(jobs[0]?.cluster||'Recording')} <span class="muted">/ Node allocations</span></h2><div class="legend"><span><i class="swatch"></i>Running / last observed</span><span><i class="swatch finished"></i>Terminal</span></div></div><div class="timeline-layout"><section class="panel timeline-panel">${timeline(frame)}</section>${pendingList(frame)}</div>`;
  if(page==='clusters') return clusters(frame);
  return dataPage(session);
}

function overview(session,index) {
  const frame=session.frames[index], running=frame.jobs.filter(j=>active(j,frame));
  const pending=frame.jobs.filter(j=>j.state==='PENDING' && current(j,frame));
  const complete=frame.jobs.filter(j=>terminal(j));
  const allocated=running.reduce((n,j)=>n+(j.allocated?.gpus||0),0);
  const waiting=pending.filter(j=>j.dependencies.length);
  return `<div class="stats-strip">
    ${[[running.length,'Running jobs','Observed at this snapshot'],[pending.length,'Pending jobs',`${waiting.length} waiting on dependencies`],[allocated,'GPUs allocated','To observed running jobs'],[complete.length,'Terminal jobs','Retained recorded outcomes']].map(([n,label,sub])=>`<div class="stat"><span>${label}</span><strong>${n}</strong><small>${sub}</small></div>`).join('')}
  </div><div class="overview-grid"><section class="panel chart-panel"><div class="section-title"><div><h2>Allocated GPUs</h2><p class="muted">Observed counts across the recording · not utilization</p></div><a class="text-link" href="#timeline">View timeline ↗</a></div>${allocationChart(session.frames,index)}<div class="chart-caption"><span class="legend"><i class="swatch"></i>Recorded allocation</span><span>Dots are captures; intervals between them are unknown.</span></div></section>
  <section class="panel attention-panel"><div class="section-title"><h2>Queue context</h2><span class="count">${pending.length}</span></div>${waiting.length?`<div class="attention-summary"><span aria-hidden="true">↳</span><div><strong>${waiting.length} jobs waiting on predecessors</strong><p>Success dependencies control when these jobs become eligible.</p></div></div>${waiting.slice(0,2).map(j=>`<div class="attention-row">${jobButton(j)}<span>Inspect dependency →</span></div>`).join('')}`:'<div class="attention-summary"><span aria-hidden="true">✓</span><div><strong>No recorded dependency blockers</strong><p>Choose an earlier snapshot to explore the overnight queue.</p></div></div>'}<a class="text-link" href="#jobs">Explore all jobs →</a></section></div>
  <section class="panel"><div class="panel-heading"><h2>Jobs at this snapshot <span class="count">${frame.jobs.length}</span></h2><a class="text-link" href="#jobs">Filter jobs ↗</a></div>${table([...running,...pending,...frame.jobs.filter(j=>!running.includes(j)&&!pending.includes(j))],frame)}</section>
  <div class="coverage-strip"><span aria-hidden="true">◈</span><div><strong>Allocation is visible. Utilization is not collected.</strong><span> GPU activity, VRAM usage and CPU/RAM usage need a separate telemetry source.</span></div><a href="#data" class="text-link">Data coverage →</a></div>`;
}

function clusters(frame) {
  const nodes=[...new Set(frame.jobs.map(j=>j.node).filter(Boolean))].sort();
  return `<section class="panel"><div class="cluster-heading"><div class="cluster-symbol" aria-hidden="true">▧</div><div><h2>${escape(frame.jobs[0]?.cluster||'Recording')}</h2><p class="muted">${nodes.length} observed nodes · ${escape([...new Set(frame.jobs.map(j=>j.partition))].join(', '))} · Scoped recording</p></div><span class="mode">Inventory incomplete</span></div><div class="table-scroll"><table><thead><tr><th>Observed node</th><th>Running allocations</th><th>GPUs allocated</th><th>CPUs allocated</th><th>Memory allocation</th></tr></thead><tbody>${nodes.map(node=>{
    const running=frame.jobs.filter(j=>j.node===node&&active(j,frame));
    return `<tr><td><strong class="mono">${escape(node)}</strong><small>Physical capacity unknown</small></td><td>${running.length?running.map(j=>jobButton(j)).join(' · '):'<span class="muted">No observed running job</span>'}</td><td>${running.reduce((n,j)=>n+(j.allocated?.gpus||0),0)} <small>Observed, not cluster total</small></td><td>${running.reduce((n,j)=>n+(j.allocated?.cpus||0),0)}</td><td>${running.map(j=>escape(j.allocated?.memory||'Unknown')).join(' + ')||'—'}</td></tr>`;
  }).join('')}</tbody></table></div></section><div class="coverage-strip"><span aria-hidden="true">ⓘ</span><div><strong>Unobserved does not mean idle.</strong><span> Other users’ jobs, node health, free capacity and physical GPU identities are outside this recording.</span></div></div><div class="section-title lower-title"><h2>Hardware telemetry</h2><a href="#data" class="text-link">What is available? ↗</a></div><div class="missing-grid">${emptyMetric('GPU utilization','No device samples')}${emptyMetric('VRAM usage','No memory samples')}${emptyMetric('CPU utilization','No activity samples')}${emptyMetric('RAM usage','Allocation is not consumption')}</div>`;
}

function dataPage(session) {
  const rows=[['Job states and queue reasons','Recorded','From scoped scheduler responses.'],['Requests and allocations','Recorded','GPU and CPU counts; requested and allocated RAM.'],['Node placement and timestamps','Recorded','Actual starts and terminal ends where available.'],['Dependencies','Partial','Observed conditions retained after Slurm clears them; earlier edges may be absent.'],['Node capacity and physical GPU slots','Not collected','Node lanes cannot be interpreted as physical GPU lanes.'],['GPU, VRAM, CPU and RAM usage','Not collected','No hardware telemetry was included.'],['Future placement and start estimates','Not collected','Pending jobs have no assigned timeline position.'],['Other users and cluster-wide inventory','Not collected','This recording covers one research workload.']];
  return `<section class="panel source-panel"><div class="section-title"><div><h2>${escape(session.title)}</h2><p class="muted">${session.frames.length} snapshots · ${stamp(session.frames[0].captured_at)} — ${stamp(session.frames.at(-1).captured_at)}</p></div><a class="button" href="/api/session" download="slurm-lens-session.json">↓ Export recording</a></div><p>${escape(session.description)}</p><div class="source-facts"><span>Source <strong>Recorded Slurm responses</strong></span><span>Connection <strong>Offline / local</strong></span><span>Time zone <strong>UTC</strong></span></div></section><section class="panel"><div class="panel-heading"><h2>Data coverage</h2></div><div class="table-scroll"><table><thead><tr><th>Information</th><th>Availability</th><th>What it means</th></tr></thead><tbody>${rows.map(([name,state,desc])=>`<tr><td><strong>${name}</strong></td><td><span class="badge ${state==='Recorded'?'completed':state==='Partial'?'pending':'neutral'}">${state}</span></td><td>${desc}</td></tr>`).join('')}</tbody></table></div></section>`;
}
