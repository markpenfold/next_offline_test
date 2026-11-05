import styles from './loading.module.css';

export function LoadingSpinner() {
  return (
    <div className={styles.spinnerContainer}>
      <div className={styles.spinner} />
      <span>Loading...</span>
    </div>
  );
}