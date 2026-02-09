
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';
import { categorizeEvent } from '@/lib/classification';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
    // Use /tmp for writeable ops in Vercel, or standard path locally
    const isVercel = process.env.VERCEL === '1';
    const BACKUP_DIR = isVercel ? '/tmp/backups' : path.join(process.cwd(), 'src', 'data', 'backups');
    const ARCHIVE_FILE = path.join(process.cwd(), 'src', 'data', 'archived_events.json');

    // Ensure backup dir exists (safe-guarded)
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
    } catch (err) {
        console.error("Failed to create backup directory:", err);
        // Do not crash, just continue without backup capability
    }

    try {
        // 1. Authenticate & Fetch from Google (Always Live)
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

        // Fetch Live Data (From Dec 1, 2025 as defined originally, or generic logic)
        // Note: To have a FULL backup, we should probably fetch everything we care about.
        // If we want a complete backup, we should fetch from the beginning of our "Era" (e.g. 2025).
        // Let's stick to the "Dec 1 2025" logic for live, but maybe we should expand this for backups?
        // User said "google daki tüm verileri localhosta çekerek".
        // Let's fetch from Jan 1 2025 to catch everything relevant for this year.

        // Fetch Live Data
        // Start from Jan 1, 2024 to cover historical data for discrepancy check
        const allEvents: any[] = [];
        let pageToken: string | undefined = undefined;

        do {
            const response: any = await calendar.events.list({
                calendarId: CALENDAR_CONFIG.calendarId,
                timeMin: '2024-01-01T00:00:00Z',
                maxResults: 2500, // Max per page
                singleEvents: true,
                orderBy: 'startTime',
                pageToken: pageToken,
            });

            if (response.data.items) {
                allEvents.push(...response.data.items);
            }
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        const liveProcessed = processEvents(allEvents);

        // 2. BACKUP LOGIC (Automatic)
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        // Check triggers
        const isSunday = now.getDay() === 0;
        const isFirstOfMonth = now.getDate() === 1;

        if (isSunday || isFirstOfMonth) {
            let backupType = '';
            if (isFirstOfMonth) backupType = 'monthly';
            else if (isSunday) backupType = 'weekly';

            const backupFile = path.join(BACKUP_DIR, `${backupType}_${todayStr}.json`);

            // Only save if not already saved today (to avoid IO spam on every request)
            if (!fs.existsSync(backupFile)) {
                // We save the PROCESSSED events to be ready-to-use
                try {
                    fs.writeFileSync(backupFile, JSON.stringify(liveProcessed, null, 2));
                    console.log(`Backup created: ${backupFile}`);
                } catch (e) {
                    console.error('Backup write failed:', e);
                }
            }
        }

        // Also update 'latest.json' for immediate fallback
        const latestFile = path.join(BACKUP_DIR, 'latest.json');
        try {
            fs.writeFileSync(latestFile, JSON.stringify(liveProcessed, null, 2));
        } catch (e) { /* ignore */ }


        return NextResponse.json(liveProcessed);

    } catch (googleError: any) {
        console.error('Google API Error (Offline Mode?):', googleError.message);

        // 3. FALLBACK LOGIC
        // Try to load 'latest.json' first
        try {
            const latestFile = path.join(BACKUP_DIR, 'latest.json');
            if (fs.existsSync(latestFile)) {
                console.log('Serving from latest backup');
                const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
                return NextResponse.json(data);
            }
        } catch (e) { console.error("Fallback read failed:", e); }

        // Last resort: Static archive (if exists in repo)
        if (fs.existsSync(ARCHIVE_FILE)) {
            console.log('Serving from static archive');
            try {
                const raw = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
                if (Array.isArray(raw)) { // Check if valid array
                    const processed = processEvents(raw);
                    return NextResponse.json(processed);
                }
            } catch (e) { console.error("Archive read failed:", e); }
        }

        throw googleError; // No backup found -> Die
    }
}
