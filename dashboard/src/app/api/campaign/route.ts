import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import { CampaignState } from '@/types';

const statePath = path.resolve(process.cwd(), '../campaign_state.json');

const DEFAULT_STATE: CampaignState = {
  status: 'running',
  pausedAt: null,
  pauseReason: null,
  stoppedAt: null,
};

export async function GET() {
  try {
    if (!fs.existsSync(statePath)) {
      return NextResponse.json(DEFAULT_STATE);
    }
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return NextResponse.json({
      status: data.status || 'running',
      pausedAt: data.pausedAt || null,
      pauseReason: data.pauseReason || null,
      stoppedAt: data.stoppedAt || null,
    });
  } catch (err: any) {
    console.error('Error reading campaign state:', err.message);
    return NextResponse.json(DEFAULT_STATE);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, reason } = body;

    let currentState = { ...DEFAULT_STATE };
    if (fs.existsSync(statePath)) {
      try {
        currentState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch {}
    }

    if (action === 'pause') {
      currentState.status = 'paused';
      currentState.pausedAt = Date.now();
      currentState.pauseReason = reason || 'Paused from dashboard';
    } else if (action === 'resume') {
      currentState.status = 'running';
      currentState.pausedAt = null;
      currentState.pauseReason = null;
      currentState.stoppedAt = null;
    } else if (action === 'stop') {
      currentState.status = 'stopped';
      currentState.stoppedAt = Date.now();
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const tempPath = statePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(currentState, null, 2), 'utf8');
    fs.renameSync(tempPath, statePath);

    return NextResponse.json({ success: true, state: currentState });
  } catch (err: any) {
    console.error('Error writing campaign state:', err.message);
    return NextResponse.json({ error: 'Failed to update campaign state' }, { status: 500 });
  }
}
