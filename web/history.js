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
export function historyWindow(frames,hours) {
  if(!frames.length||!hours) return frames;
  const since=Date.parse(frames.at(-1).captured_at)-hours*3600000;
  return frames.filter(f=>Date.parse(f.captured_at)>=since);
}
export function pointPositions(frames,start=Date.parse(frames[0]?.captured_at)) {
  if(frames.length===1&&start===Date.parse(frames[0].captured_at)) return [.5];
  const span=Date.parse(frames.at(-1)?.captured_at)-start;
  return frames.map(f=>(Date.parse(f.captured_at)-start)/Math.max(1,span));
}
export function historyChart(frames,index,measure,hours=0,pollSeconds=0) {
  if(!frames.length) return '<p class="history-empty">History will appear after the first update.</p>';
  const values=historyValues(frames,measure), finish=Date.parse(frames.at(-1).captured_at);
  const start=hours?finish-hours*3600000:Date.parse(frames[0].captured_at);
  const positions=pointPositions(frames,start), max=Math.max(...values), top=Math.max(2,Math.ceil(max/2)*2);
  const short=finish-start<60000;
  const tick=value=>new Date(value).toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',...(short?{second:'2-digit'}:{})});
  const x=i=>40+positions[i]*920, y=v=>136-v/top*112;
  // Connect regular live samples only; outages and sparse recordings remain gaps.
  const segments=pollSeconds?values.slice(1).map((v,i)=>Date.parse(frames[i+1].captured_at)-Date.parse(frames[i].captured_at)<=Math.max(30,pollSeconds*2)*1000?`<line x1="${x(i)}" x2="${x(i+1)}" y1="${y(values[i])}" y2="${y(v)}" class="history-trend"/>`:'').join(''):'';
  return `<svg class="history-plot" viewBox="0 0 1000 172" preserveAspectRatio="none" role="img" aria-label="${measures[measure]} over time: ${Math.min(...values)} to ${max}. ${frames.length} samples. Exact values are in Chart data.">
    ${[0,top/2,top].map(n=>`<line x1="40" x2="960" y1="${y(n)}" y2="${y(n)}" class="history-grid"/>`).join('')}
    ${segments}${values.map((v,i)=>`<line x1="${x(i)}" x2="${x(i)}" y1="136" y2="${y(v)}" class="history-bar"/><circle cx="${x(i)}" cy="${y(v)}" r="3" class="history-dot"><title>${escape(stamp(frames[i].captured_at,true))}: ${metricValue(v,measure)}</title></circle>`).join('')}
  </svg><div class="history-y-axis" aria-hidden="true"><span>${top}</span><span>${top/2}</span><span>0</span></div>
  <div class="history-x-axis" aria-hidden="true"><span>${tick(start)}</span><span>${tick(finish)} UTC</span></div>`;
}
export function updateHistory(root,session,index,measure,hours=0) {
  const frames=historyWindow(session.frames,hours), values=historyValues(frames,measure);
  root.querySelector('#history-chart').innerHTML=historyChart(frames,frames.length-1,measure,hours,session.live?session.update?.poll_seconds:0);
  root.querySelector('#history-value').textContent=frames.length?metricValue(values.at(-1),measure):'No data yet';
  root.querySelector('#history-range').textContent=frames.length?`${stamp(frames[0].captured_at)} — ${stamp(frames.at(-1).captured_at)}`:'Waiting for data';
  root.querySelector('#history-help').textContent=session.live?'Samples arrive automatically. Lines connect nearby samples; collection gaps remain blank.':'Recorded data · marks show available samples. No values are invented between captures.';
  const data=root.querySelector('#history-data');
  if(root.querySelector('.history-data-details').open&&!data.contains(document.activeElement)) data.innerHTML=frames.length?`<table><caption class="sr-only">${measures[measure]} history</caption><thead><tr><th scope="col">Time (UTC)</th><th scope="col">${measures[measure]}</th></tr></thead><tbody>${frames.map((f,i)=>`<tr><td>${escape(stamp(f.captured_at,true))}</td><td>${values[i]}</td></tr>`).join('')}</tbody></table>`:'<p>No samples in this range.</p>';
}
