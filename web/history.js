import {active,current,hasState,escape,stamp} from './components.js';

export const measures={gpus:'Allocated GPUs',running:'Running jobs',pending:'Pending jobs'};
export function metricValue(value,measure) {
  const label=measure==='gpus'?`GPU${value===1?'':'s'} allocated`:`${measure} job${value===1?'':'s'}`;
  return `${value} ${label}`;
}
export function historyValues(frames,measure) {
  return frames.map(frame=>frame.jobs.reduce((sum,job)=>{
    if(measure==='gpus') return sum+(active(job,frame)?job.allocated?.gpus||0:0);
    return sum+Number(current(job,frame)&&hasState(job,measure==='pending'?'PENDING':'RUNNING'));
  },0));
}
export function pointPositions(frames) {
  if(frames.length===1) return [0.5];
  const start=Date.parse(frames[0].captured_at), span=Date.parse(frames.at(-1).captured_at)-start;
  return frames.map(f=>(Date.parse(f.captured_at)-start)/Math.max(1,span));
}
export function nearestObservation(frames,fraction) {
  return pointPositions(frames).reduce((best,x,i,points)=>Math.abs(x-fraction)<Math.abs(points[best]-fraction)?i:best,0);
}
export function historyChart(frames,index,measure) {
  if(!frames.length) return '<p class="history-empty">History will appear after the first observation.</p>';
  const values=historyValues(frames,measure), positions=pointPositions(frames);
  const max=Math.max(...values), top=Math.max(2,Math.ceil(max/2)*2);
  const short=Date.parse(frames.at(-1).captured_at)-Date.parse(frames[0].captured_at)<60000;
  const tick=value=>new Date(value).toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',...(short?{second:'2-digit'}:{})});
  const x=i=>4+positions[i]*92, y=v=>136-v/top*112;
  return `<svg class="history-plot" viewBox="0 0 1000 172" preserveAspectRatio="none" role="img" aria-label="${measures[measure]} over time: ${Math.min(...values)} to ${max}. ${frames.length} observations. Select a time below for exact values.">
    ${[0,top/2,top].map(n=>`<line x1="40" x2="960" y1="${y(n)}" y2="${y(n)}" class="history-grid"/>`).join('')}
    ${values.map((v,i)=>`<line x1="${x(i)*10}" x2="${x(i)*10}" y1="136" y2="${y(v)}" class="history-bar"/><circle cx="${x(i)*10}" cy="${y(v)}" r="3" class="history-dot"><title>${escape(stamp(frames[i].captured_at,true))}: ${metricValue(v,measure)}</title></circle>`).join('')}
    <line x1="${x(index)*10}" x2="${x(index)*10}" y1="16" y2="144" class="history-selection"/>
    <circle cx="${x(index)*10}" cy="${y(values[index])}" r="6" class="history-selected-dot"/>
  </svg><div class="history-y-axis" aria-hidden="true"><span>${top}</span><span>${top/2}</span><span>0</span></div>
  <div class="history-x-axis" aria-hidden="true"><span>${tick(frames[0].captured_at)}</span><span>${tick(frames.at(-1).captured_at)} UTC</span></div>`;
}
export function updateHistory(root,session,index,measure) {
  const frames=session.frames, values=historyValues(frames,measure);
  root.querySelector('#history-chart').innerHTML=historyChart(frames,index,measure);
  const select=root.querySelector('#history-time');
  const options=frames.map((f,i)=>`<option value="${i}" ${i===index?'selected':''}>${escape(stamp(f.captured_at,true))} · ${metricValue(values[i],measure)}</option>`).join('');
  // Do not replace options underneath an open native picker on live refresh.
  if(document.activeElement!==select) select.innerHTML=options;
  select.disabled=!frames.length;
  root.querySelector('#history-value').textContent=frames.length?metricValue(values[index],measure):'No observations';
  root.querySelector('#history-range').textContent=frames.length?`${stamp(frames[0].captured_at)} — ${stamp(frames.at(-1).captured_at)}`:'Waiting for data';
}
