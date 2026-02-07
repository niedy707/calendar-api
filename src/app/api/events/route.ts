
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';
import { categorizeEvent } from '@/lib/classification';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        // Optional: Support timeMin/timeMax query params
        const timeMin = searchParams.get('timeMin') || '2025-01-01T00:00:00Z';

        // 1. Load archived events (Jan 2025 - Nov 2025)
        let archivedEvents: any[] = [];
        try {
            const archivePath = path.join(process.cwd(), 'src', 'data', 'archived_events.json');
            if (fs.existsSync(archivePath)) {
                const fileContent = fs.readFileSync(archivePath, 'utf-8');
                archivedEvents = JSON.parse(fileContent);
            }
        } catch (err) {
            console.error('Failed to load archived events:', err);
        }

        // 2. Auth with Google
        const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
        // Handle key formatting
        const privateKey = CALENDAR_CONFIG.key.replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: CALENDAR_CONFIG.email,
                private_key: privateKey,
            },
            scopes: SCOPES,
        });

        const calendar = google.calendar({ version: 'v3', auth });

        // 3. Fetch Live Events
        const response = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.calendarId,
            timeMin: '2025-12-01T00:00:00Z', // Live data starts from Dec 2025
            maxResults: 2500,
            singleEvents: true,
            orderBy: 'startTime',
        });

        // 4. Process Events
        const colorMap: Record<string, string> = {
            '1': '#a4bdfc', '2': '#46a67a', '3': '#dbadff', '4': '#ff887c',
            '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
            '9': '#5484ed', '10': '#3d8b3d', '11': '#dc2127',
        };

        const liveEventsRaw = response.data.items || [];

        // Combine all raw events
        // Note: Archived events structure might differ slightly, but assuming they are Google Event objects
        const allRawEvents = [...archivedEvents, ...liveEventsRaw];

        // Unique by ID
        const uniqueEventsMap = new Map();
        allRawEvents.forEach(e => uniqueEventsMap.set(e.id, e));
        const uniqueRawEvents = Array.from(uniqueEventsMap.values());

        // Transform and Classify
        const processedEvents = uniqueRawEvents.map((event: any) => {
            const title = event.summary || 'Müsait Değil';
            const start = event.start?.dateTime || event.start?.date;
            const end = event.end?.dateTime || event.end?.date;
            const colorId = event.colorId;
            const color = colorId ? colorMap[colorId] : undefined;

            if (!start || !end) return null;

            // CLASSIFY
            const category = categorizeEvent(title, color, start, end);

            // FILTER IGNORED
            if (category === 'ignore') return null;

            return {
                id: event.id,
                title: title,
                start: start,
                end: end,
                category: category, // 'surgery' | 'checkup' | 'appointment' | 'blocked'
                color: color,
                location: event.location,
                description: event.description,
            };
        }).filter(Boolean); // Remove nulls

        return NextResponse.json(processedEvents);

    } catch (error: any) {
        console.error('Calendar API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch events', details: error.message }, { status: 500 });
    }
}
