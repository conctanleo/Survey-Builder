import styles from './NavigationBar.module.css';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

export default function NavigationBar({ onPrev, onNext, prevDisabled = false, nextDisabled = false }) {
  return (
    <div className={styles.bar}>
      <button className={`${styles.nav} ${prevDisabled ? styles.disabled : ''}`} onClick={onPrev} disabled={prevDisabled}>
        <LeftOutlined /> 上一题
      </button>
      <button className={`${styles.nav} ${nextDisabled ? styles.disabled : ''}`} onClick={onNext} disabled={nextDisabled}>
        下一题 <RightOutlined />
      </button>
    </div>
  );
}
