import styles from './GradientBackground.module.css';

const GRADIENTS = {
  purple: 'linear-gradient(160deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
  green: 'linear-gradient(160deg, #059669 0%, #10b981 40%, #34d399 100%)',
};

export default function GradientBackground({ variant = 'purple', children }) {
  return (
    <div className={styles.background} style={{ background: GRADIENTS[variant] }}>
      <div className={styles.circleTopRight} />
      <div className={styles.circleBottomLeft} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
