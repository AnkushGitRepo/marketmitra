import { Suspense } from 'react';
import {
  EMPTY_GITHUB_REPO_STATS,
  GITHUB_REPO_URL,
  fetchGithubRepoStats,
  formatGithubStat,
  type GithubRepoStats,
} from '@/lib/github/repoStats';
import { Reveal } from './Reveal';
import styles from './OpenSourceSection.module.css';

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function statItems(stats: GithubRepoStats) {
  return [
    { label: 'Stars', value: formatGithubStat(stats.stars), text: false },
    { label: 'Contributors', value: formatGithubStat(stats.contributors), text: false },
    { label: 'Licence', value: formatGithubStat(stats.licence), text: true },
    { label: 'Latest release', value: formatGithubStat(stats.latestRelease), text: true },
  ];
}

function OpenSourcePanel({ stats }: { stats: GithubRepoStats }) {
  return (
    <section id="opensource" className={styles.section}>
      <Reveal>
        <div className={styles.panel}>
          <div>
            <div className={styles.eyebrow}>Open source</div>
            <h2 className={styles.title}>Built in the open, yours to inspect</h2>
            <p className={styles.body}>
              The whole thing is public. Read the code that touches your numbers, self-host it, file
              an issue, or send a fix. Contributions are welcome from investors and builders alike.
            </p>
            <div className={styles.actions}>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className={styles.primary}>
                <GitHubIcon />
                View on GitHub
              </a>
              <a
                href={`${GITHUB_REPO_URL}/tree/main/docs`}
                target="_blank"
                rel="noreferrer"
                className={styles.secondary}
              >
                Read the docs
              </a>
            </div>
          </div>
          <div className={styles.statGrid}>
            {statItems(stats).map((stat) => {
              const missing = stat.value === '—';
              const tone = missing ? '' : stat.text ? styles.solid : styles.filled;
              return (
                <div className={styles.stat} key={stat.label}>
                  <div className={styles.statLabel}>{stat.label}</div>
                  <div className={`${styles.statValue} ${tone}`}>{stat.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

async function OpenSourcePanelLive() {
  const stats = await fetchGithubRepoStats();
  return <OpenSourcePanel stats={stats} />;
}

export function OpenSourceSection() {
  return (
    <Suspense fallback={<OpenSourcePanel stats={EMPTY_GITHUB_REPO_STATS} />}>
      <OpenSourcePanelLive />
    </Suspense>
  );
}
