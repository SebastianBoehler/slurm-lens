import {escape, stamp, table} from './components.js';
import {pages, renderView} from './views.js';
import {inspector} from './inspector.js';

const $=id=>document.getElementById(id);
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
  if(!job) return;
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
  const jobs=frame.jobs.filter(j=>(filter==='all'||j.state===filter)&&`${j.name} ${j.id} ${j.node||''}`.toLowerCase().includes(query.toLowerCase()));
  $('job-table').innerHTML=table(jobs,frame);
  $('announcement').textContent=`${jobs.length} matching jobs`;
}
function render() {
  if(!session) return;
  const frame=session.frames[index];
  const cluster=frame.jobs[0]?.cluster||'Recording';
  $('cluster-name').textContent=cluster;
  $('workspace-eyebrow').textContent=`${cluster.toUpperCase()} / RECORDED WORKSPACE`;
  document.title=`${pages[page][0]} · Slurm Lens`;
  $('page-title').textContent=pages[page][0]; $('page-description').textContent=pages[page][1];
  $('capture-time').textContent=stamp(frame.captured_at);
  $('capture-index').textContent=`Snapshot ${index+1} of ${session.frames.length} · anonymized recording`;
  $('frame').value=index; $('frame').max=session.frames.length-1;
  $('frame').setAttribute('aria-valuetext',`Snapshot ${index+1}, ${stamp(frame.captured_at)}`);
  $('previous').disabled=index===0; $('next').disabled=index===session.frames.length-1;
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
}
function navigate() {
  const requested=location.hash.slice(1)||'overview';
  page=Object.hasOwn(pages,requested)?requested:'overview';
  if($('inspector').open) $('inspector').close();
  render();
}
function changeFrame(value) {
  index=Math.max(0,Math.min(session.frames.length-1,value)); render();
  $('announcement').textContent=`Snapshot ${index+1}, ${stamp(session.frames[index].captured_at)}`;
}
$('frame').addEventListener('input',e=>{if(session)changeFrame(Number(e.target.value));});
$('previous').addEventListener('click',()=>{if(session)changeFrame(index-1);});
$('next').addEventListener('click',()=>{if(session)changeFrame(index+1);});
window.addEventListener('hashchange',navigate);

try {
  const response=await fetch('/api/session');
  if(!response.ok) throw new Error(`Server returned ${response.status}`);
  session=await response.json();
  if(!session.frames?.length) throw new Error('Recording contains no snapshots');
  navigate();
} catch(error) {
  $('capture-time').textContent='Recording unavailable';
  $('capture-index').textContent='Could not load local data';
  $('view').innerHTML=`<div class="error"><h2>Unable to open recording</h2><p>${escape(error.message)}</p><p>Check the local server output, then reload this page.</p><button class="button" id="retry">Reload page</button></div>`;
  $('view').setAttribute('aria-busy','false');
  $('retry').addEventListener('click',()=>location.reload());
}
