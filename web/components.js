export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const time = value => value ? new Date(value).toLocaleTimeString('en-GB', {timeZone:'UTC',hour:'2-digit',minute:'2-digit'}) : 'Not recorded';
export const stamp = value => value ? new Date(value).toLocaleString('en-GB', {timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC' : 'Not recorded';
export const terminal = job => ['COMPLETED','FAILED','CANCELLED','TIMEOUT','NODE_FAIL','OUT_OF_MEMORY'].includes(job.state);
export const current = (job, frame) => job.observed_at === frame.captured_at;
export const active = (job, frame) => current(job,frame) && job.state === 'RUNNING';
export const condition = value => ({afterok:'On success',afternotok:'On failure',afterany:'After completion'}[value] || value);
export const reason = job => job.state === 'PENDING' ? ({Dependency:'Waiting for predecessor',Resources:'Waiting for resources',Priority:'Waiting for priority'}[job.reason] || job.reason) : terminal(job) ? (job.state === 'COMPLETED' ? 'Finished successfully' : job.state.replaceAll('_',' ').toLowerCase()) : 'Resources allocated';
export function badge(job, frame) {
  const style = job.state === 'RUNNING' ? 'running' : job.state === 'PENDING' ? 'pending' : job.state === 'COMPLETED' ? 'completed' : 'failed';
  const label = {RUNNING:'Running',PENDING:'Pending',COMPLETED:'Completed'}[job.state] || job.state.replaceAll('_',' ').toLowerCase();
  const stale = !current(job,frame) && !terminal(job);
  return `<span class="badge ${style}"><span aria-hidden="true">${{running:'●',pending:'◷',completed:'✓',failed:'!'}[style]}</span>${stale?'Last seen ':''}${escape(label)}</span>`;
}
export function jobButton(job, extra='') {
  return `<button class="job-link ${extra}" data-job="${escape(job.id)}" data-cluster="${escape(job.cluster)}">${escape(job.name)}</button>`;
}
export function duration(job, frame) {
  if (!job.started_at) return '—';
  const end = job.ended_at || (current(job,frame) ? frame.captured_at : job.observed_at);
  const seconds = Math.max(0,Math.round((new Date(end)-new Date(job.started_at))/1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
}
export function table(jobs, frame) {
  if (!jobs.length) return '<div class="empty"><strong>No matching jobs</strong><p>Try a different search or state filter.</p></div>';
  return `<div class="table-scroll"><table><thead><tr><th scope="col">Job</th><th scope="col">State</th><th scope="col">Resources</th><th scope="col">Node</th><th scope="col">Elapsed</th><th scope="col">Context</th></tr></thead><tbody>${jobs.map(j=>`<tr><td>${jobButton(j)}<small>#${escape(j.id)} · ${escape(j.partition)}</small></td><td>${badge(j,frame)}</td><td><span>${j.requested?.gpus ?? '—'} GPU · ${j.requested?.cpus ?? '—'} CPU</span><small>${escape(j.requested?.memory ?? 'Unknown')} RAM requested</small></td><td class="mono">${escape(j.node || 'Unassigned')}</td><td class="mono">${duration(j,frame)}</td><td class="context-cell">${escape(reason(j))}</td></tr>`).join('')}</tbody></table></div>`;
}
export function emptyMetric(label, description) {
  return `<div class="missing-metric"><span>${label}</span><strong>Not collected</strong><small>${description}</small></div>`;
}
export function allocationChart(frames, index) {
  const values = frames.slice(0,index+1).map(f=>f.jobs.filter(j=>active(j,f)).reduce((n,j)=>n+(j.allocated?.gpus||0),0));
  const W=640,H=142,max=Math.max(4,...values), start=new Date(frames[0].captured_at).getTime();
  const finish=new Date(frames.at(-1).captured_at).getTime();
  const x=i=>40+(new Date(frames[i].captured_at).getTime()-start)/Math.max(1,finish-start)*(W-60);
  const y=v=>H-24-v/max*(H-45);
  let path=`M ${x(0)} ${y(values[0])}`;
  values.slice(1).forEach((v,i)=>{path+=` H ${x(i+1)} V ${y(v)}`;});
  return `<svg class="allocation-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Recorded allocated GPU count: ${values.join(', ')}. Changes between snapshots are not observed.">
    ${[0,2,4].map(n=>`<line x1="40" x2="620" y1="${y(n)}" y2="${y(n)}" class="chart-grid"/><text x="16" y="${y(n)+4}">${n}</text>`).join('')}
    <path d="${path}" class="chart-line"/>${values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3" class="chart-dot"/>`).join('')}
    <text x="40" y="139">${time(frames[0].captured_at)}</text><text x="620" y="139" text-anchor="end">${time(frames.at(-1).captured_at)} UTC</text></svg>`;
}
