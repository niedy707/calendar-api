
import { NextResponse } from 'next/server';
import { fetchCalendarEvents, updateEventDescription } from '@/lib/googleCalendar';
import { format, differenceInMonths, differenceInDays, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

// --- Types ---
interface PatientRecord {
    date: string;
    hospital: any;
    name: string;
}

// --- Helper Functions ---
async function fetchPatientDB(): Promise<PatientRecord[]> {
    // Default to localhost for dev, but in Prod this env var must be set to the Panel's Prod URL
    const panelUrl = process.env.PANEL_APP_URL || 'http://localhost:3005';
    console.log(`Fetching patient DB from: ${panelUrl}/api/patient-db`);

    try {
        const res = await fetch(`${panelUrl}/api/patient-db`, {
            next: { revalidate: 0 },
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    } catch (error) {
        console.error("Error fetching patient DB:", error);
        return [];
    }
}

// --- Fuzzy Matching Helper ---
function levenshtein(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

function findPatient(name: string, db: PatientRecord[]) {
    const cleanName = name.toLowerCase().trim();

    // Exact match first
    const exact = db.find(p => p.name.toLowerCase().trim() === cleanName);
    if (exact) return exact;

    // Fuzzy match
    let bestMatch = null;
    let minDistance = 4;

    for (const p of db) {
        const pName = p.name.toLowerCase().trim();
        const dist = levenshtein(cleanName, pName);
        if (dist <= 3 && dist < minDistance) {
            minDistance = dist;
            bestMatch = p;
        }
    }
    return bestMatch;
}

export async function GET(request: Request) {
    // Security Check: Verify CRON_SECRET if present (Strictly recommended for Prod)
    // if (process.env.CRON_SECRET) {
    //     const authHeader = request.headers.get('authorization');
    //     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //         return new NextResponse('Unauthorized', { status: 401 });
    //     }
    // }

    console.log("Starting Daily Calendar Description Update...");

    try {
        // 0. Fetch Latest Patient DB from Panel
        const patientDB = await fetchPatientDB();

        let dbSource = 'Remote API';
        if (!patientDB || patientDB.length === 0) {
            console.error("Remote Patient DB is empty or failed. Attempting fallback if needed, or aborting.");
            // Ideally we shouldn't proceed if we can't identify patients
            return NextResponse.json({ success: false, error: "Failed to load patient database from Panel" }, { status: 500 });
        }
        console.log(`Loaded ${patientDB.length} patient records from ${dbSource}.`);

        // 1. Fetch Calendar Events
        const events = await fetchCalendarEvents();
        if (!events) {
            return NextResponse.json({ message: "No events fetched from Google" }, { status: 500 });
        }

        // Target Date: Today (Turkey Time)
        const now = new Date();
        const trtNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const targetDateStr = format(trtNow, 'yyyy-MM-dd');

        console.log(`Target Date (TRT): ${targetDateStr}`);

        const targetEvents = events.filter((e: any) => {
            return e.start && e.start.startsWith(targetDateStr);
        });

        console.log(`Found ${targetEvents.length} events for ${targetDateStr}.`);

        const updates = [];

        for (const event of targetEvents) {
            const title = event.title || '';
            const lowerTitle = title.toLowerCase();

            // Skip surgery/first exam
            if (lowerTitle.includes('ameliyat') || lowerTitle.includes('ilk muayene')) continue;

            // Check Control Pattern
            const controlRegex = /^([kK]\d+|\d+[mM])\s+(.*)$/;
            const match = title.match(controlRegex);

            if (match) {
                const prefix = match[1];
                const patientName = match[2];
                const patientRecord = findPatient(patientName, patientDB);

                if (patientRecord) {
                    const surgeryDate = parseISO(patientRecord.date);
                    const eventDate = parseISO(event.start.split('T')[0]);

                    const months = differenceInMonths(eventDate, surgeryDate);
                    const days = differenceInDays(eventDate, surgeryDate);

                    let durationStr = '';
                    if (months > 0) durationStr = `${months} ay`;
                    else durationStr = `${days} gün`;

                    // Find Previous Control
                    let prevControlDateStr = 'Yok';
                    let prevControlDurationStr = '';

                    // Search existing events for previous controls
                    const pastEvents = events.filter((e: any) => {
                        if (e.id === event.id) return false;
                        const eDateStr = e.start.split('T')[0];
                        if (eDateStr >= targetDateStr) return false;

                        const t = e.title || '';
                        const m = t.match(controlRegex);
                        if (m) {
                            const pName = m[2];
                            if (levenshtein(pName.toLowerCase().trim(), patientName.toLowerCase().trim()) <= 2) return true;
                        }
                        return false;
                    }).sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime());

                    if (pastEvents.length > 0) {
                        const prevEvent = pastEvents[0];
                        const prevDate = parseISO(prevEvent.start.split('T')[0]);

                        const prevMonths = differenceInMonths(prevDate, surgeryDate);
                        const prevDays = differenceInDays(prevDate, surgeryDate);
                        let prevDur = '';
                        if (prevMonths > 0) prevDur = `${prevMonths} ay`;
                        else prevDur = `${prevDays} gün`;

                        prevControlDateStr = format(prevDate, 'dd MMMM yyyy', { locale: tr });
                        prevControlDurationStr = `(${prevDur})`;
                    }

                    const surgeryDateFormatted = format(surgeryDate, 'dd MMMM yyyy', { locale: tr });

                    const description = `👉🏻 Hastanın ameliyat tarihi: ${surgeryDateFormatted}
👉🏻 Kontrol süresi: ${durationStr}
👉🏻 bir önceki kontrol zamanı: ${prevControlDateStr} ${prevControlDurationStr}

Bu bilgiler gemini tarafından oluşturulmuştur`;

                    // Simple check to avoid redundant API calls if desc already matches?
                    // Skipping for simplicity and robustness.
                    await updateEventDescription(event.id, description);
                    updates.push({ event: title, status: 'Updated', patient: patientRecord.name });
                }
            }
        }

        return NextResponse.json({
            success: true,
            date: targetDateStr,
            source: dbSource,
            processed: targetEvents.length,
            patientDBSize: patientDB.length,
            updates: updates
        });

    } catch (error) {
        console.error("Cron Job Failed:", error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
