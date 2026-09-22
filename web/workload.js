import {active,current,hasState,escape} from './components.js';
import {measures} from './history.js';

export function workloadGroups(frame,grouping) {
  const groups=new Map();
  for(const job of frame.jobs) {
    if(!current(job,frame)) continue;
    const key=job[grouping]?.trim()||null;
    if(!groups.has(key)) groups.set(key,{key,label:key??'Not reported',jobs:0,running:0,pending:0,gpus:0,unknown:0});
    const group=groups.get(key);
    group.jobs++;
    if(active(job,frame)) {
      group.running++;
      if(job.allocated?.gpus==null) group.unknown++;
      else group.gpus+=job.allocated.gpus;
    }
    if(hasState(job,'PENDING')) group.pending++;
  }
  return [...groups.values()].sort((a,b)=>b.gpus-a.gpus||b.running-a.running||a.label.localeCompare(b.label));
}

export function workloadTable(frame,grouping,measure) {
  const groups=workloadGroups(frame,grouping);
  if(!groups.length) return '<p class="history-empty">No current jobs at this time. Earlier observations are not counted.</p>';
  groups.sort((a,b)=>b[measure]-a[measure]||a.label.localeCompare(b.label));
  const max=Math.max(1,...groups.map(g=>g[measure]));
  const unknown=groups.reduce((n,g)=>n+g.unknown,0);
  return `<p class="history-caption">Bars compare: ${measures[measure]}. Counts exclude jobs last seen at an earlier time.${groups.some(g=>g.key===null)?` Some jobs have no reported ${grouping}; they are grouped together.`:''}</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Workload counts by ${grouping}"><table class="workload-table"><caption class="sr-only">Jobs and allocated GPUs by ${grouping} at the selected observation</caption><thead><tr><th scope="col">${grouping==='user'?'User':'Account'}</th><th scope="col">Jobs</th><th scope="col">Running</th><th scope="col">Pending</th><th scope="col">GPUs allocated</th></tr></thead><tbody>${groups.map(g=>`<tr><th scope="row"><span>${escape(g.label)}</span><span class="workload-bar-track" aria-hidden="true"><span style="width:${g[measure]/max*100}%"></span></span></th><td>${g.jobs}</td><td>${g.running}</td><td>${g.pending}</td><td>${g.unknown?`${g.gpus}+ <small>Incomplete</small>`:g.gpus}</td></tr>`).join('')}</tbody></table></div>
    ${unknown?`<p class="history-caption">GPU allocation was not reported for ${unknown} running job${unknown===1?'':'s'}. Shown totals are known allocations only.</p>`:''}`;
}
