// requestSync() schedules a background sync nudge with a real timer. Tests do
// not load the sync worker, but the pending timer would keep Jest waiting.
process.on('warning', () => {});
