// Pack concurrent allocations into visual tracks. These are NOT device IDs.
export function packAllocations(jobs) {
  const occupied=[];
  const items=[...jobs].sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at)||a.id.localeCompare(b.id));
  let columns=1;
  const placements=items.map(job=>{
    const start=Date.parse(job.started_at);
    const end=Math.max(start+1000,Date.parse(job.ended_at||job.observed_at));
    const span=Math.max(1,job.allocated?.gpus||1);
    let column=0;
    while(Array.from({length:span},(_,i)=>occupied[column+i]||0).some(until=>until>start)) column++;
    for(let i=column;i<column+span;i++) occupied[i]=end;
    columns=Math.max(columns,column+span);
    return {job,column,span};
  });
  return {columns,placements};
}
