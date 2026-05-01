import styles from './ProgressBar.module.css';

export default function ProgressBar({ current, total, label }) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className={styles.wrapper}>
      <div className={styles.labels}>
        <span className={styles.label}>第 {current + 1} 题 / 共 {total} 题</span>
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
