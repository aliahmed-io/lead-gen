"use client";

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-10 max-w-lg mx-auto text-center">
      <div className="relative w-16 h-16 mb-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-16 h-16 rounded-full border-4 border-white/10 border-t-blue-500"
        />
      </div>
      <h2 className="text-xl font-medium text-gray-300">Loading Dashboard...</h2>
    </div>
  );
}
