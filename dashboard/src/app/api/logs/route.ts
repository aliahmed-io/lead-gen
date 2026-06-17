import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const logPath = path.resolve(process.cwd(), '../audit.log');
    
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ logs: [] });
    }

    // Read the file. For very large files this is inefficient, 
    // but for our purposes we'll read it and slice the last 1000 lines.
    const fileContent = fs.readFileSync(logPath, 'utf8');
    const lines = fileContent.trim().split('\n').filter(Boolean);
    
    const maxLines = 1000;
    const recentLines = lines.slice(-maxLines);

    // Parse lines: [LEVEL] YYYY-MM-DDTHH:mm:ss.sssZ - MESSAGE
    const parsedLogs = recentLines.map((line, index) => {
      const match = line.match(/^\[(.*?)\] (.*?) - (.*)$/);
      if (match) {
        return {
          id: index,
          level: match[1],
          timestamp: match[2],
          message: match[3]
        };
      }
      return {
        id: index,
        level: 'INFO',
        timestamp: '',
        message: line
      };
    }).reverse(); // Newest first

    return NextResponse.json({ logs: parsedLogs });
  } catch {
    return NextResponse.json({ error: 'Failed to read logs' }, { status: 500 });
  }
}
