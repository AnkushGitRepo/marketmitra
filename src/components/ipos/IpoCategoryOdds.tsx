import type { CategoryView } from '@/lib/dashboard/ipoCategoryView';
import styles from './IpoCategoryOdds.module.css';

interface IpoCategoryOddsProps {
  readonly view: CategoryView;
}

/** Subscription by investor category and the estimated allotment odds for each (#285). */
export function IpoCategoryOdds({ view }: IpoCategoryOddsProps) {
  return (
    <section className={styles.block} aria-label="Subscription and allotment odds by category">
      <h3 className={styles.title}>Subscription and allotment odds by category</h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Subscribed</th>
              <th scope="col">Smallest application</th>
              <th scope="col">Estimated odds</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.subscribed}</td>
                <td>{row.minApplication}</td>
                <td>{row.odds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        {view.qib !== null && <>QIB demand {view.qib}. </>}
        {view.bestChance !== null && <>Of the two draw categories, {view.bestChance} has the better chance. </>}
        {view.asOf !== null && <>Figures as of {view.asOf} IST. </>}
        Estimates from the subscription multiple, which counts shares bid, not applicants; retail and small NII are allotted by draw, big NII
        in proportion to the bid. Not a promise, not investment advice.
      </p>
    </section>
  );
}
