"use client";

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      zIndex: 50,
      fontFamily: 'var(--font-inter, sans-serif)',
    }}>
      <div style={{ position: 'relative', width: '64px', height: '64px', marginBottom: '24px' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '4px solid var(--border-subtle)',
            borderTopColor: 'var(--honey-600)',
          }}
        />
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)' }}>
        Loading LeadGen.IO...
      </h2>
    </div>
  );
}
