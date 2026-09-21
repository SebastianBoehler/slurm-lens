export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const time = value => value ? new Date(value).toLocaleTimeString('en-GB', {timeZone:'UTC',hour:'2-digit',minute:'2-digit'}) : 'Not recorded';
export const stamp = (value,seconds=false) => value ? new Date(value).toLocaleString('en-GB', {timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})})+' UTC' : 'Not recorded';
export const hasState = (job,state) => job.state.split('+').includes(state);
export const terminal = job => job.state.split('+').some(s=>['COMPLETED','FAILED','CANCELLED','TIMEOUT','NODE_FAIL','OUT_OF_MEMORY','PREEMPTED','BOOT_FAIL','DEADLINE'].includes(s));
export const current = (job, frame) => job.observed_at === frame.captured_at;
export const active = (job, frame) => current(job,frame) && hasState(job,'RUNNING');
export const condition = value => ({afterok:'On success',afternotok:'On failure',afterany:'After completion'}[value] || value);
export const reason = job => hasState(job,'PENDING') ? ({Dependency:'Waiting for predecessor',Resources:'Waiting for resources',Priority:'Waiting for priority'}[job.reason] || job.reason) : terminal(job) ? (hasState(job,'COMPLETED') ? 'Finished successfully' : job.state.replaceAll('_',' ').toLowerCase()) : 'Resources allocated';
export function badge(job, frame) {
  const style = hasState(job,'RUNNING') ? 'running' : hasState(job,'PENDING') ? 'pending' : hasState(job,'COMPLETED') ? 'completed' : 'failed';
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
