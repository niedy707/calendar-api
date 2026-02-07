
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';
import { categorizeEvent } from '@/lib/classification';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'events.json');
    const ARCHIVE_FILE = path.join(process.cwd(), 'src', 'data', 'archived_events.json');

    try {
        const { searchParams } = new URL(request.url);
        // Determine "Today" for cutoff
        // We use system time, but formatted to YYYY-MM-DD to avoid timezone hell if possible, 
        // or just use ISO string comparison. 
        // Google uses ISO. Let's use start of today in UTC or safe generic.
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(); // Local start of day as ISO

        // 1. Load Local Data (Cache/History)
        let localEvents: any[] = [];
        if (fs.existsSync(DATA_FILE)) {
            try {
                localEvents = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            } catch (e) {
                console.error('Failed to read events.json', e);
            }
        }

        // 2. Identify History (Frozen) vs Future (to be refreshed)
        // If local file exists, we keep everything BEFORE today.
        // If local file DOES NOT exist, we assume we need to fetch from scratch (Dec 1, 2025).

        let historyEvents = [];
        let timeMinForFetch = '2025-12-01T00:00:00Z'; // Default start for "Live" era

        if (localEvents.length > 0) {
            historyEvents = localEvents.filter((e: any) => e.end < startOfToday);
            timeMinForFetch = startOfToday;
        } else {
            // No local cache? Load the static archive (Jan-Nov 2025) as initial history
            if (fs.existsSync(ARCHIVE_FILE)) {
                try {
                    const rawArchive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
                    // We assume archived_events.json are RAW Google events. 
                    // We need to process them if we are saving PROCESSED data.
                    // Wait, the previous code treated them as raw.
                    // To keep it simple: We will process everything at the end.
                    // BUT, if we save PROCESSED data to events.json, we can't mix Raw and Processed in logic easily.
                    // DECISION: events.json will store PROCESSED (Classified) events.
                    // So if we load ARCHIVE (Raw), we must process it once.

                    // Let's defer archive loading to the "Fetch from Google" block to treat it as a source.
                } catch (e) {
                    console.error('Failed to read archive', e);
                }
            }
        }

        // 3. Authenticate & Fetch
        try {
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

            // Fetch Live Data
            const response = await calendar.events.list({
                calendarId: CALENDAR_CONFIG.calendarId,
                timeMin: timeMinForFetch,
                maxResults: 2500,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const liveEventsRaw = response.data.items || [];

            // Process Live Events
            const liveProcessed = processEvents(liveEventsRaw);

            // If we are initializing (no local file), we also need to process the Archive and include it in History
            if (localEvents.length === 0 && fs.existsSync(ARCHIVE_FILE)) {
                const rawArchive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
                const archiveProcessed = processEvents(rawArchive);
                historyEvents = [...archiveProcessed];
            }

            // MERGE: History (Frozen) + Live (Fresh)
            // Use a Map to deduplicate by ID, preferring Live if overlap (though cutoff should prevent most)
            const mergedMap = new Map();

            // 1. Add History
            historyEvents.forEach((e: any) => mergedMap.set(e.id, e));

            // 2. Add/Overwrite with Live
            liveProcessed.forEach((e: any) => mergedMap.set(e.id, e));

            const finalEvents = Array.from(mergedMap.values());

            // Sort by start date
            finalEvents.sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime());

            // 4. Save to Cache
            fs.writeFileSync(DATA_FILE, JSON.stringify(finalEvents, null, 2));

            return NextResponse.json(finalEvents);

        } catch (googleError: any) {
            console.error('Google API Error (Offline Mode?):', googleError.message);

            // FALLBACK: Return whatever we have in local cache
            if (localEvents.length > 0) {
                return NextResponse.json(localEvents);
            }

            throw googleError; // No cache, no internet -> Die
        }

    } catch (error: any) {
        console.error('Calendar Service Error:', error);
        return NextResponse.json({ error: 'Failed to fetch events', details: error.message }, { status: 500 });
    }
}

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
        };
    }).filter(Boolean);
}
