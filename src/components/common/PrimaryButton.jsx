import styles from './PrimaryButton.module.css';

export default function PrimaryButton({ children, onClick, variant = 'solid', style }) {
  return (
    <button className={`${styles.button} ${styles[variant]}`} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
