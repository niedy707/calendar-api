import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        // LOCAL CHECK (FileSystem)
        const localBasePath = path.join(process.cwd(), 'src/lib/classification.ts');
        let sourceMtime: Date | null = null;

        try {
            const sourceStats = fs.statSync(localBasePath);
            sourceMtime = sourceStats.mtime;
        } catch (e) {
            console.error('Source file not found:', e);
        }

        const localProjects = [
            { name: 'calendar-api (Local Source)', path: localBasePath },
            // Note: We check local file copies too, to see if sync script worked locally
            { name: 'panel (Local Copy)', path: path.join(process.cwd(), '../panel/src/lib/classification.ts') },
            { name: 'takvim (Local Copy)', path: path.join(process.cwd(), '../takvim/lib/classification.ts') }
        ];

        const localStatuses = localProjects.map(p => {
            try {
                const stats = fs.statSync(p.path);
                const delayMs = sourceMtime ? (sourceMtime.getTime() - stats.mtime.getTime()) : 0;
                // Delay is positive if source is deeper in future (wait, no).
                // If source is NEWER (larger timestamp) than target, result is POSITIVE. Target is behind.
                // If target is NEWER (larger timestamp) than source, result is NEGATIVE. Target is ahead? (should be 0 delay)

                return {
                    name: p.name,
                    type: 'local',
                    path: p.path,
                    exists: true,
                    lastModified: stats.mtime.toISOString(),
                    lastModifiedLocale: stats.mtime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                    delaySeconds: Math.max(0, Math.floor(delayMs / 1000))
                };
            } catch (e) {
                return {
                    name: p.name,
                    type: 'local',
                    path: p.path,
                    exists: false,
                    error: (e as Error).message,
                    delaySeconds: null
                };
            }
        });

        // LIVE CHECK (HTTP)
        const liveEndpoints = [
            { name: 'calendar-api (LIVE)', url: 'https://calendar.ibrahimyagci.com/api/version' },
            { name: 'rinoapp-panel (LIVE)', url: 'https://panel.ibrahimyagci.com/api/version' },
            { name: 'takvim (LIVE)', url: 'https://takvim.ibrahimyagci.com/api/version' }
        ];

        const liveStatuses = await Promise.all(liveEndpoints.map(async (endpoint) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

                const res = await fetch(endpoint.url, { signal: controller.signal, cache: 'no-store' });
                clearTimeout(timeoutId);

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();
                const targetDate = new Date(data.lastModified);

                // Calculate Delay
                const delayMs = sourceMtime ? (sourceMtime.getTime() - targetDate.getTime()) : 0;

                return {
                    name: endpoint.name,
                    type: 'live',
                    url: endpoint.url,
                    exists: true,
                    lastModified: data.lastModified,
                    lastModifiedLocale: data.lastModifiedLocale,
                    delaySeconds: Math.max(0, Math.floor(delayMs / 1000))
                };
            } catch (error) {
                return {
                    name: endpoint.name,
                    type: 'live',
                    url: endpoint.url,
                    exists: false,
                    error: (error as Error).message,
                    delaySeconds: null
                };
            }
        }));

        const allStatuses = [...localStatuses, ...liveStatuses];

        return NextResponse.json({
            statuses: allStatuses,
            sourceLastModified: sourceMtime ? sourceMtime.toISOString() : null
        });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
