
import { google } from 'googleapis';
import { CALENDAR_CONFIG } from '../src/lib/calendarConfig';
import fs from 'fs';
import path from 'path';

async function dumpEvents() {
    const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
    const privateKey = CALENDAR_CONFIG.key.replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: CALENDAR_CONFIG.email,
            private_key: privateKey,
        },
        scopes: SCOPES,
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
        calendarId: CALENDAR_CONFIG.calendarId,
        timeMin: '2025-01-01T00:00:00Z',
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
    });

    fs.writeFileSync('raw_events.json', JSON.stringify(response.data.items, null, 2));
    console.log('Dumped 20 events to raw_events.json');
}
dumpEvents();
