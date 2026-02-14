
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';

// Define strict types for our internal data structure
interface Control {
    date: string;
    status: 'attended' | 'cancelled' | 'planned';
    title: string;
    label: string;
}

interface Patient {
    name: string;
    surgeryDate: string;
    hospital?: string;
    controls?: Control[];
}

export const dynamic = 'force-dynamic';

/**
 * Normalizes patient names
 */
function normalizeName(name: string): string {
    return name.toLocaleLowerCase('tr-TR')
        .replace(/otoplasti|revizyon|rev rino|upper blef|rino|kostal[ıi]?|kosta|ortak vaka|ortak|iy/gi, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/🔪/g, '')
        .replace(/yaş\s*\d+/gi, '') // Remove Age info
        .replace(/\d{1,2}[:.]\d{2}/g, '')
        .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1))
        .join(' ');
}

import { calculateControlLabel } from '@/lib/classification';

export async function GET(request: NextRequest) {
    try {
        // 1. Fetch Hospital DB (Patient List) from External API
        // This is the source of truth for "Who is a patient" and "When was surgery"
        const HOSPITAL_DB_API = 'https://panel.ibrahimyagci.com/api/patient-db';

        let hospitalPatients: any[] = [];
        try {
            const hopitalRes = await fetch(HOSPITAL_DB_API, { next: { revalidate: 0 } });
            if (hopitalRes.ok) {
                hospitalPatients = await hopitalRes.json();
            } else {
                console.error(`Failed to fetch external patient DB: ${hopitalRes.status}`);
                // fallback or empty? Let's proceed with empty if failed, but log it.
            }
        } catch (e) {
            console.error('Network error fetching external patient DB:', e);
        }

        // Initialize Map with Hospital Data
        const patientsMap = new Map<string, Patient>();

        hospitalPatients.forEach((p: any) => {
            // Validate minimal data
            const surgeryDate = p.date || p.surgeryDate;
            if (!surgeryDate) return;

            const name = p.name || '';
            const formattedName = normalizeName(name);

            if (!formattedName || formattedName.length < 2) return;

            patientsMap.set(formattedName, {
                name: formattedName,
                surgeryDate: surgeryDate,
                hospital: p.hospital, // Trust the external DB for hospital name
                controls: []
            });
        });

        // 2. Fetch ALL Events from Google Calendar to find Controls
        // We still need the raw events to find "Control" appointments
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

        const allEvents: any[] = [];
        let pageToken: string | undefined = undefined;

        // Fetch wide range
        do {
            const response: any = await calendar.events.list({
                calendarId: CALENDAR_CONFIG.calendarId,
                timeMin: '2024-01-01T00:00:00Z',
                maxResults: 2500, // Large batch
                singleEvents: true,
                orderBy: 'startTime',
                pageToken: pageToken,
            });

            if (response.data.items) {
                allEvents.push(...response.data.items);
            }
            pageToken = response.data.nextPageToken;
        } while (pageToken);


        // 3. Process Events to Find Controls
        const now = new Date();

        allEvents.forEach((event: any) => {
            const title = event.summary || '';
            const lowerTitle = title.toLocaleLowerCase('tr-TR');
            const date = event.start.dateTime?.split('T')[0] || event.start.date;

            if (!date) return;

            // Check against our Known Patients Map
            patientsMap.forEach((patient, name) => {
                const lowerName = name.toLocaleLowerCase('tr-TR');

                // Check if event title contains patient name
                // Simple inclusion check is usually enough given we have normalized names
                if (lowerTitle.includes(lowerName)) {

                    // Exclude if it's the surgery itself (same date)
                    if (date === patient.surgeryDate) return;

                    // Exclude pre-op (date <= surgery date)
                    // (Some controls might be same day but let's assume not for simplicity or > check)
                    if (new Date(date) <= new Date(patient.surgeryDate)) return;

                    // It's a control!
                    const label = calculateControlLabel(patient.surgeryDate, date);

                    // Determine Status
                    let status: 'attended' | 'cancelled' | 'planned' = 'attended';

                    // Check cancellation colors (Flamingo/Red usually for surgery but red also used for cancelled sometimes? 
                    // Classification.ts said #dc2127 or '11' is IGNORE/Cancelled
                    if (event.colorId === '11') status = 'cancelled';
                    else if (new Date(date) > now) status = 'planned';

                    if (!patient.controls) patient.controls = [];

                    // Avoid duplicates (same date)
                    if (!patient.controls.some(c => c.date === date)) {
                        patient.controls.push({
                            date,
                            status,
                            title,
                            label
                        });
                    }
                }
            });
        });

        // 4. Sort and Return
        const patientList = Array.from(patientsMap.values());

        // Sort controls
        patientList.forEach(p => {
            p.controls?.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });

        // Sort patients by surgery date desc
        patientList.sort((a, b) => new Date(b.surgeryDate).getTime() - new Date(a.surgeryDate).getTime());

        return NextResponse.json(patientList);

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
