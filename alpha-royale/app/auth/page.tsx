'use client';
import { supabase } from "./supabaseClient/supabaseClient";
import { Auth } from '@supabase/auth-ui-react';
import styles from './page.module.css'
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    const{ data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") router.push("/home"); })
    return () => listener.subscription.unsubscribe();
  }, [router])

  function goBack() {router.push('/');}
  
  return (
    <div className="h-screen bg-[#0a0b0d] flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        <button onClick={goBack} className="text-xs font-bold text-blue-400 hover:text-blue-500 mb-8 transition-colors"> <span>&#8592;</span> Go Back</button>
        <Image src="/alpha_royal_logo.png" alt="Logo" width={250} height={250} className="mb-6 mx-auto" />
        <p className="text-gray-400 mb-8 text-center">Login or sign up to start trading</p>

        <div className={styles.authwrapper}>
          <Auth supabaseClient={supabase} providers={[]} />
        </div>
      </div>
    </div>
  );
}