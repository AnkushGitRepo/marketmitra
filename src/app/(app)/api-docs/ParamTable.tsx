import type { Param } from './restDocs';
import { paramType } from './restDocs';
import styles from './page.module.css';

export function ParamTable({ title, params }: { title: string; params: Param[] }) {
  if (params.length === 0) return null;
  return (
    <div className={styles.docSection}>
      <p className={styles.docSectionTitle}>{title}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Required</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name}>
                <td>
                  <code className={styles.paramName}>{p.name}</code>
                </td>
                <td className={styles.paramType}>{paramType(p.schema)}</td>
                <td>{p.required ? 'Yes' : 'No'}</td>
                <td className={styles.paramDesc}>{p.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
