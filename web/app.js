import {escape, stamp, table} from './components.js';
import {pages, renderView} from './views.js';
import {inspector} from './inspector.js';
import {updateHistory,nearestObservation} from './history.js';
import {workloadTable} from './workload.js';
import {mergeUpdate,healthLabel} from './live-state.js';

const $=id=>document.getElementById(id);
let liveCache, update, following=true, disconnected=false, revision=-1;
let measure='gpus', grouping='account';
let session, index=0, page='overview', filter='all', query='', selected=null;
let theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
try { theme=localStorage.getItem('slurm-lens-theme') || theme; } catch { /* Storage can be disabled. */ }
function applyTheme() {
  document.documentElement.dataset.theme=theme;
  $('theme').textContent=theme==='dark'?'☀':'☾';
  $('theme').setAttribute('aria-label',`Switch to ${theme==='dark'?'light':'dark'} theme`);
  $('theme').title=$('theme').getAttribute('aria-label');
}
applyTheme();
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();$('content').focus();});
$('theme').addEventListener('click',()=>{
  theme=theme==='dark'?'light':'dark'; applyTheme();
  try {localStorage.setItem('slurm-lens-theme',theme);} catch { /* Theme still works in this tab. */ }
});
$('source-button').addEventListener('click',()=>{location.hash='data';});
$('close-inspector').addEventListener('click',()=>{$('inspector').close();});
$('inspector').addEventListener('close',()=>{selected=null;});
$('inspector').addEventListener('click',e=>{if(e.target===$('inspector')) $('inspector').close();});

function openJob(id,cluster) {
  const frame=session.frames[index], job=frame.jobs.find(j=>j.id===id&&j.cluster===cluster);
  if(!job) { if($('inspector').open) $('inspector').close(); return; }
  selected={id,cluster};
  $('inspector-body').innerHTML=inspector(job,frame);
  if(!$('inspector').open) $('inspector').showModal();
}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-job]');
  if(button) openJob(button.dataset.job,button.dataset.cluster);
});

function filterJobs() {
  const frame=session.frames[index];
  const jobs=frame.jobs.filter(j=>(filter==='all'||j.state.split('+').includes(filter))&&`${j.name} ${j.id} ${j.node||''}`.toLowerCase().includes(query.toLowerCase()));
  $('job-table').innerHTML=table(jobs,frame);
  $('announcement').textContent=`${jobs.length} matching jobs`;
}
function render() {
  if(!session?.frames.length) {
    if(session?.live && page==='data') {
      $('page-title').textContent='Available data';
      $('page-description').textContent='Connection health and collection status.';
      $('view').innerHTML=renderView('data',session,0);
    }
    return;
  }
  const focused=document.activeElement, focusId=focused?.id, caret=focused?.selectionStart;
  const focusJob=focused?.dataset.job, focusFilter=focused?.dataset.filter;
  const focusInDialog=$('inspector').contains(focused);
  const frame=session.frames[index];
  const cluster=session.cluster||frame.jobs[0]?.cluster||'Recording';
  $('cluster-name').textContent=cluster;
  $('workspace-eyebrow').textContent=`${cluster.toUpperCase()} / ${session.live?'LIVE WORKSPACE':'RECORDED WORKSPACE'}`;
  document.title=`${pages[page][0]} · Slurm Lens`;
  $('page-title').textContent=pages[page][0]; $('page-description').textContent=session.live&&page==='clusters'?'Scheduler inventory and measured hardware usage.':session.live&&page==='data'?'Connection health, collection timestamps, and data coverage.':pages[page][1];
  $('capture-time').textContent=stamp(frame.captured_at,session.live);
  $('capture-index').textContent=`Observation ${index+1} of ${session.frames.length} · ${session.live?(following?'following live':'history paused'):'recording'}`;
  updateHistory($('history'),session,index,measure);
  $('workload-heading').textContent=`Workload by ${grouping}`;
  $('workload-groups').innerHTML=workloadTable(frame,grouping,measure);
  $('job-count').textContent=frame.jobs.length;
  document.querySelectorAll('[data-page]').forEach(a=>{
    if(a.dataset.page===page) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  $('view').innerHTML=renderView(page,session,index); $('view').setAttribute('aria-busy','false');
  if(page==='jobs') {
    $('job-search').value=query;
    $('job-search').addEventListener('input',e=>{query=e.target.value;filterJobs();});
    document.querySelectorAll('[data-filter]').forEach(b=>{
      b.classList.toggle('active',b.dataset.filter===filter);
      b.setAttribute('aria-pressed',String(b.dataset.filter===filter));
      b.addEventListener('click',()=>{
        filter=b.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(x=>{
          x.classList.toggle('active',x===b); x.setAttribute('aria-pressed',String(x===b));
        }); filterJobs();
      });
    }); filterJobs();
  }
  if(selected) openJob(selected.id,selected.cluster);
  if(focusJob) [...(focusInDialog?$('inspector'):$('view')).querySelectorAll('[data-job]')].find(b=>b.dataset.job===focusJob)?.focus();
  if(focusFilter) [...document.querySelectorAll('[data-filter]')].find(b=>b.dataset.filter===focusFilter)?.focus();
  if(focusId==='job-search') { $('job-search')?.focus(); if(caret!==null) $('job-search')?.setSelectionRange(caret,caret); }
}
function navigate() {
  const requested=location.hash.slice(1)||'overview';
  page=Object.hasOwn(pages,requested)?requested:'overview';
  if($('inspector').open) $('inspector').close();
  render();
}
function changeFrame(value) {
  if(session.live) { following=false; $('live-toggle').textContent='Back to live'; }
  index=Math.max(0,Math.min(session.frames.length-1,value)); render();
  $('announcement').textContent=`Observation ${index+1}, ${stamp(session.frames[index].captured_at)}`;
}
$('workload-group').addEventListener('change',e=>{grouping=e.target.value;render();});
$('history-measure').addEventListener('change',e=>{measure=e.target.value;if(session?.frames.length)render();});
$('history-time').addEventListener('focus',()=>{
  if(session?.live&&following){following=false;$('live-toggle').textContent='Back to live';render();}
});
$('history-time').addEventListener('change',e=>{if(session?.frames.length)changeFrame(Number(e.target.value));});
$('history-chart').addEventListener('click',e=>{
  const plot=$('history-chart').querySelector('svg');
  if(!plot||!session?.frames.length)return;
  const bounds=plot.getBoundingClientRect();
  changeFrame(nearestObservation(session.frames,((e.clientX-bounds.left)/bounds.width-.04)/.92));
});
$('latest').addEventListener('click',()=>{
  if(!session?.frames.length)return;
  if(session.live){following=true;session=liveCache;$('live-toggle').textContent='Pause live updates';}
  index=session.frames.length-1;render();
  $('announcement').textContent=`Showing latest observation, ${stamp(session.frames[index].captured_at,true)}`;
});
window.addEventListener('hashchange',navigate);

function connectionState() {
  if(!update) return;
  $('connection-mode').textContent=healthLabel(update,disconnected);
  $('connection-status').hidden=false;
  $('connection-status').textContent=`${healthLabel(update,disconnected)} · Last scheduler update: ${stamp(update.scheduler.last_success,true)}${update.telemetry.error?' · Telemetry unavailable':''}`;
}
function accept(next) {
  if(next.revision<revision) return;
  revision=next.revision; update=next; disconnected=false;
  liveCache=mergeUpdate(liveCache,next); liveCache.update=next;
  if(!following) session={...session,update:next};
  connectionState();

  if(following) { session=liveCache; index=Math.max(0,session.frames.length-1); render(); }
  else if(page==='data') render();
  if(!session.frames.length) {
    updateHistory($('history'),session,0,measure);
    $('view').innerHTML='<div class="empty"><h2>Waiting for scheduler data</h2><p>No observations have been received. Connection details are shown above.</p></div>';
    $('view').setAttribute('aria-busy','false');
  }
}
$('live-toggle').addEventListener('click',()=>{
  following=!following; $('live-toggle').textContent=following?'Pause live updates':'Back to live';
  if(following) { session=liveCache;index=Math.max(0,session.frames.length-1);render(); }
});
try {
  const statusResponse=await fetch('/api/status');
  if(!statusResponse.ok) throw new Error(`Server returned ${statusResponse.status}`);
  const status=await statusResponse.json();
  const response=await fetch('/api/session');
  if(!response.ok) throw new Error(`Server returned ${response.status}`);
  session=await response.json();
  if(status.mode==='live') {
    session.live=true; session.cluster=status.update.cluster; session.update=status.update;
    liveCache=session;update=status.update;
    $('live-toggle').hidden=false;
    $('source-button').textContent='Connection details';
    document.querySelector('.sidebar-foot').textContent='Read only · Slurm REST';
    document.querySelector('.page-footer').lastElementChild.textContent='Live observations · bounded in-memory history';
    $('capture-time').textContent='Waiting for first observation';
    $('capture-index').textContent='No scheduler data yet';
    accept(status.update);
    const stream=new EventSource('/api/events');
    stream.addEventListener('update',e=>{
      try {accept(JSON.parse(e.data));} catch {disconnected=true;connectionState();}
    });
    stream.onerror=()=>{disconnected=true;connectionState();};
    setInterval(connectionState,5000);
    window.addEventListener('pagehide',()=>stream.close());
  } else if(!session.frames?.length) throw new Error('Recording contains no observations');
  else index=session.frames.length-1;
  navigate();
} catch(error) {
  $('history-chart').textContent='History unavailable. Reload the page to try again.';
  $('history-range').textContent='Unable to load observations';
  $('latest').disabled=true; $('history-measure').disabled=true;
  $('capture-time').textContent='Data unavailable';
  $('capture-index').textContent='Could not load local data';
  $('view').innerHTML=`<div class="error"><h2>Unable to open workspace</h2><p>${escape(error.message)}</p><p>Check the local server output, then reload this page.</p><button class="button" id="retry">Reload page</button></div>`;
  $('view').setAttribute('aria-busy','false');
  $('retry').addEventListener('click',()=>location.reload());
}
