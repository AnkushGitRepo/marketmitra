import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { DashboardPreview } from '@/components/landing/DashboardPreview';
import { FeaturesGrid } from '@/components/landing/FeaturesGrid';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { OpenSourceSection } from '@/components/landing/OpenSourceSection';
import { PricingCards } from '@/components/landing/PricingCards';
import { FAQAccordion } from '@/components/landing/FAQAccordion';
import { Footer } from '@/components/landing/Footer';
import { isHosted } from '@/lib/deployment-mode';
import styles from './page.module.css';

export default function Home() {
  const hosted = isHosted();

  return (
    <div className={styles.page}>
      <main>
        <div className={styles.heroBand}>
          <Navbar />
          <Hero />
          <DashboardPreview />
        </div>
        <FeaturesGrid />
        <HowItWorks />
        <div className={hosted ? undefined : styles.openSourceLast}>
          <OpenSourceSection />
        </div>
        {/* Hosted-only, per ADR 0010 — the self-hosted landing page is leaner
            (the visitor already made their choice). Both sections are free
            content now, not billing UI (ADR 0016). */}
        {hosted && <PricingCards />}
        {hosted && <FAQAccordion />}
      </main>
      <Footer />
    </div>
  );
}
