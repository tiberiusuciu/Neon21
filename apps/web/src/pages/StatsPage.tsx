import { motion } from "framer-motion";

export function StatsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Stats</h1>
      <p className="page-sub">Session and lifetime numbers will land here.</p>
      <p className="coming-soon">Coming soon</p>
    </motion.div>
  );
}
