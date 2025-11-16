// returns YYYY-MM-DD for Asia/Kolkata reliably
export function todayIST(date = new Date()): string {
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
return fmt.format(date); // en-CA yields YYYY-MM-DD
}