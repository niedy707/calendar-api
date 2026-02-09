import { google } from 'googleapis';
import { CALENDAR_CONFIG } from './calendarConfig';
import { categorizeEvent } from './classification';
import fs from 'fs';
import path from 'path';

// Cache Interface
interface CacheEntry {
    data: any[];
    timestamp: number;
}

// Global Cache Variables
let eventsCache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Backup File Path
// Use a generic name or project-specific name?
// process.cwd() will be different for each project.
// We'll use a generic name 'calendar_events_backup.json' or stick to 'panel_response_final.json' if that's critical?
// 'panel' uses 'panel_response_final.json'. 'takvim' might use something else.
// Let's make it generic 'calendar_backup.json' but for now to be safe and compatible with existing panel logic if it relies on specific filenames (which it sort of implies), 
// actually panel's code used 'panel_response_final.json'.
// Let's use 'calendar_data_backup.json' as a standard moving forward, but I should check if Panel relies on that specific filename elsewhere.
// Use 'panel_response_final.json' for now as it was used in Panel.
// Wait, 'takvim' project might not want 'panel_...' filename.
// Ideally, the filename should be configurable or just generic.
// Let's use 'calendar_backup.json'.

const BACKUP_FILE_PATH = path.join(process.cwd(), 'calendar_backup.json');

// Helper to classify/process raw events
function processEvents(rawEvents: any[]) {
    const colorMap: Record<string, string> = {
        '1': '#a4bdfc', '2': '#46a67a', '3': '#dbadff', '4': '#ff887c',
        '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
        '9': '#5484ed', '10': '#3d8b3d', '11': '#dc2127',
    };

    return rawEvents.map((event: any) => {
        const title = event.summary || 'Müsait Değil';
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        const colorId = event.colorId;
        const color = colorId ? colorMap[colorId] : undefined;

        if (!start || !end) return null;

        const category = categorizeEvent(title, color, start, end);
        if (category === 'ignore') return null;

        return {
            id: event.id,
            title: title,
            start: start,
            end: end,
            category: category,
            color: color,
            location: event.location,
            description: event.description,
            // Add type for frontend compatibility
            type: 'google'
        };
    }).filter(Boolean);
}

export async function fetchCalendarEvents() {
    // 1. Check Memory Cache
    const now = Date.now();
    if (eventsCache && (now - eventsCache.timestamp < CACHE_TTL)) {
        console.log('Serving events from IN-MEMORY CACHE');
        return eventsCache.data;
    }

    console.log('Fetching fresh events from Google Calendar API...');

    try {
        // 2. Authenticate
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

        // 3. Fetch Data (Pagination)
        const allEvents: any[] = [];
        let pageToken: string | undefined = undefined;

        do {
            const response: any = await calendar.events.list({
                calendarId: CALENDAR_CONFIG.calendarId,
                timeMin: '2024-01-01T00:00:00Z',
                maxResults: 2500,
                singleEvents: true,
                orderBy: 'startTime',
                pageToken: pageToken,
            });

            if (response.data.items) {
                allEvents.push(...response.data.items);
            }
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        // 4. Process Data
        const processedEvents = processEvents(allEvents);

        // 5. Update Cache & Backup
        eventsCache = {
            data: processedEvents,
            timestamp: now
        };

        // Save to Backup File
        try {
            fs.writeFileSync(BACKUP_FILE_PATH, JSON.stringify(processedEvents, null, 2));
            console.log(`Backup saved to ${BACKUP_FILE_PATH}`);
        } catch (backupError) {
            console.error('Failed to save backup:', backupError);
        }

        console.log(`Fetched and cached ${processedEvents.length} events.`);
        return processedEvents;

    } catch (error) {
        console.error('Error fetching calendar events:', error);

        // Return stale memory cache if available
        if (eventsCache) {
            console.warn('Returning stale memory cache due to error.');
            return eventsCache.data;
        }

        // Return file backup if available
        if (fs.existsSync(BACKUP_FILE_PATH)) {
            console.warn('Returning FILE BACKUP due to API error.');
            try {
                const backupData = fs.readFileSync(BACKUP_FILE_PATH, 'utf-8');
                return JSON.parse(backupData);
            } catch (readError) {
                console.error('Failed to read backup file:', readError);
            }
        }

        throw error;
    }
}
