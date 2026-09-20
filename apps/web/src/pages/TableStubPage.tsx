import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";

export function TableStubPage() {
  const { tableId } = useParams();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Table</h1>
      <p className="page-sub">
        {tableId ? `Table ${tableId}` : "Table"} — coming soon.
      </p>
      <p className="coming-soon">Table coming soon</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link to="/lobby" className="btn btn-ghost">
          Back to lobby
        </Link>
      </p>
    </motion.div>
  );
}
