
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'src/lib/classification.ts');
        const stats = fs.statSync(filePath);

        return NextResponse.json({
            project: 'calendar-api',
            lastModified: stats.mtime.toISOString(),
            lastModifiedLocale: stats.mtime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
    } catch (error) {
        return NextResponse.json({
            project: 'calendar-api',
            error: 'File not found or error reading stats'
        }, { status: 500 });
    }
}
