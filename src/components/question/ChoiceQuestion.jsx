import styles from './ChoiceQuestion.module.css';

export default function ChoiceQuestion({ options = [], multiple = false, value, onChange }) {
  const selected = value || (multiple ? [] : null);

  const handleClick = (option) => {
    if (multiple) {
      const next = Array.isArray(selected)
        ? selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option]
        : [option];
      onChange?.(next);
    } else {
      onChange?.(option);
    }
  };

  const isSelected = (option) => multiple
    ? Array.isArray(selected) && selected.includes(option)
    : selected === option;

  return (
    <div className={styles.options}>
      {options.map((option) => {
        const active = isSelected(option);
        return (
          <div
            key={option}
            className={`${styles.option} ${active ? styles.active : ''}`}
            onClick={() => handleClick(option)}
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(option); } }}
          >
            <div className={`${styles.indicator} ${multiple ? styles.checkbox : styles.radio}`}>
              {active && <div className={styles.inner} />}
            </div>
            <span className={active ? styles.activeText : ''}>{option}</span>
          </div>
        );
      })}
    </div>
  );
}
