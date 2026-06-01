import Image from "next/image";
import { Dashboard } from "./components/Dashboard";
import { AuthProvider } from "./components/AuthContext";

import { AuthButtons } from "./components/AuthButtons";

export default function Home() {

  return(
 <AuthProvider>
  
      <Dashboard />
    </AuthProvider>

  )
   

}
