// time.ts
export function isISODateTodayInIST(isoDate: string): boolean {
  // isoDate is 'YYYY-MM-DD' (already saved in IST)
  const now = new Date();
  // Convert now to IST 'YYYY-MM-DD'
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = istNow.getFullYear();
  const m = (istNow.getMonth() + 1).toString().padStart(2, '0');
  const d = istNow.getDate().toString().padStart(2, '0');
  const todayIST = `${y}-${m}-${d}`;
  return isoDate === todayIST;
}
