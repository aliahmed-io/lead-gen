"use client";

import { motion } from "framer-motion";
import { Activity, Settings, Zap } from "lucide-react";

export default function LeadGen() {
  return (
    <div style={{
      padding: '40px 20px',
      maxWidth: '896px', // max-w-4xl
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      textAlign: 'center',
      fontFamily: 'var(--font-inter, sans-serif)',
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="card"
        style={{
          padding: '40px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '576px', // max-w-xl
          width: '100%',
          boxShadow: '0 4px 20px rgba(44, 34, 25, 0.015)',
        }}
      >
        <div style={{
          width: '64px',
          height: '64px',
          background: 'var(--honey-100)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          border: '1px solid var(--border-subtle)',
        }}>
          <Activity className="w-8 h-8 text-[var(--honey-500)]" />
        </div>
        
        <h1 style={{
          fontSize: '28px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '16px',
          fontFamily: 'var(--font-serif)',
          lineHeight: 1.2,
        }}>
          Lead Generation Engine
        </h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '13px',
          maxWidth: '400px',
          marginBottom: '32px',
          lineHeight: 1.6,
        }}>
          The scraper is currently configured via terminal. In the future, you can enter your search queries, target cities, and business types directly here to kick off the background Puppeteer scraping engine.
        </p>
        
        <div style={{
          background: 'var(--bg-neutral-muted)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '16px 20px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}>
          <div>
            <h3 style={{
              color: 'var(--text-primary)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              margin: 0,
            }}>
              <Zap size={14} className="text-[var(--honey-600)]" />
              Scraper Engine
            </h3>
            <p style={{
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '4px',
              margin: 0,
            }}>
              Status: Idle
            </p>
          </div>
          <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={15} /> Configure Script
          </button>
        </div>
      </motion.div>
    </div>
  );
}
