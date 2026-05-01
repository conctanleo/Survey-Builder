import styles from './TextQuestion.module.css';

export default function TextQuestion({ value = '', onChange, placeholder = '请输入', maxLength = 500 }) {
  return (
    <textarea
      className={styles.textarea}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={4}
    />
  );
}
