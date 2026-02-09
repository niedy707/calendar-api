
import { fetchCalendarEvents } from '../src/lib/googleCalendar';
import { format } from 'date-fns';

async function listAllTodayEvents() {
    const events = await fetchCalendarEvents();
    if (!events) return;

    const now = new Date();
    const trtNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const targetDateStr = format(trtNow, 'yyyy-MM-dd');

    console.log(`--- All Events for ${targetDateStr} ---`);
    const todayEvents = events.filter((e: any) => e.start && e.start.startsWith(targetDateStr));

    todayEvents.forEach((e: any) => {
        console.log(`- Title: "${e.title}" | ID: ${e.id}`);
    });
}

listAllTodayEvents().catch(console.error);
