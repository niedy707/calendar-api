
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

/**
 * Calculates control label
 */
function calculateControlLabel(surgeryDateStr: string, controlDateStr: string): string {
    const surgeryDate = new Date(surgeryDateStr);
    const controlDate = new Date(controlDateStr);
    const diffTime = controlDate.getTime() - surgeryDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '?';

    if (diffDays < 7) {
        return `${diffDays}d`;
    } else if (diffDays <= 25) {
        return `${Math.round(diffDays / 7)}w`;
    } else {
        return `${Math.round(diffDays / 30)}m`;
    }
}

export async function GET(request: NextRequest) {
    try {
        // 1. Authenticate
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

        // 2. Fetch ALL Events (e.g. from Jan 1, 2024 to present/future)
        // We need a wide range to catch past surgeries and future controls
        const allEvents: any[] = [];
        let pageToken: string | undefined = undefined;

        // Fetching...
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

        // 3. Process Events to Build Patient Database
        const patientsMap = new Map<string, Patient>();
        const now = new Date();

        // Pass 1: Identify Surgeries
        // We look for events with specific colors or keywords if we had them, OR we treat the first event of a person as surgery?
        // Actually, the user's "rinoapp" logic usually distinguished surgeries by a category or calendar ID.
        // In `events/route.ts` logic (which I saw earlier but didn't memorize fully), it categorized events.
        // Let's look for "Ameliyat" or assumption based: Surgery is usually a long block or has specific keywords.
        // But simplifying: Let's assume ANY event that looks like "Name Surname / SurgeryType" is a surgery if it matches known patterns.
        // Or simpler: We don't know surgery vs control from just title easily without the "categorizeEvent" logic.
        // Let's use `categorizeEvent` from lib if possible, or just build a robust heuristic here.

        // Let's TRY to find surgeries. 
        // Heuristic: Surgeries usually have "Rino", "Revizyon", "Otoplasti" in title OR are marked with specific colors.
        // In the previous `events` route, I saw `categorizeEvent` import. Let's rely on event structure.

        // Pass 1: Identify Surgeries
        allEvents.forEach((event: any) => {
            const title = event.summary || '';

            // Refined Surgery Detection Logic
            // 1. ColorId 4 (Flamingo) is consistently used for surgeries in the sample
            // 2. 🔪 emoji is a strong indicator
            // 3. Keywords: rino, revizyon, otoplasti, blef, tiplasti, septorin, septum, op 
            // 4. Exclude if title starts with 'm |' (Muayene?) or 'k' (Kontrol?) unless it has surgery keywords

            const isSurgeryColor = event.colorId === '4';
            const hasSurgeryEmoji = title.includes('🔪');
            const hasSurgeryKeyword = /rino|revizyon|otoplasti|blef|tiplasti|septorin|septum|^op\s/i.test(title);

            // Strong signals override weak excludes
            const isSurgery = isSurgeryColor || hasSurgeryEmoji || hasSurgeryKeyword;

            // Double check to exclude obvious controls/examinations if they accidentally match
            if (isSurgery) {
                if (/^k\d|^kontrol|botoks|dolgu/i.test(title) && !hasSurgeryEmoji) return;
            }

            if (isSurgery) {
                // Normalize Name
                // Remove prefixes like "08.00 🔪", "op ", etc.
                let cleanTitle = title
                    .replace(/^\d{2}[:.]\d{2}\s*🔪?/g, '') // Remove time + emoji prefix
                    .replace(/^op\s+/i, '') // Remove 'op ' prefix
                    .trim();

                const namePart = cleanTitle.split('/')[0].split('|')[0].trim();
                const formattedName = normalizeName(namePart);

                if (formattedName.split(' ').length < 2) return; // Skip single names

                const date = event.start.dateTime?.split('T')[0] || event.start.date;
                if (!date) return;

                // Hospital Detection
                // Default to 'Asya' based on calendar name "Rinoplasti ASYA"
                let hospital = 'Asya';

                // Override if other hospital keywords found
                if (/bht/i.test(event.location) || /bht/i.test(title)) hospital = 'BHT';
                else if (/bağcılar|medipol/i.test(event.location) || /bağcılar/i.test(title)) hospital = 'Bağcılar';
                else if (/ich/i.test(event.location) || /ich/i.test(title)) hospital = 'ICH';
                else if (/medistanbul/i.test(event.location) || /medistanbul/i.test(title)) hospital = 'Medistanbul';

                if (!patientsMap.has(formattedName)) {
                    patientsMap.set(formattedName, {
                        name: formattedName,
                        surgeryDate: date,
                        hospital,
                        controls: []
                    });
                }
            }
        });

        // Pass 2: Identify Controls for these patients
        allEvents.forEach((event: any) => {
            const title = event.summary || '';
            const lowerTitle = title.toLocaleLowerCase('tr-TR');
            const date = event.start.dateTime?.split('T')[0] || event.start.date;

            if (!date) return;

            patientsMap.forEach((patient, name) => {
                const lowerName = name.toLocaleLowerCase('tr-TR');

                // Check if event title contains patient name
                if (lowerTitle.includes(lowerName)) {
                    // Check if it's NOT the surgery itself
                    if (date === patient.surgeryDate) return;

                    // Check if date is AFTER surgery
                    if (new Date(date) <= new Date(patient.surgeryDate)) return;

                    // It's a control!
                    const label = calculateControlLabel(patient.surgeryDate, date);

                    // Status
                    let status: 'attended' | 'cancelled' | 'planned' = 'attended';
                    if (event.colorId === '11') status = 'cancelled'; // Red
                    else if (new Date(date) > now) status = 'planned';

                    if (!patient.controls) patient.controls = [];

                    // Avoid duplicates
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

        // Sort Control Arrays and Patient List
        const patientList = Array.from(patientsMap.values());

        patientList.forEach(p => {
            p.controls?.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });

        patientList.sort((a, b) => new Date(b.surgeryDate).getTime() - new Date(a.surgeryDate).getTime());

        return NextResponse.json(patientList);

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
