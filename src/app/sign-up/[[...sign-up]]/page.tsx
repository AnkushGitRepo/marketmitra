import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { clerkAppearance } from '@/components/auth/clerkAppearance';
import { isHosted } from '@/lib/deployment-mode';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Sign up' };

export default function SignUpPage() {
  if (!isHosted()) {
    redirect('/dashboard');
  }

  return (
    <AuthLayout switchPrompt="Already have an account?" switchLabel="Sign in" switchHref="/sign-in">
      <div className={styles.heading}>
        <h1>Create your account</h1>
        <p>Free to start — see every holding in one place.</p>
      </div>
      {/* Reserve the widget's height: Clerk mounts async, and without this the
          card grows from empty and shoves the layout (CLS ~0.3). */}
      <div className={styles.clerkSlot}>
        <SignUp appearance={clerkAppearance} />
      </div>
    </AuthLayout>
  );
}
