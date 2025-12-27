'use client'
import { useRouter } from "next/navigation"
import { supabase } from "../../auth/supabaseClient/supabaseClient";
import { useEffect, useState } from "react";

export default function HomeScreen() {

    const router = useRouter();

    const [email, setEmail] = useState<string|null>(null);
    async function handleLogout() { await supabase.auth.signOut(); router.push("/auth"); }
    useEffect(() => {supabase.auth.getUser().then(({data:{user}}) => {setEmail(user?.email ?? null);});}, []);

    return(
        <div className="flex">
            <div className="min-h-screen w-75 bg-gray-900 text-white p-6">
                <h1 className="text-4xl font-bold mb-5">Alpha Royale</h1>
                <h1 className="mb-1  text-gray-300 truncate">{email}</h1>
                <button className="px-24 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium" onClick={handleLogout}>Log Out</button>
            </div>
            
            <div>
                {/* <h1>main display</h1> */}
            </div>
        </div>
    )
}