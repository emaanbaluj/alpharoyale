'use client'

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react";
import { supabase } from "../auth/supabaseClient/supabaseClient";

// ProtectedLayout ensures only authenticated/logged in users can access protected pages
// if a user isnt logged in, it will redirect them back to /auth

export default function ProtectedLayout({children}: {children: React.ReactNode}) {
    const router = useRouter();
    const [ldng, setLdng] = useState<boolean>(true);

    useEffect(() => {supabase.auth.getUser().then(({data: {user}}) => {if (!user) {router.push('/auth')} else {setLdng(false)}});}, [router]);
    if (ldng) return (<></>)

    return <>{children}</>
}