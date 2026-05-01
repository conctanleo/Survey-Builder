import styles from './GlassCard.module.css';

export default function GlassCard({ children, className = '' }) {
  return <div className={`${styles.card} ${className}`}>{children}</div>;
}
