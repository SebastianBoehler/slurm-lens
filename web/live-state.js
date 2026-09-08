// Pure cache reducer: transport and rendering do not own historical selection.
export function mergeUpdate(session, update) {
  const frames=[...session.frames];
  if(update.frame) {
    const last=frames.at(-1);
    if(!last || update.frame.captured_at>last.captured_at) frames.push(update.frame);
    else if(last.captured_at===update.frame.captured_at) frames[frames.length-1]=update.frame;
  }
  return {...session,live:true,cluster:update.cluster,frames:frames.filter(f=>!update.history_start||f.captured_at>=update.history_start).slice(-update.history_frames)};
}
export function healthLabel(update, disconnected, now=Date.now()) {
  if(disconnected) return 'Disconnected · reconnecting';
  if(update.scheduler.error) return `Scheduler unavailable · ${update.scheduler.error}`;
  if(!update.scheduler.last_success) return 'Connecting to scheduler…';
  if(now-Date.parse(update.scheduler.last_success)>Math.max(30,update.poll_seconds*2)*1000) return 'Stale · waiting for scheduler';
  return 'Live connection';
}
