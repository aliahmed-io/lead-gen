import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const defaultTemplates = {};
  try {
    const templatesPath = path.resolve(process.cwd(), '../templates.json');
    if (!fs.existsSync(templatesPath)) {
      return NextResponse.json(defaultTemplates);
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
    } catch {
      return NextResponse.json(defaultTemplates);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to read templates' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const templatesPath = path.resolve(process.cwd(), '../templates.json');
    let newTemplates: Record<string, { subject?: string; text?: string }> | null;
    try {
      newTemplates = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    
    if (typeof newTemplates !== 'object' || newTemplates === null || Array.isArray(newTemplates)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    
    for (const key of Object.keys(newTemplates)) {
      const template = newTemplates[key];
      if (typeof template !== 'object' || template === null) {
         return NextResponse.json({ error: `Invalid template object at key ${key}` }, { status: 400 });
      }
      if (template.subject !== undefined && typeof template.subject !== 'string') {
         return NextResponse.json({ error: `Invalid subject at key ${key}` }, { status: 400 });
      }
      if (template.text !== undefined && typeof template.text !== 'string') {
         return NextResponse.json({ error: `Invalid text at key ${key}` }, { status: 400 });
      }
    }

    fs.writeFileSync(templatesPath, JSON.stringify(newTemplates, null, 2), 'utf8');
    return NextResponse.json({ success: true, templates: newTemplates });
  } catch {
    return NextResponse.json({ error: 'Failed to save templates' }, { status: 500 });
  }
}
