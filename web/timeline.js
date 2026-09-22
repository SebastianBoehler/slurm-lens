import {hasState, escape, time, stamp, active, current, terminal, jobButton, badge} from './components.js';
import {packAllocations} from './layout.js';

export function timetableFrame(session,index) {
  const jobs=new Map();
  for(const frame of session.frames.slice(0,index+1)) for(const job of frame.jobs) {
    const key=JSON.stringify([job.cluster,job.id]);
    if(!jobs.has(key)||jobs.get(key).observed_at<=job.observed_at)jobs.set(key,job);
  }
  return {...session.frames[index],jobs:[...jobs.values()]};
}

export function timeline(frame, compact=false, rangeHours=0) {
  const cutoff=rangeHours?Date.parse(frame.captured_at)-rangeHours*3600000:-Infinity;
  const allocated = frame.jobs.filter(j=>j.node && j.started_at && Date.parse(j.ended_at||j.observed_at)>cutoff);
  const nodes = [...new Set(allocated.map(j=>j.node))].sort();
  const end = new Date(frame.captured_at).getTime();
  const earliest = Math.min(end-3600000,...allocated.map(j=>new Date(j.started_at).getTime()));
  const start = rangeHours?cutoff:Math.floor(earliest/3600000)*3600000;
  const hours = (end-start)/3600000;
  const height = compact ? 300 : Math.max(380,Math.min(12000,hours*68));
  const top = date => Math.max(0,Math.min(height,(new Date(date).getTime()-start)/(end-start)*height));
  if (!nodes.length) return '<div class="empty">No known node allocations overlap this time range.</div>';
  const ticks=[];
  for(let t=start;t<end;t+=(hours<=1?900000:hours>12?10800000:3600000)) ticks.push(`<div class="time-tick" style="top:${top(t)}px"><span>${hours>24?stamp(t):time(t)}</span></div>`);
  const lanes=nodes.map(node=> {
    const jobs=allocated.filter(j=>j.node===node);
    const {columns,placements}=packAllocations(jobs);
    return `<div class="node-lane"><div class="lane-heading"><strong>${escape(node)}</strong><small>Observed allocations</small></div><div class="lane-body" style="height:${height}px;background-size:100% ${height/hours}px">${placements.map(({job:j,column,span})=>{
      const finish=j.ended_at || j.observed_at;
      const actualHeight=Math.max(2,top(finish)-top(j.started_at));
      const small=actualHeight<36;
      return `<button data-job="${escape(j.id)}" data-cluster="${escape(j.cluster)}" class="allocation ${terminal(j)?'finished':''} ${small?'brief':''}" style="top:${top(j.started_at)}px;height:${actualHeight}px;left:calc(${column/columns*100}% + 6px);width:calc(${span/columns*100}% - 12px)" aria-label="${escape(j.name)}, ${j.allocated?.gpus ?? '?'} GPU, ${time(j.started_at)} to ${time(finish)}${small?', brief allocation':''}" title="${escape(j.name)} · ${time(j.started_at)}–${time(finish)}"><strong>${escape(j.name)}</strong><span>${j.allocated?.gpus ?? '?'} GPU allocated</span>${!small?`<small>${time(j.started_at)} — ${j.ended_at?time(j.ended_at):active(j,frame)?'last update':time(j.observed_at)}</small>`:''}</button>`;
    }).join('')}</div></div>`;
  }).join('');
  return `<div class="timeline-scroll" tabindex="0" role="region" aria-label="Scrollable job timetable"><div class="timeline-canvas" style="--lanes:${nodes.length}"><div class="time-axis"><div class="lane-heading">UTC</div><div class="ticks" style="height:${height}px">${ticks.join('')}</div></div>${lanes}<div class="capture-line"><span>LAST UPDATE ${time(frame.captured_at)}</span></div></div></div>
    <div class="timeline-note"><span aria-hidden="true">ⓘ</span> Lanes group scheduler node assignments. Columns separate concurrent allocations; they are not physical GPU slots. ${frame.inventory?'Inventory is available on Clusters. Hostlist lanes represent whole multi-node allocations, not per-node GPU distribution.':'Node capacity was not captured.'} Brief jobs appear as thin marks.</div>`;
}

export function pendingList(frame) {
  const jobs=frame.jobs.filter(j=>hasState(j,'PENDING')&&current(j,frame));
  const stale=frame.jobs.filter(j=>!terminal(j)&&!current(j,frame));
  const rows=list=>list.map(j=>`<div class="pending-row"><div>${jobButton(j)}<small>${j.requested?.gpus??'—'} GPU requested</small></div>${badge(j,frame)}</div>`).join('');
  return `<section class="pending-region"><div class="section-title"><h2>Waiting for allocation</h2><span class="count">${jobs.length}</span></div><p class="muted">No start time or GPU placement is promised.</p>${jobs.length?rows(jobs):'<p class="empty-inline">No pending jobs in the latest update.</p>'}${stale.length?`<div class="section-title lower-title"><h2>No longer observed</h2></div><p class="muted">Last-known states; current outcomes are unknown.</p>${rows(stale)}`:''}</section>`;
}
