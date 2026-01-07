'use client';
import { supabase } from "./supabaseClient/supabaseClient";
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import styles from './page.module.css'
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

export default function AuthPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => { 
      if (event === "SIGNED_IN") {
        setIsLoading(true);
        router.push("/home"); 
      }
    })
    return () => listener.subscription.unsubscribe();
  }, [router])

  function goBack() {
    router.push('/');
  }
  
  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard}>
        <button 
          onClick={goBack} 
          className={styles.backButton}
        >
          <span className={styles.backArrow}>&#8592;</span> 
          <span>Go Back</span>
        </button>
        
        <div className={styles.logoContainer}>
          <Image 
            src="/alpha_royal_logo.png" 
            alt="Alpha Royale Logo" 
            width={140} 
            height={140} 
            className={styles.logo}
            priority
          />
        </div>
        
        <div className={styles.headerText}>
          <h1 className={styles.title}>Welcome to Alpha Royale</h1>
          <p className={styles.subtitle}>Login or sign up to start trading</p>
        </div>

        <div className={styles.authWrapper}>
          <Auth 
            supabaseClient={supabase} 
            providers={[]}
            theme="dark"
            appearance={{
              theme: ThemeSupa,
              style: {
                button: {
                  borderRadius: '8px',
                  padding: '10px 24px',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.2s ease',
                },
                input: {
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '15px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  transition: 'all 0.2s ease',
                },
                label: {
                  fontSize: '13px',
                  fontWeight: '500',
                  marginBottom: '6px',
                  color: '#e5e7eb',
                },
                message: {
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                },
              },
              variables: {
                default: {
                  colors: {
                    brand: '#3b82f6',
                    brandAccent: '#2563eb',
                    brandButtonText: '#ffffff',
                    defaultButtonBackground: 'rgba(255, 255, 255, 0.1)',
                    defaultButtonBackgroundHover: 'rgba(255, 255, 255, 0.15)',
                    defaultButtonText: '#ffffff',
                    dividerBackground: 'rgba(255, 255, 255, 0.1)',
                    inputBackground: 'rgba(255, 255, 255, 0.05)',
                    inputBorder: 'rgba(255, 255, 255, 0.1)',
                    inputBorderFocus: '#3b82f6',
                    inputText: '#ffffff',
                    inputLabelText: '#e5e7eb',
                    inputPlaceholder: 'rgba(255, 255, 255, 0.5)',
                    messageText: '#ffffff',
                    messageTextDanger: '#ef4444',
                    anchorTextColor: '#60a5fa',
                    anchorTextHoverColor: '#93c5fd',
                  },
                  space: {
                    spaceSmall: '8px',
                    spaceMedium: '16px',
                    spaceLarge: '24px',
                    labelBottomMargin: '8px',
                    anchorBottomMargin: '4px',
                    emailInputSpacing: '12px',
                    socialAuthSpacing: '12px',
                    buttonPadding: '10px 24px',
                    inputPadding: '10px 14px',
                  },
                  fontSizes: {
                    baseBodySize: '15px',
                    baseInputSize: '15px',
                    baseLabelSize: '13px',
                    baseButtonSize: '15px',
                  },
                  radii: {
                    borderRadiusButton: '8px',
                    inputBorderRadius: '8px',
                    buttonBorderRadius: '8px',
                  },
                },
              },
            }}
          />
        </div>
        
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Signing you in...</p>
          </div>
        )}
      </div>
    </div>
  );
}